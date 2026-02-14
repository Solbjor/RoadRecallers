"""
Pothole Detection FastAPI Backend
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import io
from detector import PotholeDetector

# Initialize FastAPI
app = FastAPI(
    title="Pothole Detection API",
    description="Binary pothole detection for MOPT Costa Rica",
    version="1.0.0"
)

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize detector
# TODO: Update with your trained weights path
detector = PotholeDetector(weights_path="pothole_detector_finetuned.pth")


@app.get("/")
def root():
    """Root endpoint."""
    return {
        "service": "Pothole Detection API",
        "version": "1.0.0",
        "status": "running",
        "backend": "pytorch"
    }
    return {
        "service": "Pothole Detection API",
        "version": "1.0.0",
        "status": "running"
    }


@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "model_loaded": detector.model is not None,
        "device": str(detector.device),
        "backend": "pytorch"
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
    # Validate content type
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="File must be an image (jpg, png, etc.)"
        )
    
    try:
        # Read image
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        # Run inference
        result = detector.predict(image)
        
        return result
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing image: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
