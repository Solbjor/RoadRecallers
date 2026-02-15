"""
OpenAI Responses API Client for Structured Pothole Report Extraction
Uses JSON schema (Structured Outputs) for guaranteed parsing.
"""

import os
import json
import re
from typing import Optional
import httpx


def check_negation(text: str) -> bool:
    """
    Check if text contains negation patterns indicating NO pothole.
    Returns True if negation detected.
    """
    text_lower = text.lower()
    
    negation_patterns = [
        r"\bno pothole",
        r"\bnot a pothole",
        r"\bdidn'?t see (a |any )?pothole",
        r"\bdon'?t see (a |any )?pothole",
        r"\bno hay bache",
        r"\bno vi un bache",
        r"\bno es un bache",
        r"\bsin bache",
        r"\bno bache",
        r"\bnot pothole",
        r"\bno damage",
        r"\bno holes?",
        r"\bno hueco",
    ]
    
    for pattern in negation_patterns:
        if re.search(pattern, text_lower):
            return True
    
    return False


EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "is_pothole_report": {"type": "boolean"},
        "reported_presence": {"type": "string", "enum": ["present", "absent", "uncertain"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "severity_hint": {"type": "string", "enum": ["low", "medium", "high"]},
        "impact": {"type": "string", "enum": ["none", "vehicle_damage", "crash_or_injury", "unknown"]},
        "hazards": {
            "type": "array",
            "items": {
                "type": "string",
                "enum": [
                    "tire_damage_risk",
                    "flooding",
                    "near_bridge",
                    "traffic_blocking",
                    "accident_risk",
                    "deep_hole",
                    "sharp_edges",
                    "wheel_loss",
                    "vehicle_disabled"
                ]
            }
        },
        "size_hint": {"type": "string", "enum": ["small", "medium", "large", "unknown"]},
        "depth_hint": {"type": "string", "enum": ["shallow", "medium", "deep", "unknown"]},
        "road_context": {"type": "string"},
        "location_text": {"type": "string"},
        "evidence": {
            "type": "object",
            "properties": {
                "mentions_pothole_explicitly": {"type": "boolean"},
                "mentions_damage_outcome_explicitly": {"type": "boolean"},
                "mentions_size_explicitly": {"type": "boolean"},
                "mentions_depth_explicitly": {"type": "boolean"},
                "mentions_location_explicitly": {"type": "boolean"}
            },
            "required": [
                "mentions_pothole_explicitly",
                "mentions_damage_outcome_explicitly",
                "mentions_size_explicitly",
                "mentions_depth_explicitly",
                "mentions_location_explicitly"
            ],
            "additionalProperties": False
        },
        "needs_followup": {"type": "boolean"},
        "followup_question": {"type": "string"}
    },
    "required": [
        "is_pothole_report",
        "reported_presence",
        "confidence",
        "severity_hint",
        "impact",
        "hazards",
        "size_hint",
        "depth_hint",
        "road_context",
        "location_text",
        "evidence",
        "needs_followup",
        "followup_question"
    ],
    "additionalProperties": False
}


SYSTEM_PROMPT = """You are a structured data extractor for pothole road damage reports.
Extract ONLY the requested fields from the user's message. Return JSON only.

CRITICAL RULES:

1. NEGATION HANDLING:
   If the user says they did NOT see a pothole or there is NO pothole:
   - reported_presence = "absent"
   - is_pothole_report = false
   - confidence <= 0.2
   - Set all evidence flags to false

2. EVIDENCE FLAGS (set true ONLY if explicitly stated):
   - mentions_pothole_explicitly: true if text contains "pothole", "bache", "hueco", "hole", "crack"
   - mentions_damage_outcome_explicitly: true if mentions damage like "tire blew", "wheel came off", "car damaged"
   - mentions_size_explicitly: true if states "small", "large", "big", "pequeño", "grande", etc.
   - mentions_depth_explicitly: true if states "deep", "shallow", "profundo", "hondo", etc.
   - mentions_location_explicitly: true if states province, canton, street name, landmark

3. DO NOT GUESS OR INFER:
   - If location not mentioned, location_text = "" (empty string)
   - If size not mentioned, size_hint = "unknown"
   - If depth not mentioned, depth_hint = "unknown"

4. reported_presence:
   - "present" = user confirms pothole exists
   - "absent" = user says no pothole / didn't see one
   - "uncertain" = unclear/ambiguous

5. impact:
   - "vehicle_damage" if mentions: tire loss, wheel damage, rim damage, vehicle stuck/disabled, car fell into hole, vehicle damaged, suspension damage, undercarriage damage
   - "crash_or_injury" if mentions accident, crash, injury, collision
   - "none" if no damage mentioned
   - "unknown" if unclear

6. hazards (add if text mentions):
   - "wheel_loss" if mentions lost tire, blew tire, tire came off, wheel came off
   - "vehicle_disabled" if mentions car stuck, vehicle disabled, can't move
   - tire_damage_risk, flooding, near_bridge, traffic_blocking, accident_risk, deep_hole, sharp_edges

7. confidence:
   - High (0.8-1.0) if clear explicit description with evidence
   - Medium (0.5-0.79) if some details but missing key info
   - Low (0.2-0.49) if vague or uncertain
   - Very low (<0.2) if negation or no pothole

Be strict. Do not hallucinate data."""


