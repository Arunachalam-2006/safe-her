"""
Community Reports Router — POST /reports and GET /reports.

Citizen-facing contract is UNCHANGED: same request model, same response shape.
The only difference is that records are now persisted to SQLite (see `db.py`)
and carry extra server-side workflow fields (`status`, `priority`, ...) that
the citizen app simply ignores. The government dashboard reads those fields
through the separate `/government/*` router.

Reports are still anonymous: no personal identifiers are stored.
"""

import logging
import time
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

import db

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportIn(BaseModel):
    category: str
    location_label: str
    details: Optional[str] = ""
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    has_photo: bool = False


@router.post("")
async def create_report(report: ReportIn):
    """Store a new anonymous community report and return the stored record."""
    record = {
        "id": db.new_id("report"),
        "category": report.category.strip() or "Other",
        "location_label": report.location_label.strip(),
        "details": (report.details or "").strip(),
        "lat": report.lat,
        "lng": report.lng,
        "has_photo": bool(report.has_photo),
        "evidence": [],
        "created_at": db.now_iso(),
        "status": "NEW",       # government workflow default
        "priority": "MEDIUM",  # government workflow default
    }
    db.insert_report(record)
    logging.info(f"[reports] stored {record['category']} @ {record['location_label']}")
    return {"ok": True, "report": record}


@router.get("")
async def list_reports(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: float = 25.0,
    limit: int = 50,
):
    """
    Return community reports, newest first. If lat/lng are given, only reports
    with coordinates within `radius_km` (plus reports without coordinates) are
    returned.

    `limit` is clamped to 1..500 — a negative value previously produced a silent
    negative slice that discarded the newest records.
    """
    return {"reports": db.list_reports(lat=lat, lng=lng, radius_km=radius_km, limit=limit)}
