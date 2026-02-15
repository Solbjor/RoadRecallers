"""
Pothole Detection FastAPI Backend with WhatsApp Integration

REQUIRED ENVIRONMENT VARIABLES:
- TWILIO_ACCOUNT_SID: Twilio account identifier
- TWILIO_AUTH_TOKEN: Twilio authentication token
- OPENAI_API_KEY: OpenAI API key for text extraction (optional, has fallback)
- OPENAI_MODEL: OpenAI model name (optional, defaults to "gpt-4o-mini")
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
import io
import os
import uuid
from datetime import datetime
from typing import Optional
import httpx
from twilio.twiml.messaging_response import MessagingResponse
from detector import PotholeDetector
from severity import severity_image, severity_text
from openai_extract import extract_pothole_report_from_text

# ========================================================
# INITIALIZATION
# ========================================================

app = FastAPI(
    title="Pothole Detection API",
    description="Binary pothole detection for MOPT Costa Rica with WhatsApp ingestion",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create uploads directory
os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Initialize detector
detector = PotholeDetector(weights_path="pothole_detector_finetuned.pth")

# In-memory report store
REPORTS: list = []

# Demo location cycling
DEMO_LOCATIONS = [
    {"lat": 9.9281, "lng": -84.0907, "province": "San José", "canton": "Central", "display": "San José (demo)"},
    {"lat": 10.0163, "lng": -84.2116, "province": "Alajuela", "canton": "Alajuela", "display": "Alajuela (demo)"},
    {"lat": 9.8644, "lng": -83.9194, "province": "Cartago", "canton": "Central", "display": "Cartago (demo)"},
    {"lat": 9.9985, "lng": -84.1165, "province": "Heredia", "canton": "Heredia", "display": "Heredia (demo)"},
    {"lat": 10.6346, "lng": -85.4400, "province": "Guanacaste", "canton": "Liberia", "display": "Liberia (demo)"}
]
demo_location_index = 0


# ========================================================
# HELPER FUNCTIONS
# ========================================================

async def download_twilio_media(url: str) -> bytes:
    """Download media from Twilio with HTTP Basic Auth."""
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    
    if not sid or not token:
        raise RuntimeError("TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN not set in this process.")
    
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        r = await client.get(
            url,
            auth=(sid, token),
            headers={"User-Agent": "RoadRecallers/1.0"}
        )
        
        if r.status_code >= 400:
            raise RuntimeError(
                f"Twilio media download failed: {r.status_code} {r.text[:200]}"
            )
        
        return r.content


def validate_and_fix_coordinates(lat: float, lng: float) -> tuple[float, float, bool]:
    """
    Validate Costa Rica coordinates and detect/fix swaps.
    Returns: (lat, lng, is_valid)
    """
    CR_LAT_MIN, CR_LAT_MAX = 8.0, 11.2
    CR_LNG_MIN, CR_LNG_MAX = -86.0, -82.5
    
    # Check if swapped
    if not (CR_LAT_MIN <= lat <= CR_LAT_MAX) and (CR_LAT_MIN <= lng <= CR_LAT_MAX):
        if (CR_LNG_MIN <= lat <= CR_LNG_MAX):
            # Likely swapped
            lat, lng = lng, lat
    
    # Validate
    if (CR_LAT_MIN <= lat <= CR_LAT_MAX) and (CR_LNG_MIN <= lng <= CR_LNG_MAX):
        return lat, lng, True
    
    return lat, lng, False


def get_next_demo_location() -> dict:
    """Get next demo location (round-robin)."""
    global demo_location_index
    loc = DEMO_LOCATIONS[demo_location_index % len(DEMO_LOCATIONS)]
    demo_location_index += 1
    return loc


def parse_coordinates_from_form(form_data: dict) -> Optional[tuple[float, float]]:
    """Attempt to extract coordinates from Twilio form data."""
    possible_lat_keys = ["Latitude", "latitude", "LocationLatitude"]
    possible_lng_keys = ["Longitude", "longitude", "LocationLongitude"]
    
    lat = None
    lng = None
    
    for key in possible_lat_keys:
        if key in form_data and form_data[key]:
            try:
                lat = float(form_data[key])
                break
            except (ValueError, TypeError):
                pass
    
    for key in possible_lng_keys:
        if key in form_data and form_data[key]:
            try:
                lng = float(form_data[key])
                break
            except (ValueError, TypeError):
                pass
    
    if lat is not None and lng is not None:
        return lat, lng
    
    return None


# ========================================================
# EXISTING ENDPOINTS
# ========================================================

@app.get("/")
def root():
    """Root endpoint."""
    return {
        "service": "Pothole Detection API",
        "version": "1.0.0",
        "status": "running",
        "backend": "pytorch",
        "whatsapp": "enabled"
    }


@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model_loaded": detector.model is not None,
        "device": str(detector.device),
        "backend": "pytorch",
        "reports_count": len(REPORTS)
    }


@app.post("/analyze")
async def analyze_image(file: UploadFile = File(...)):
    """
    Analyze an image for pothole detection.
    
    Args:
        file: Image file (jpg, png, etc.)
        
    Returns:
        {
            "pothole_detected": bool,
            "pothole_confidence": float
        }
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="File must be an image (jpg, png, etc.)"
        )
    
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        result = detector.predict(image)
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing image: {str(e)}"
        )


