"""
Journeys Router — POST /journeys/save, PATCH /journeys/{id}/rating, GET /journeys.

Replaces the old (nonexistent) Node service on localhost:3000. Completed journeys
are stored in an in-memory store — swap `_JOURNEYS` for a database when available.
"""

import time
import logging
from typing import Optional, Any
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/journeys", tags=["journeys"])

_JOURNEYS: dict[str, dict] = {}
_MAX_JOURNEYS = 500


class JourneyIn(BaseModel):
    origin: Optional[Any] = None
    destination: Optional[Any] = None
    safetyScore: Optional[float] = None
    riskLevel: Optional[str] = None
    segments: Optional[Any] = None
    features: Optional[Any] = None
    startedAt: Optional[str] = None
    completedAt: Optional[str] = None
    userRating: Optional[int] = None


class RatingIn(BaseModel):
    userRating: int


@router.post("/save")
async def save_journey(journey: JourneyIn):
    """Persist a completed journey and return its id."""
    journey_id = f"jny_{int(time.time() * 1000)}"
    record = journey.model_dump()
    record["journey_id"] = journey_id
    record["savedAt"] = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"
    _JOURNEYS[journey_id] = record

    if len(_JOURNEYS) > _MAX_JOURNEYS:
        oldest = next(iter(_JOURNEYS))
        del _JOURNEYS[oldest]

    logging.info(f"[journeys] saved {journey_id} (score={record.get('safetyScore')})")
    return {"journey_id": journey_id, "saved": True}


@router.patch("/{journey_id}/rating")
async def rate_journey(journey_id: str, body: RatingIn):
    """Attach a user safety rating (1-5) to a saved journey."""
    record = _JOURNEYS.get(journey_id)
    if not record:
        raise HTTPException(status_code=404, detail="Journey not found")
    if not 1 <= body.userRating <= 5:
        raise HTTPException(status_code=422, detail="Rating must be between 1 and 5")
    record["userRating"] = body.userRating
    return {"ok": True, "journey_id": journey_id, "userRating": body.userRating}


@router.get("")
async def list_journeys(limit: int = 50):
    """Return saved journeys, newest first."""
    items = sorted(_JOURNEYS.values(), key=lambda j: j.get("savedAt", ""), reverse=True)
    return {"journeys": items[:limit]}
