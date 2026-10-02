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
# Evidence is a list of small {uri, ...} objects; cap the count and the length
# of each string so an unauthenticated client cannot push an unbounded blob
# into SQLite through this field.
MAX_EVIDENCE_ITEMS = 10
MAX_EVIDENCE_FIELD = 512


def _sanitize_evidence(items: Optional[list[dict]]) -> list[dict]:
    """
    Keep only plain string fields, truncated, on a bounded number of items.

    The column is stored as JSON text, so anything JSON-serialisable would
    "work" — but that is exactly how a report row ends up holding a megabyte of
    attacker-supplied JSON. Unknown/oversized values are dropped, not coerced.
    """
    if not items:
        return []
    clean: list[dict] = []
    for item in items[:MAX_EVIDENCE_ITEMS]:
        if not isinstance(item, dict):
            continue
        entry = {
            key: (value[:MAX_EVIDENCE_FIELD] if isinstance(value, str) else value)
            for key, value in item.items()
            if isinstance(value, str) and value.strip()
        }
        if entry:
            clean.append(entry)
    return clean


class ReportIn(BaseModel):
    category: str = Field(..., max_length=60)
    location_label: str = Field(..., max_length=MAX_LABEL)
    details: Optional[str] = Field(default="", max_length=MAX_DETAILS)
    lat: Optional[float] = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    lng: Optional[float] = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    has_photo: bool = False
    # Optional, additive. A client that omits this (every build before evidence
    # upload existed) keeps working byte-for-byte: the field defaults to an
    # empty list and the stored value is identical to the previous hardcoded
    # "evidence": [].
    #
    # Shape is a list of objects carrying the Supabase Storage object path,
    # e.g. [{"uri": "reports/<random>.jpg"}] — the same shape the government
    # dashboard already renders via `item.uri`. No new table, no new column:
    # this lands in the existing reports.evidence TEXT column.
    evidence: Optional[list[dict]] = None


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
        # Reuse the existing column. When the client sends no evidence (every
        # older build, and every report without a photo) this is still exactly
        # the `[]` that was hardcoded here before.
        "evidence": _sanitize_evidence(report.evidence),
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
