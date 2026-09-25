"""
Safe Hubs Router — POST /safety/hubs endpoint.
Returns real, named nearby safe hubs (police, hospitals, clinics, pharmacies)
with distances, plus infrastructure counts for the Home "safety around you" card.
"""

import logging
from fastapi import APIRouter
from pydantic import BaseModel

from services.overpass_service import fetch_nearby_places

router = APIRouter(prefix="/safety", tags=["safety"])


class HubsRequest(BaseModel):
    lat: float
    lng: float


@router.post("/hubs")
async def nearby_hubs(req: HubsRequest):
    """
    Return nearby safe hubs + infrastructure counts for a single GPS location.
    On failure returns an empty (but well-formed) payload so the UI degrades gracefully.
    """
    try:
        result = await fetch_nearby_places(req.lat, req.lng)
    except Exception as e:
        logging.warning(f"Nearby hubs fetch failed: {e}")
        result = {"hubs": [], "counts": {}}

    hubs = result.get("hubs", [])
    counts = result.get("counts", {})

    return {
        "lat": req.lat,
        "lng": req.lng,
        "hubs": hubs[:20],
        "nearest": hubs[0] if hubs else None,
        "counts": {
            "street_lamps": counts.get("street_lamps", 0),
            "police": counts.get("police", 0),
            "hospitals": counts.get("hospitals", 0),
            "clinics": counts.get("clinics", 0),
            "pharmacies": counts.get("pharmacies", 0),
            "bus_stops": counts.get("bus_stops", 0),
            "total_elements": counts.get("total_elements", 0),
        },
    }
