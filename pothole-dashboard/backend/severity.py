"""
Unified Severity Scoring for Pothole Reports
Option 1: Deterministic heuristic-based scoring for both images and text.
"""

import numpy as np
from PIL import Image
from typing import Dict, Any


def severity_image(image: Image.Image, pothole_confidence: float) -> tuple[float, Dict[str, Any]]:
    """
    Compute severity score for image-based pothole reports.
    
    Args:
        image: PIL Image
        pothole_confidence: 0..1 from detector
    
    Returns:
        (severity_score, details_dict)
    """
    # Convert to grayscale for analysis
    gray = image.convert('L')
    
    # Center crop to focus on pothole area (50% of image)
    w, h = gray.size
    left = w // 4
    top = h // 4
    right = 3 * w // 4
    bottom = 3 * h // 4
    center_crop = gray.crop((left, top, right, bottom))
    
    # Size score: proxy via dark pixel ratio in center crop
    pixels = np.array(center_crop)
    dark_threshold = np.percentile(pixels, 30)  # Bottom 30% darkness
    dark_ratio = np.sum(pixels < dark_threshold) / pixels.size
    size_score = min(1.0, dark_ratio * 2.5)  # Scale up, cap at 1.0
    
    # Texture score: variance measure (roughness/damage indicator)
    # Using Laplacian-like edge variance without OpenCV
    try:
        # Simple gradient variance as texture proxy
        grad_x = np.abs(np.diff(pixels, axis=1))
        grad_y = np.abs(np.diff(pixels, axis=0))
        edge_variance = np.std(grad_x) + np.std(grad_y)
        texture_score = min(1.0, edge_variance / 80.0)  # Normalize
    except:
        texture_score = 0.5  # Fallback
    
    # Combined severity
    severity = 0.50 * pothole_confidence + 0.30 * size_score + 0.20 * texture_score
    severity = max(0.0, min(1.0, severity))  # Clamp
    
    details = {
        "confidence": pothole_confidence,
        "size_score": round(size_score, 3),
        "texture_score": round(texture_score, 3),
        "method": "image_heuristic"
    }
    
    return severity, details


def severity_text(extracted: Dict[str, Any]) -> tuple[float, Dict[str, Any]]:
    """
    Compute severity score for text-based pothole reports.
    
    Args:
        extracted: dict from OpenAI extraction with keys:
            - confidence: 0..1
            - severity_hint: "low" | "medium" | "high"
            - size_hint: "small" | "medium" | "large" | "unknown"
            - depth_hint: "shallow" | "medium" | "deep" | "unknown"
            - hazards: list of hazard strings
            - impact: "none" | "vehicle_damage" | "crash_or_injury" | "unknown"
    
    Returns:
        (severity_score, details_dict)
    """
    confidence = extracted.get("confidence", 0.5)
    
    # Severity hint prior
    severity_map = {"low": 0.30, "medium": 0.55, "high": 0.80}
    prior = severity_map.get(extracted.get("severity_hint", "medium"), 0.55)
    
    # Size hint
    size_hint = extracted.get("size_hint", "unknown")
    size_map = {"small": 0.25, "medium": 0.55, "large": 0.85, "unknown": 0.45}
    size_score = size_map.get(size_hint, 0.45)
    
    # Depth hint
    depth_hint = extracted.get("depth_hint", "unknown")
    depth_map = {"shallow": 0.30, "medium": 0.60, "deep": 0.90, "unknown": 0.45}
    depth_score = depth_map.get(depth_hint, 0.45)
    
    # Hazard boosts (additive, capped)
    hazards = extracted.get("hazards", [])
    hazard_boost = 0.0
    hazard_weights = {
        "tire_damage_risk": 0.10,
        "traffic_blocking": 0.10,
        "accident_risk": 0.10,
        "near_bridge": 0.07,
        "flooding": 0.07,
        "deep_hole": 0.08,
        "sharp_edges": 0.08,
        "wheel_loss": 0.12,
        "vehicle_disabled": 0.12
    }
    
    for hazard in hazards:
        hazard_boost += hazard_weights.get(hazard, 0.0)
    
    hazard_boost = min(0.30, hazard_boost)  # Cap total boost
    
    # Base severity calculation with emphasis on extreme values
    base_severity = 0.45 * prior + 0.25 * size_score + 0.20 * depth_score + hazard_boost
    
    # Boost for extreme size/depth combinations
    if size_hint == "large" and depth_hint == "deep":
        base_severity = min(1.0, base_severity + 0.15)
    elif size_hint == "large" or depth_hint == "deep":
        base_severity = min(1.0, base_severity + 0.08)
    
    # Apply confidence multiplier (reliability weighting)
    reliability_mult = 0.70 + 0.30 * confidence
    severity = base_severity * reliability_mult
    
    # Impact-based severity floor (CRITICAL - overrides all)
    impact = extracted.get("impact", "unknown")
    if impact == "crash_or_injury":
        severity = max(severity, 0.90)
    elif impact == "vehicle_damage" or "wheel_loss" in hazards or "vehicle_disabled" in hazards:
        severity = max(severity, 0.80)
    
    severity = max(0.0, min(1.0, severity))  # Clamp
    
    details = {
        "confidence": confidence,
        "severity_hint": extracted.get("severity_hint"),
        "size_hint": extracted.get("size_hint"),
        "depth_hint": extracted.get("depth_hint"),
        "impact": impact,
        "hazards": hazards,
        "hazard_boost": round(hazard_boost, 3),
        "method": "text_heuristic"
    }
    
    return severity, details