# ========================================================
# NEW ENDPOINTS
# ========================================================

@app.get("/reports")
def get_reports():
    """Get all reports."""
    return REPORTS


@app.post("/twilio/whatsapp")
async def whatsapp_webhook(
    From: Optional[str] = Form(None),
    Body: Optional[str] = Form(None),
    NumMedia: Optional[str] = Form(None),
    MediaUrl0: Optional[str] = Form(None),
    MediaContentType0: Optional[str] = Form(None),
    Latitude: Optional[str] = Form(None),
    Longitude: Optional[str] = Form(None),
    LocationLatitude: Optional[str] = Form(None),
    LocationLongitude: Optional[str] = Form(None)
):
    """
    Twilio WhatsApp webhook handler.
    Supports both IMAGE and TEXT-ONLY pothole reports.
    """
    twiml = MessagingResponse()
    
    # Debug prints
    print("SID present:", bool(os.getenv("TWILIO_ACCOUNT_SID")))
    print("TOKEN present:", bool(os.getenv("TWILIO_AUTH_TOKEN")))
    print("MediaUrl0:", MediaUrl0)
    print("Body:", Body)
    
    # Collect form data for coordinate parsing
    form_data = {
        "Latitude": Latitude,
        "Longitude": Longitude,
        "LocationLatitude": LocationLatitude,
        "LocationLongitude": LocationLongitude
    }
    
    # Check if media is attached
    num_media = int(NumMedia) if NumMedia else 0
    
    # ========================================
    # CASE 1: IMAGE REPORT
    # ========================================
    if num_media > 0:
        # Validate media type
        if MediaContentType0 and not MediaContentType0.startswith("image/"):
            twiml.message("Please send an image file (not a video or document).")
            return Response(content=str(twiml), media_type="text/xml")
        
        try:
            # Download image
            image_bytes = await download_twilio_media(MediaUrl0)
            image = Image.open(io.BytesIO(image_bytes))
            
            # Run detection
            result = detector.predict(image)
            pothole_detected = result["pothole_detected"]
            pothole_confidence = result["pothole_confidence"]
            
            print(f"DEBUG image detection: detected={pothole_detected}, confidence={pothole_confidence}")
            
            # Gate: reject if not a pothole
            if not pothole_detected:
                print("DEBUG image rejected - not a pothole")
                twiml.message("This does not appear to be a pothole. Please retake the photo closer to the road surface.")
                return Response(content=str(twiml), media_type="text/xml")
            
            print("DEBUG image passed detection, computing severity")
            # Compute severity using image heuristics
            severity_score, severity_details = severity_image(image, pothole_confidence)
            
            # It's a pothole - save and create report
            report_id = str(uuid.uuid4())
            
            # Save image
            image_rgb = image.convert("RGB")
            image_filename = f"{report_id}.jpg"
            image_path = os.path.join("uploads", image_filename)
            image_rgb.save(image_path, "JPEG", quality=90)
            
            # Handle location
            coords = parse_coordinates_from_form(form_data)
            
            if coords:
                lat, lng = coords
                lat, lng, is_valid = validate_and_fix_coordinates(lat, lng)
                
                if is_valid:
                    location_source = "whatsapp"
                    geo = {
                        "province": "Unknown",
                        "canton": "Unknown",
                        "display": f"{lat:.4f}, {lng:.4f}"
                    }
                else:
                    # Coords provided but invalid - use demo
                    demo_loc = get_next_demo_location()
                    lat = demo_loc["lat"]
                    lng = demo_loc["lng"]
                    location_source = "demo_fallback"
                    geo = {
                        "province": demo_loc["province"],
                        "canton": demo_loc["canton"],
                        "display": "Demo location (invalid GPS provided)"
                    }
            else:
                # No coords - use demo
                demo_loc = get_next_demo_location()
                lat = demo_loc["lat"]
                lng = demo_loc["lng"]
                location_source = "demo_fallback"
                geo = {
                    "province": demo_loc["province"],
                    "canton": demo_loc["canton"],
                    "display": "Demo location (no GPS provided)"
                }
            
            # Create report
            report = {
                "id": report_id,
                "source": "whatsapp_image",
                "from": From or "unknown",
                "createdAt": datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
                "lat": lat,
                "lng": lng,
                "locationSource": location_source,
                "pothole_detected": True,
                "pothole_confidence": pothole_confidence,
                "severity": severity_score,
                "severity_details": severity_details,
                "notes": Body or "WhatsApp image report",
                "photoUrl": f"/uploads/{image_filename}",
                "geo": geo,
                "title": "WhatsApp pothole report"
            }
            
            REPORTS.append(report)
            
            # Success response
            print(f"DEBUG sending image success reply: {int(severity_score*100)}% severity")
            twiml.message(f"Report received. Pothole detected ({int(severity_score*100)}% severity). Thank you.")
            twiml_str = str(twiml)
            print(f"DEBUG TwiML XML: {twiml_str}")
            return Response(content=twiml_str, media_type="text/xml")
            
        except RuntimeError as e:
            print(f"RuntimeError: {e}")
            import traceback
            traceback.print_exc()
            twiml.message(f"Error: {str(e)}")
            return Response(content=str(twiml), media_type="text/xml")
        except httpx.HTTPError as e:
            print(f"HTTPError: {e}")
            import traceback
            traceback.print_exc()
            twiml.message("Error downloading image. Please try again.")
            return Response(content=str(twiml), media_type="text/xml")
        except Exception as e:
            print(f"Error processing WhatsApp image: {e}")
            import traceback
            traceback.print_exc()
            twiml.message("Error processing your image. Please try again.")
            return Response(content=str(twiml), media_type="text/xml")
    
    # ========================================
    # CASE 2: TEXT-ONLY REPORT
    # ========================================
    else:
        if not Body or len(Body.strip()) < 5:
            twiml.message("Please send a photo of the road surface OR describe the pothole (size, depth, location).")
            return Response(content=str(twiml), media_type="text/xml")
        
        try:
            # Extract structured data from text using OpenAI
            extracted = await extract_pothole_report_from_text(Body)
            
            print(f"DEBUG extracted: {extracted}")
            
            # GATING: Only create report if:
            # 1. reported_presence == "present" OR is_pothole_report == true (fallback compat)
            # 2. confidence >= 0.65
            reported_presence = extracted.get("reported_presence", "uncertain")
            is_pothole = extracted.get("is_pothole_report", False)
            confidence = extracted.get("confidence", 0)
            
            print(f"DEBUG gating: presence={reported_presence}, is_pothole={is_pothole}, confidence={confidence}")
            
            if ((reported_presence != "present" and not is_pothole) or 
                confidence < 0.65):
                
                followup = extracted.get("followup_question", "")
                if not followup:
                    followup = "I couldn't confirm it's a pothole. Please send a photo OR reply with: size (small/med/large), depth (shallow/med/deep), and location (canton/province)."
                
                print(f"DEBUG sending followup: {followup}")
                twiml.message(followup)
                return Response(content=str(twiml), media_type="text/xml")
            
            print("DEBUG passed gating, creating report")
            # Compute severity from text extraction
            severity_score, severity_details = severity_text(extracted)
            
            # Handle location
            coords = parse_coordinates_from_form(form_data)
            
            # Try to parse location from text (basic province/canton matching)
            location_text = extracted.get("location_text", "").lower()
            demo_loc = None
            
            # Simple location keyword matching
            for loc in DEMO_LOCATIONS:
                if (loc["province"].lower() in location_text or 
                    loc["canton"].lower() in location_text):
                    demo_loc = loc
                    break
            
            if coords:
                lat, lng = coords
                lat, lng, is_valid = validate_and_fix_coordinates(lat, lng)
                
                if is_valid:
                    location_source = "whatsapp"
                    geo = {
                        "province": "Unknown",
                        "canton": "Unknown",
                        "display": f"{lat:.4f}, {lng:.4f}"
                    }
                else:
                    # Invalid coords - use demo
                    if not demo_loc:
                        demo_loc = get_next_demo_location()
                    lat = demo_loc["lat"]
                    lng = demo_loc["lng"]
                    location_source = "demo_fallback"
                    geo = {
                        "province": demo_loc["province"],
                        "canton": demo_loc["canton"],
                        "display": demo_loc["display"]
                    }
            else:
                # No coords - use demo (prefer text location if found)
                if not demo_loc:
                    demo_loc = get_next_demo_location()
                lat = demo_loc["lat"]
                lng = demo_loc["lng"]
                location_source = "demo_fallback"
                geo = {
                    "province": demo_loc["province"],
                    "canton": demo_loc["canton"],
                    "display": demo_loc["display"]
                }
            
            # Create text report
            report_id = str(uuid.uuid4())
            report = {
                "id": report_id,
                "source": "whatsapp_text",
                "from": From or "unknown",
                "createdAt": datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
                "lat": lat,
                "lng": lng,
                "locationSource": location_source,
                "pothole_detected": True,
                "pothole_confidence": extracted.get("confidence", 0.65),
                "severity": severity_score,
                "severity_details": severity_details,
                "notes": Body,
                "photoUrl": None,
                "geo": geo,
                "title": "WhatsApp text report"
            }
            
            REPORTS.append(report)
            
            # Success response
            print(f"DEBUG sending text success reply: {int(severity_score*100)}% severity")
            twiml.message(f"Report received (text report, {int(severity_score*100)}% severity). Thank you!")
            twiml_str = str(twiml)
            print(f"DEBUG TwiML XML: {twiml_str}")
            return Response(content=twiml_str, media_type="text/xml")
            
        except Exception as e:
            print(f"Error processing WhatsApp text: {e}")
            import traceback
            traceback.print_exc()
            twiml.message("Error processing your report. Please try sending a photo instead.")
            return Response(content=str(twiml), media_type="text/xml")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
