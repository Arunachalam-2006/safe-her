"""
Spot Safety Router — POST /safety/spot endpoint.
Returns a real-time safety score for a single GPS location (no routing needed).
Used by the Home Page to display the user's current area safety.
"""

import logging
import asyncio
from datetime import datetime
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.overpass_service import _build_query, _categorize_elements, OVERPASS_URL
from services.weather_service import fetch_weather

router = APIRouter(prefix="/safety", tags=["safety"])


class SpotRequest(BaseModel):
    lat: float
    lng: float


def _score_spot(infra: dict, weather: dict) -> dict:
    """
    Score a single location using infrastructure + weather + time factors.
    Returns a result dict with score, risk_level, confidence, factors, and label.
    """
    WEIGHTS = {
        "lighting":  0.25,
        "police":    0.15,
        "hospital":  0.10,
        "amenities": 0.15,
        "weather":   0.15,
        "time":      0.20,
    }

    # 1. LIGHTING
    lamps = infra.get("street_lamps", 0)
    if lamps >= 15:   lighting = 1.0
    elif lamps >= 8:  lighting = 0.85
    elif lamps >= 4:  lighting = 0.70
    elif lamps >= 1:  lighting = 0.55
    else:             lighting = 0.35

    # 2. POLICE
    police = infra.get("police", 0)
    police_score = 1.0 if police >= 1 else 0.25

    # 3. HOSPITAL / CLINIC
    hospitals = infra.get("hospitals", 0) + infra.get("clinics", 0)
    hospital_score = 1.0 if hospitals >= 1 else 0.30

    # 4. AMENITIES (shops, restaurants, pharmacies, bus stops)
    amenity_total = (
        infra.get("shops", 0)
        + infra.get("restaurants", 0)
        + infra.get("pharmacies", 0)
        + infra.get("bus_stops", 0)
    )
    if amenity_total >= 10:   amenity_score = 1.0
    elif amenity_total >= 6:  amenity_score = 0.80
    elif amenity_total >= 3:  amenity_score = 0.60
    elif amenity_total >= 1:  amenity_score = 0.40
    else:                     amenity_score = 0.20

    # 5. WEATHER
    rain_mm = weather.get("rain", 0.0)
    visibility_m = weather.get("visibility", 10000.0)
    wind_kmh = weather.get("windspeed", 0.0)
    weather_code = weather.get("weathercode", 0)

    w_score = 1.0
    if rain_mm > 5:       w_score -= 0.30
    elif rain_mm > 0:     w_score -= 0.10
    if visibility_m < 1000:   w_score -= 0.30
    elif visibility_m < 5000: w_score -= 0.15
    if wind_kmh > 50:     w_score -= 0.20
    elif wind_kmh > 30:   w_score -= 0.10
    if weather_code >= 80: w_score -= 0.20
    w_score = max(0.0, w_score)

    # 6. TIME-OF-DAY
    now = datetime.now()
    hour = now.hour
    dow = now.weekday()
    if 6 <= hour <= 20:     time_score = 1.0
    elif 20 <= hour <= 22:  time_score = 0.75
    elif 22 <= hour <= 23:  time_score = 0.55
    else:                   time_score = 0.45
    if dow >= 5:
        time_score *= 0.95

    # Calculate weighted total
    factors = {
        "lighting":  lighting,
        "police":    police_score,
        "hospital":  hospital_score,
        "amenities": amenity_score,
        "weather":   w_score,
        "time":      time_score,
    }

    raw_score = sum(factors[k] * WEIGHTS[k] for k in WEIGHTS)
    final_score = int(round(raw_score * 100))
    final_score = max(0, min(100, final_score))

    # Risk level
    if final_score >= 80:   risk_level = "LOW"
    elif final_score >= 60: risk_level = "MODERATE"
    elif final_score >= 40: risk_level = "ELEVATED"
    else:                   risk_level = "HIGH"

    # Human-readable label
    is_night = hour >= 18 or hour < 6
    if final_score >= 85:
        label = "High Safety Zone"
    elif final_score >= 70:
        label = "Moderate Night Safety" if is_night else "Good Safety Zone"
    elif final_score >= 50:
        label = "Caution Advised" if is_night else "Moderate Safety"
    else:
        label = "Low Safety — Stay Alert"

    # Confidence
    total_elements = infra.get("total_elements", 0)
    confidence = 0.90
    if total_elements == 0:
        confidence = 0.50
    elif lamps == 0:
        confidence -= 0.15

    # Convert factor scores to 0-100 int range for display
    factors_display = {k: int(round(v * 100)) for k, v in factors.items()}

    return {
        "score": final_score,
        "risk_level": risk_level,
        "label": label,
        "confidence": round(max(0.5, confidence), 2),
        "factors": factors_display,
        "details": {
            "street_lamps": lamps,
            "police_nearby": police >= 1,
            "hospitals_nearby": hospitals >= 1,
            "amenity_count": amenity_total,
            "rain_mm": rain_mm,
            "visibility_m": visibility_m,
            "temperature": weather.get("temperature", 25.0),
            "hour": hour,
            "is_night": is_night,
            "is_weekend": dow >= 5,
        },
    }


@router.post("/spot")
async def spot_safety(req: SpotRequest):
    """
    Spot safety analysis — score a single GPS coordinate.
    Queries Overpass for nearby infrastructure + Open-Meteo weather,
    then returns a safety score without requiring a route.
    """
    import httpx

    try:
        # Run Overpass + Weather in parallel
        async with httpx.AsyncClient(timeout=12.0) as client:
            overpass_query = _build_query(req.lat, req.lng)

            async def fetch_overpass():
                resp = await client.post(
                    OVERPASS_URL,
                    data={"data": overpass_query},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                resp.raise_for_status()
                data = resp.json()
                elements = data.get("elements", [])
                counts = _categorize_elements(elements)
                counts["total_elements"] = len(elements)
                return counts

            weather_task = fetch_weather(req.lat, req.lng)
            overpass_task = fetch_overpass()

            results = await asyncio.wait_for(
                asyncio.gather(overpass_task, weather_task), timeout=15.0
            )

        infra = results[0]
        weather = results[1]

    except Exception as e:
        logging.warning(f"Spot safety data fetch failed: {e}")
        # Return a degraded result rather than error
        infra = {
            "street_lamps": 0, "police": 0, "hospitals": 0,
            "clinics": 0, "pharmacies": 0, "shops": 0,
            "restaurants": 0, "bus_stops": 0, "total_elements": 0,
        }
        weather = {
            "temperature": 25.0, "precipitation": 0.0, "rain": 0.0,
            "visibility": 10000.0, "windspeed": 5.0, "weathercode": 0,
            "cloudcover": 30.0,
        }

    result = _score_spot(infra, weather)
    result["lat"] = req.lat
    result["lng"] = req.lng

    return result