async def extract_pothole_report_from_text(text: str) -> dict:
    """
    Extract structured pothole report data from text using OpenAI Responses API.
    Falls back to keyword scoring if OpenAI fails.
    
    Returns dict matching EXTRACTION_SCHEMA.
    """
    # Negation precheck
    if check_negation(text):
        return {
            "is_pothole_report": False,
            "reported_presence": "absent",
            "confidence": 0.15,
            "severity_hint": "low",
            "impact": "none",
            "hazards": [],
            "size_hint": "unknown",
            "depth_hint": "unknown",
            "road_context": "",
            "location_text": "",
            "evidence": {
                "mentions_pothole_explicitly": False,
                "mentions_damage_outcome_explicitly": False,
                "mentions_size_explicitly": False,
                "mentions_depth_explicitly": False,
                "mentions_location_explicitly": False
            },
            "needs_followup": True,
            "followup_question": "It sounds like you're saying there is no pothole. If you meant there is one, please send a photo or describe it."
        }
    
    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    
    if not api_key:
        print("OPENAI_API_KEY not set, using fallback")
        return _fallback_keyword_extraction(text)
    
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": text}
                    ],
                    "response_format": {
                        "type": "json_schema",
                        "json_schema": {
                            "name": "pothole_extraction",
                            "strict": True,
                            "schema": EXTRACTION_SCHEMA
                        }
                    },
                    "temperature": 0.1,
                    "max_tokens": 600
                }
            )
            
            if response.status_code != 200:
                print(f"OpenAI API error: {response.status_code}, falling back to keyword extraction")
                return _fallback_keyword_extraction(text)
            
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            extracted = json.loads(content)
            
            # Validate confidence range
            extracted["confidence"] = max(0.0, min(1.0, extracted.get("confidence", 0.5)))
            
            return extracted
            
    except Exception as e:
        print(f"OpenAI extraction failed: {e}, using fallback")
        return _fallback_keyword_extraction(text)


