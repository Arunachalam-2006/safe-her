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

from fastapi import APIRouter, HTTPException
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
    type: str = "ACTION"
    action_type: Optional[str] = None
    to_status: Optional[str] = None
    notes: str = ""
    resolution_notes: Optional[str] = None
    assigned_to: Optional[str] = None
    assigned_department: Optional[str] = None
    priority: Optional[str] = None
    has_evidence: bool = False
    officer: str = ""
    department: str = ""


class SosUpdateIn(BaseModel):
    status: str
    notes: str = ""
    officer: str = ""


# ── Reports ────────────────────────────────────────────────────────────

@router.get("/reports")
async def list_government_reports(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = 200,
):
    """List reports for the officer dashboard."""
    reports = db.list_reports(limit=max(1, min(int(limit or 200), 500)))

    if status and status.upper() != "ALL":
        want = status.upper()
        reports = [r for r in reports if r["status"] == want]

    if priority and priority.upper() != "ALL":
        want = priority.upper()
        reports = [r for r in reports if r["priority"] == want]

    if q:
        term = q.strip().lower()
        if term:
            reports = [
                r
                for r in reports
                if term
                in " ".join(
                    str(x).lower()
                    for x in (r["id"], r["category"], r["location_label"], r["details"])
                    if x
                )
            ]

    rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    reports.sort(key=lambda r: (rank.get(r["priority"], 9), r["created_at"]), reverse=False)
    reports.sort(key=lambda r: (rank.get(r["priority"], 9),), reverse=False)

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


@router.post("/sos/{alert_id}")
async def update_sos(alert_id: str, payload: SosUpdateIn):
    status = (payload.status or "").upper()
    allowed = {"ACTIVE", "ACKNOWLEDGED", "RESPONDING", "RESOLVED"}
    if status not in allowed:
        raise HTTPException(status_code=422, detail=f"Invalid SOS status '{status}'")

    alert = db.update_sos_alert(alert_id, status, payload.notes, payload.officer)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True, "alert": alert}


@router.post("/sos")
async def ingest_sos(payload: dict):
    """
    Intake endpoint for a citizen device reporting an active SOS session.

    NOTE: the citizen app does not yet call this. Until it does, this endpoint
    simply returns an empty feed. It exists so the officer side is complete and
    so a future citizen-side change needs no backend work.
    """
    alert_id = payload.get("session_id") or db.new_id("sos")
    alert = db.upsert_sos_alert(
        {
            "id": alert_id,
            "status": "ACTIVE",
            "priority": "CRITICAL",
            "lat": payload.get("lat"),
            "lng": payload.get("lng"),
            "accuracy": payload.get("accuracy"),
            "contact_count": payload.get("contact_count") or 0,
            "notes": payload.get("notes", "") or "",
            "received_at": payload.get("received_at") or db.now_iso(),
        }
    )
    return {"ok": True, "alert": alert}
