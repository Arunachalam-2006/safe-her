"""
Community Reports Router — POST /reports and GET /reports.

Stores anonymous community hazard reports. Reports are kept in an in-memory
store (no personal identifiers are persisted) — swap `_REPORTS` for a database
insert/select when one is available.
"""

import time
import math
import logging
from typing import Optional
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/reports", tags=["reports"])

# In-memory store. Newest first. Personal identifiers are intentionally dropped.
_REPORTS: list[dict] = []
_MAX_REPORTS = 500


class ReportIn(BaseModel):
    category: str
    location_label: str
    details: Optional[str] = ""
    lat: Optional[float] = None
    lng: Optional[float] = None
    has_photo: bool = False


def _haversine_km(lat1, lng1, lat2, lng2) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.post("")
async def create_report(report: ReportIn):
    """Store a new anonymous community report and return the stored record."""
    record = {
        "id": f"report-{int(time.time() * 1000)}",
        "category": report.category.strip() or "Other",
        "location_label": report.location_label.strip(),
        "details": (report.details or "").strip(),
        "lat": report.lat,
        "lng": report.lng,
        "has_photo": bool(report.has_photo),
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z",
    }
    _REPORTS.insert(0, record)
    del _REPORTS[_MAX_REPORTS:]
    logging.info(f"[reports] stored {record['category']} @ {record['location_label']}")
    return {"ok": True, "report": record}


@router.get("")
async def list_reports(lat: Optional[float] = None, lng: Optional[float] = None,
                       radius_km: float = 25.0, limit: int = 50):
    """
    Return community reports, newest first. If lat/lng are given, only reports
    with coordinates within `radius_km` (plus reports without coordinates) are returned.
    """
    if lat is None or lng is None:
        return {"reports": _REPORTS[:limit]}

    nearby = []
    for r in _REPORTS:
        if r.get("lat") is None or r.get("lng") is None:
            nearby.append(r)
            continue
        if _haversine_km(lat, lng, r["lat"], r["lng"]) <= radius_km:
            nearby.append(r)
    return {"reports": nearby[:limit]}