def _fallback_keyword_extraction(text: str) -> dict:
    """
    Simple keyword-based extraction fallback when OpenAI unavailable.
    Returns dict matching schema with basic heuristics.
    """
    text_lower = text.lower()
    
    # Negation check in fallback too
    if check_negation(text):
        return {
            "is_pothole_report": False,
            "reported_presence": "absent",
            "confidence": 0.15,
            "severity_hint": "low",
            "impact": "none",
            "hazards": [],
            "size_hint": "unknown",
            "depth_hint": "unknown",
            "road_context": "",
            "location_text": "",
            "evidence": {
                "mentions_pothole_explicitly": False,
                "mentions_damage_outcome_explicitly": False,
                "mentions_size_explicitly": False,
                "mentions_depth_explicitly": False,
                "mentions_location_explicitly": False
            },
            "needs_followup": True,
            "followup_question": "It sounds like you're saying there is no pothole. If you meant there is one, please send a photo or describe it."
        }
    
    # Keywords
    pothole_keywords = ["pothole", "bache", "hueco", "hole", "crack", "grieta", "damage", "daño"]
    size_large = ["large", "big", "grande", "enorme", "huge"]
    size_small = ["small", "little", "pequeño", "chico"]
    depth_deep = ["deep", "profundo", "hondo"]
    depth_shallow = ["shallow", "superficial"]
    
    vehicle_damage_keywords = [
        "lost a tire", "blew a tire", "wheel came off", "tire came off", "rim", 
        "car fell into", "vehicle disabled", "vehicle stuck", "car stuck",
        "fell into", "dropped into", "car damaged", "vehicle damaged",
        "suspension", "undercarriage", "axle", "strut", "bent rim",
        "lots of damage", "massive damage", "severe damage", "extensive damage",
        "perdió una llanta", "se le salió la llanta", "se reventó la llanta",
        "se cayó en el hueco", "se quedó pegado", "neumático reventado",
        "carro dañado", "vehículo dañado", "mucho daño"
    ]
    
    crash_keywords = ["accident", "crash", "collision", "injury", "accidente", "choque", "lesión"]
    
    hazard_map = {
        "tire_damage_risk": ["tire", "llanta", "pinchaz", "flat"],
        "flooding": ["water", "flood", "agua", "inundación"],
        "near_bridge": ["bridge", "puente"],
        "traffic_blocking": ["block", "bloquea", "traffic", "tráfico"],
        "accident_risk": ["accident", "danger", "peligro", "accidente"],
        "wheel_loss": ["lost tire", "blew tire", "wheel came off", "tire came off", "perdió llanta", "reventó llanta"],
        "vehicle_disabled": ["vehicle disabled", "vehicle stuck", "car stuck", "se quedó pegado"]
    }
    
    # Evidence flags
    mentions_pothole = any(kw in text_lower for kw in pothole_keywords)
    mentions_size = any(kw in text_lower for kw in size_large + size_small)
    mentions_depth = any(kw in text_lower for kw in depth_deep + depth_shallow)
    mentions_damage = any(kw in text_lower for kw in vehicle_damage_keywords + crash_keywords)
    
    # Detect pothole
    is_pothole = mentions_pothole
    reported_presence = "present" if is_pothole else "uncertain"
    confidence = 0.70 if is_pothole else 0.40
    
    # Impact detection
    impact = "unknown"
    if any(kw in text_lower for kw in crash_keywords):
        impact = "crash_or_injury"
    elif any(kw in text_lower for kw in vehicle_damage_keywords):
        impact = "vehicle_damage"
    elif not mentions_damage:
        impact = "none"
    
    # Detect hazards
    hazards = []
    for hazard, keywords in hazard_map.items():
        if any(kw in text_lower for kw in keywords):
            hazards.append(hazard)
    
    # Size hint
    size_hint = "unknown"
    if mentions_size:
        if any(kw in text_lower for kw in size_large):
            size_hint = "large"
        elif any(kw in text_lower for kw in size_small):
            size_hint = "small"
    
    # Depth hint
    depth_hint = "unknown"
    if mentions_depth:
        if any(kw in text_lower for kw in depth_deep):
            depth_hint = "deep"
        elif any(kw in text_lower for kw in depth_shallow):
            depth_hint = "shallow"
    
    # Severity hint
    if impact == "crash_or_injury" or depth_hint == "deep" or size_hint == "large" or len(hazards) >= 2:
        severity_hint = "high"
    elif depth_hint == "shallow" and size_hint == "small":
        severity_hint = "low"
    else:
        severity_hint = "medium"
    
    # Needs followup if not confident
    needs_followup = not is_pothole or confidence < 0.65
    
    return {
        "is_pothole_report": is_pothole,
        "reported_presence": reported_presence,
        "confidence": confidence,
        "severity_hint": severity_hint,
        "impact": impact,
        "hazards": hazards,
        "size_hint": size_hint,
        "depth_hint": depth_hint,
        "road_context": "",
        "location_text": "",
        "evidence": {
            "mentions_pothole_explicitly": mentions_pothole,
            "mentions_damage_outcome_explicitly": mentions_damage,
            "mentions_size_explicitly": mentions_size,
            "mentions_depth_explicitly": mentions_depth,
            "mentions_location_explicitly": False
        },
        "needs_followup": needs_followup,
        "followup_question": "Please send a photo or describe: size (small/medium/large), depth (shallow/medium/deep), and location (canton/province)."
    }
