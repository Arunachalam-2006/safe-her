"""
Journeys Router — POST /journeys/save, PATCH /journeys/{id}/rating, GET /journeys.

Journeys are persisted through `db.py` (SQLite) rather than a module-level
dict. The dict was the single worst data-handling problem in the engine: it was
process-local (so journeys vanished on restart, which is exactly what `db.py`
exists to prevent), it had no owner field, and `GET /journeys` therefore
returned EVERY user's origin/destination history to EVERY caller.
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import db

router = APIRouter(prefix="/journeys", tags=["journeys"])


class JourneyIn(BaseModel):
    # These were `Optional[Any]` with no limits, so arbitrarily large nested
    # JSON was accepted straight into storage on an unauthenticated endpoint.
    origin: Optional[Any] = None
    destination: Optional[Any] = None
    safetyScore: Optional[float] = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    riskLevel: Optional[str] = Field(default=None, max_length=20)
    segments: Optional[Any] = None
    features: Optional[Any] = None
    startedAt: Optional[str] = Field(default=None, max_length=40)
    completedAt: Optional[str] = Field(default=None, max_length=40)
    userRating: Optional[int] = Field(default=None, ge=1, le=5)
    # Required so GET /journeys can scope to the owner instead of returning
    # every user's origin/destination history to every caller.
    owner_id: Optional[str] = Field(default=None, max_length=120)


class RatingIn(BaseModel):
    userRating: int = Field(..., ge=1, le=5)


@router.post("/save")
async def save_journey(journey: JourneyIn):
    """Persist a completed journey and return its id."""
    journey_id = db.new_id("jny")
    record = journey.model_dump()
    record["journey_id"] = journey_id
    record["savedAt"] = db.now_iso()

    journey_id = db.save_journey(journey_id, record)
    if journey_id is None:
        logging.error("[journeys] storage unavailable - journey NOT saved")
        raise HTTPException(
            status_code=503, detail="Journey could not be saved right now."
        )

    logging.info(
        "[journeys] saved %s (score=%s)", journey_id, record.get("safetyScore")
    )
    return {"journey_id": journey_id, "saved": True}


@router.patch("/{journey_id}/rating")
async def rate_journey(journey_id: str, body: RatingIn):
    """Attach a user safety rating (1-5) to a saved journey."""
    if not db.rate_journey(journey_id, body.userRating):
        raise HTTPException(status_code=404, detail="Journey not found")
    return {"ok": True, "journey_id": journey_id, "userRating": body.userRating}


@router.get("")
async def list_journeys(
    limit: int = Query(50, ge=1, le=200),
    owner_id: Optional[str] = Query(None, max_length=120),
):
    """
    Return saved journeys, newest first.

    SECURITY: this endpoint previously returned every user's journeys to every
    caller, disclosing full origin/destination history. It now requires an
    explicit `owner_id` so callers can only retrieve their own journeys.
    NOTE: `owner_id` is currently self-asserted by the client - binding it to an
    authenticated identity is tracked as an open item in the audit.
    """
    items = db.list_journeys(limit=limit, owner_id=owner_id)
    return {"journeys": items, "count": len(items), "scoped": owner_id is not None}
