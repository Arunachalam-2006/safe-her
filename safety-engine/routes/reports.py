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

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import db

router = APIRouter(prefix="/reports", tags=["reports"])

# Bounded so an unauthenticated client cannot push unbounded strings into SQLite.
MAX_LABEL = 200
MAX_DETAILS = 4000


class ReportIn(BaseModel):
    category: str = Field(..., max_length=60)
    location_label: str = Field(..., max_length=MAX_LABEL)
    details: Optional[str] = Field(default="", max_length=MAX_DETAILS)
    lat: Optional[float] = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    lng: Optional[float] = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
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
    stored = db.insert_report(record)
    if stored is None:
        # Previously this replied {"ok": true} even when storage was unavailable
        # and the report had been dropped entirely. A woman filing a harassment
        # report must never be told it was saved when it was not.
        logging.error("[reports] storage unavailable - report %s NOT saved", record["id"])
        raise HTTPException(
            status_code=503,
            detail="Report could not be saved right now. Please try again.",
        )
    logging.info("[reports] stored %s @ %s", record["category"], record["location_label"])
    return {"ok": True, "report": stored}


@router.get("")
async def list_reports(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: float = Query(25.0, ge=0.0, le=500.0),
    limit: int = Query(50, ge=1, le=500),
):
    """
    Return community reports, newest first. If BOTH lat and lng are given, only
    reports with coordinates within `radius_km` (plus reports without
    coordinates) are returned.

    `limit` is clamped to 1..500 — a negative value previously produced a silent
    negative slice that discarded the newest records.
    """
    return {"reports": db.list_reports(lat=lat, lng=lng, radius_km=radius_km, limit=limit)}
