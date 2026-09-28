"""
Government / officer router.

Everything the officer dashboard needs, in one place:

    GET  /government/reports              list (filter by status, priority, q)
    GET  /government/reports/{id}         detail incl. action history
    POST /government/reports/{id}/actions status change / action / assign / close
    GET  /government/stats                dashboard counters
    GET  /government/sos                  active SOS alerts
    POST /government/sos/{id}             acknowledge / respond / resolve

Citizen endpoints under /reports are untouched by this module.

SECURITY NOTE
-------------
This router currently has no authentication, matching the rest of the engine.
It is bound to localhost for local development. Do NOT expose it publicly
without adding an officer auth dependency — see the audit report.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

import db

router = APIRouter(prefix="/government", tags=["government"])

VALID_STATUS = {"NEW", "UNDER_REVIEW", "ACTION_TAKEN", "RESOLVED", "CLOSED"}
VALID_PRIORITY = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}

# Only these transitions are legal. Anything else is rejected with 409.
ALLOWED_TRANSITIONS = {
    "NEW": {"UNDER_REVIEW", "ACTION_TAKEN", "RESOLVED", "CLOSED"},
    "UNDER_REVIEW": {"ACTION_TAKEN", "RESOLVED", "CLOSED"},
    "ACTION_TAKEN": {"RESOLVED", "CLOSED"},
    "RESOLVED": {"CLOSED"},
    "CLOSED": set(),
}


class ActionIn(BaseModel):
    # Length limits added: these strings were previously unbounded free text
    # written straight into SQLite on an unauthenticated endpoint.
    type: str = Field("ACTION", max_length=40)
    action_type: Optional[str] = Field(None, max_length=60)
    to_status: Optional[str] = Field(None, max_length=20)
    notes: str = Field("", max_length=4000)
    resolution_notes: Optional[str] = Field(None, max_length=4000)
    assigned_to: Optional[str] = Field(None, max_length=120)
    assigned_department: Optional[str] = Field(None, max_length=120)
    priority: Optional[str] = Field(None, max_length=20)
    has_evidence: bool = False
    officer: str = Field("", max_length=120)
    department: str = Field("", max_length=120)


class SosUpdateIn(BaseModel):
    status: str = Field(..., max_length=20)
    notes: str = Field("", max_length=4000)
    officer: str = Field("", max_length=120)


class SosIngestIn(BaseModel):
    """
    Typed intake model for citizen-originated SOS alerts.

    This was a bare `dict`, so there was no coordinate validation, no length
    limits, and an attacker-controlled `session_id` was used directly as the
    PRIMARY KEY (a non-string value makes sqlite3 raise InterfaceError).
    """
    session_id: Optional[str] = Field(None, max_length=120)
    lat: float = Field(..., ge=-90.0, le=90.0, allow_inf_nan=False)
    lng: float = Field(..., ge=-180.0, le=180.0, allow_inf_nan=False)
    accuracy: Optional[float] = Field(None, ge=0.0, le=100000.0, allow_inf_nan=False)
    contact_count: int = Field(0, ge=0, le=100)
    status: str = Field("ACTIVE", max_length=20)
    notes: str = Field("", max_length=4000)


# ── Reports ────────────────────────────────────────────────────────────

@router.get("/reports")
async def list_government_reports(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(200, ge=1, le=500),
):
    """List reports for the officer dashboard."""
    # Filters are applied in SQL, not after the row limit. Previously the newest
    # `limit` rows were fetched and only then filtered, so `?priority=CRITICAL`
    # returned an empty list whenever the newest 200 happened to be MEDIUM.
    reports = db.list_reports(
        limit=limit,
        status=status.upper() if status and status.upper() != "ALL" else None,
        priority=priority.upper() if priority and priority.upper() != "ALL" else None,
        search=q,
    )

    rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    # Newest first WITHIN each priority bucket.
    # The previous code sorted by (rank, created_at) and then re-sorted by
    # (rank,) alone; because the second sort is stable it preserved the
    # ascending created_at order, listing the OLDEST CRITICAL alert first.
    # Python's sort is stable, so the second pass keeps the first pass's order.
    reports.sort(key=lambda r: str(r.get("created_at") or ""), reverse=True)
    reports.sort(key=lambda r: rank.get(r["priority"], 9))

    return {"reports": reports, "count": len(reports)}


@router.get("/reports/{report_id}")
async def get_government_report(report_id: str):
    """Full report detail including officer action history."""
    report = db.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return {"report": report}


@router.post("/reports/{report_id}/actions")
async def record_action(report_id: str, payload: ActionIn):
    """
    Record an officer action and apply any resulting status change.

    Invalid status transitions are rejected with 409 rather than silently
    corrupting the workflow.
    """
    report = db.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    current = report["status"]
    target = (payload.to_status or "").upper() or None

    if payload.priority and payload.priority.upper() not in VALID_PRIORITY:
        raise HTTPException(status_code=422, detail="Invalid priority value")

    if target:
        if target not in VALID_STATUS:
            raise HTTPException(status_code=422, detail=f"Invalid status '{target}'")
        if target != current and target not in ALLOWED_TRANSITIONS.get(current, set()):
            raise HTTPException(
                status_code=409,
                detail=f"Cannot move a report from {current} to {target}",
            )

    updates = {}
    if target and target != current:
        updates["status"] = target
    if payload.assigned_to is not None:
        updates["assigned_to"] = payload.assigned_to or None
    if payload.assigned_department is not None:
        updates["assigned_department"] = payload.assigned_department or None
    if payload.priority:
        updates["priority"] = payload.priority.upper()
    if payload.resolution_notes:
        updates["resolution_notes"] = payload.resolution_notes
    elif target in ("RESOLVED", "CLOSED") and payload.notes:
        updates["resolution_notes"] = payload.notes

    db.add_action(
        {
            "id": db.new_id("act"),
            "report_id": report_id,
            "type": payload.type,
            "action_type": payload.action_type,
            "from_status": current,
            "to_status": target or current,
            "notes": payload.notes,
            "officer": payload.officer,
            "department": payload.department,
            "has_evidence": payload.has_evidence,
            "created_at": db.now_iso(),
        }
    )

    if updates:
        db.update_report(report_id, **updates)

    logging.info(
        f"[gov] {payload.type} on {report_id} by {payload.officer or 'officer'}"
    )
    return {"ok": True, "report": db.get_report(report_id)}


# ── Stats ──────────────────────────────────────────────────────────────

@router.get("/stats")
async def stats():
    return {"stats": db.report_stats()}


# ── SOS ────────────────────────────────────────────────────────────────

@router.get("/sos")
async def list_sos(include_resolved: bool = False):
    return {"alerts": db.list_sos_alerts(include_resolved=include_resolved)}


# SOS alert state machine. Previously absent entirely, so `RESOLVED -> ACTIVE`
# was legal and anyone could un-resolve a live distress alert.
ALLOWED_SOS_TRANSITIONS = {
    "ACTIVE": {"ACKNOWLEDGED", "RESPONDING", "RESOLVED"},
    "ACKNOWLEDGED": {"RESPONDING", "RESOLVED"},
    "RESPONDING": {"RESOLVED", "ACKNOWLEDGED"},
    "RESOLVED": set(),
}


@router.post("/sos/{alert_id}")
async def update_sos(alert_id: str, payload: SosUpdateIn):
    status = (payload.status or "").upper()
    allowed = set(ALLOWED_SOS_TRANSITIONS)
    if status not in allowed:
        raise HTTPException(status_code=422, detail=f"Invalid SOS status '{status}'")

    existing = db.get_sos_alert(alert_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Alert not found")

    current = (existing.get("status") or "ACTIVE").upper()
    if status != current and status not in ALLOWED_SOS_TRANSITIONS.get(current, set()):
        raise HTTPException(
            status_code=409,
            detail=f"Cannot move an SOS alert from {current} to {status}",
        )

    alert = db.update_sos_alert(alert_id, status, payload.notes, payload.officer)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True, "alert": alert}


@router.post("/sos")
async def ingest_sos(payload: SosIngestIn):
    """
    Intake endpoint for a citizen device reporting an active SOS session.

    NOTE: the citizen app did not call this at all, so the officer SOS feed
    could never be populated. It now accepts a validated, typed payload.
    """
    alert_id = payload.session_id or db.new_id("sos")
    alert = db.upsert_sos_alert(
        {
            "id": alert_id,
            "status": (payload.status or "ACTIVE").upper(),
            "priority": "CRITICAL",
            "lat": payload.lat,
            "lng": payload.lng,
            "accuracy": payload.accuracy,
            "contact_count": payload.contact_count,
            "notes": payload.notes or "",
            "received_at": db.now_iso(),
        }
    )
    if not alert:
        raise HTTPException(status_code=503, detail="Storage unavailable, alert not recorded")
    return {"ok": True, "alert": alert}
