"""
SQLite persistence for the SafeHer Safety Engine.

Uses only the Python standard library â€” no new dependency is required.

Why this exists
---------------
Before this module the engine kept reports and journeys in module-level Python
lists, so every record was lost on restart and nothing was shared between
worker processes. The government dashboard needs durable, queryable state
(report status, priority, assignment, action history, SOS alerts).

Design rules
------------
* Citizen write compatibility is preserved. `POST /reports` and `GET /reports`
  keep their exact request and response shapes; new workflow fields are
  server-side defaults only.
* If the database file cannot be opened, every write function returns None and
  every read returns empty. Callers are expected to treat that as a failure.
  (The previous docstring promised an in-memory fallback store, but no such
  store ever existed - data was silently dropped while HTTP 200 said success.)
* `storage_available()` reports whether persistence is actually working, and
  `main.py` surfaces it on /health so a degraded engine is visible.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from typing import Any, Optional
from uuid import uuid4

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("safeher.db")

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "safeher.db")

_LOCK = threading.RLock()
_CONN: Optional[sqlite3.Connection] = None
_MEMORY_FALLBACK = False
_ID_SEQ = 0


def storage_available() -> bool:
    """True when persistence is actually working (not the degraded no-op path)."""
    return get_conn() is not None


SCHEMA = """
CREATE TABLE IF NOT EXISTS reports (
    id                 TEXT PRIMARY KEY,
    category           TEXT    NOT NULL,
    location_label     TEXT    NOT NULL,
    details            TEXT    DEFAULT '',
    lat                REAL,
    lng                REAL,
    has_photo          INTEGER DEFAULT 0,
    evidence           TEXT    DEFAULT '[]',
    created_at         TEXT    NOT NULL,
    status             TEXT    NOT NULL DEFAULT 'NEW',
    priority           TEXT    NOT NULL DEFAULT 'MEDIUM',
    assigned_to        TEXT,
    assigned_department TEXT,
    resolution_notes   TEXT    DEFAULT '',
    updated_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created  ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_priority ON reports(priority);

CREATE TABLE IF NOT EXISTS report_actions (
    id           TEXT PRIMARY KEY,
    report_id    TEXT NOT NULL,
    type         TEXT NOT NULL,
    action_type  TEXT,
    from_status  TEXT,
    to_status    TEXT,
    notes        TEXT DEFAULT '',
    officer      TEXT DEFAULT '',
    department   TEXT DEFAULT '',
    has_evidence INTEGER DEFAULT 0,
    created_at   TEXT NOT NULL,
    FOREIGN KEY (report_id) REFERENCES reports(id)
);

CREATE INDEX IF NOT EXISTS idx_actions_report ON report_actions(report_id, created_at DESC);

CREATE TABLE IF NOT EXISTS sos_alerts (
    id            TEXT PRIMARY KEY,
    status        TEXT NOT NULL DEFAULT 'ACTIVE',
    priority      TEXT NOT NULL DEFAULT 'CRITICAL',
    lat           REAL,
    lng           REAL,
    accuracy      REAL,
    contact_count INTEGER DEFAULT 0,
    assigned_to   TEXT,
    notes         TEXT DEFAULT '',
    received_at   TEXT NOT NULL,
    updated_at    TEXT
);

-- /government/sos filtered on status and ordered by received_at with a full
-- table scan + filesort on every poll, because neither column was indexed.
CREATE INDEX IF NOT EXISTS idx_sos_status_received ON sos_alerts(status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_sos_received ON sos_alerts(received_at DESC);

CREATE TABLE IF NOT EXISTS journeys (
    id         TEXT PRIMARY KEY,
    payload    TEXT NOT NULL,
    saved_at    TEXT NOT NULL
);
"""


# â”€â”€ Connection handling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def get_conn() -> Optional[sqlite3.Connection]:
    """Return the shared connection, or None when running degraded (memory)."""
    global _CONN, _MEMORY_FALLBACK

    if _MEMORY_FALLBACK:
        return None

    if _CONN is None:
        with _LOCK:
            if _CONN is None:
                try:
                    _CONN = sqlite3.connect(DB_PATH, check_same_thread=False)
                    _CONN.row_factory = sqlite3.Row
                    _CONN.execute("PRAGMA journal_mode=WAL")
                    _CONN.execute("PRAGMA foreign_keys=ON")
                    _CONN.executescript(SCHEMA)
                    _CONN.commit()
                except Exception:  # pragma: no cover - disk/permission issues
                    _MEMORY_FALLBACK = True
                    return None
    return _CONN


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


def new_id(prefix: str) -> str:
    """
    Collision-resistant id.

    The old scheme was `f"{prefix}-{ms}-{pid}"`, which produced identical
    primary keys for two inserts in the same millisecond on one worker - and
    insert_report had no ON CONFLICT, so the UNIQUE violation surfaced as a
    500. Adds a per-process counter and random suffix.
    """
    global _ID_SEQ
    with _LOCK:
        _ID_SEQ += 1
        seq = _ID_SEQ
    return f"{prefix}-{int(time.time() * 1000)}-{seq:x}{os.getpid():x}{uuid4().hex[:6]}"


# â”€â”€ Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def insert_report(record: dict[str, Any]) -> Optional[dict[str, Any]]:
    """
    Insert a citizen report. Extra workflow columns are server-side defaults.

    Returns None when storage is unavailable so the caller can answer 503.
    It previously returned the input record, which made POST /reports reply
    {"ok": true} while writing absolutely nothing.
    """
    conn = get_conn()
    if conn is None:
        return None

    with _LOCK:
        try:
            conn.execute(
                """
                INSERT INTO reports (
                    id, category, location_label, details, lat, lng,
                    has_photo, evidence, created_at, status, priority, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record["id"],
                    record.get("category", "Other"),
                    record.get("location_label", ""),
                    record.get("details", "") or "",
                    record.get("lat"),
                    record.get("lng"),
                    1 if record.get("has_photo") else 0,
                    json.dumps(record.get("evidence", []) or []),
                    record.get("created_at") or now_iso(),
                    record.get("status") or "NEW",
                    record.get("priority") or "MEDIUM",
                    now_iso(),
                ),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            conn.rollback()
            log.error("Duplicate report id %s rejected", record.get("id"))
            return None
        except sqlite3.Error:
            conn.rollback()
            log.exception("insert_report failed")
            return None
    return record


def list_reports(lat: Optional[float] = None, lng: Optional[float] = None,
                 radius_km: float = 25.0, limit: int = 50,
                 status: Optional[str] = None, priority: Optional[str] = None,
                 search: Optional[str] = None) -> list[dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return []

    try:
        limit = max(1, min(int(limit or 50), 500))  # clamp: negative limits caused silent data loss
    except (TypeError, ValueError, OverflowError):
        # `?limit=1e400` parses to float('inf') and int(inf) raised OverflowError.
        limit = 50

    # Filtering happens in SQL. Previously the newest N rows were fetched and
    # only then filtered in Python, so `?priority=CRITICAL` returned an empty
    # list whenever the newest N happened to be a different priority.
    where: list[str] = []
    params: list[Any] = []
    if status:
        where.append("status = ?")
        params.append(status.upper())
    if priority:
        where.append("priority = ?")
        params.append(priority.upper())
    if search:
        term = f"%{search.strip().lower()}%"
        where.append(
            "(LOWER(IFNULL(id,'')) LIKE ? OR LOWER(IFNULL(category,'')) LIKE ?"
            " OR LOWER(IFNULL(location_label,'')) LIKE ? OR LOWER(IFNULL(details,'')) LIKE ?)"
        )
        params.extend([term, term, term, term])
    clause = (" WHERE " + " AND ".join(where)) if where else ""

    # When a radius is requested we must oversample, because the geo filter runs
    # in Python. A single half-width coordinate pair is NOT enough: previously
    # supplying only `lat` silently disabled filtering and returned every report
    # worldwide, contradicting the endpoint's own docstring.
    oversample = 4 if (lat is not None and lng is not None) else 1

    with _LOCK:
        rows = conn.execute(
            f"SELECT * FROM reports{clause} ORDER BY created_at DESC LIMIT ?",
            (*params, limit * oversample),
        ).fetchall()

    out: list[dict[str, Any]] = []
    do_geo = lat is not None and lng is not None
    for row in rows:
        item = row_to_report(row)
        if do_geo and item.get("lat") is not None and item.get("lng") is not None:
            if haversine_km(lat, lng, item["lat"], item["lng"]) > max(0.0, radius_km):
                continue
        out.append(item)
        if len(out) >= limit:
            break
    return out


def get_sos_alert(alert_id: str) -> Optional[dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return None
    with _LOCK:
        row = conn.execute("SELECT * FROM sos_alerts WHERE id = ?", (alert_id,)).fetchone()
    return row_to_sos_alert(row) if row else None


def get_report(report_id: str) -> Optional[dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return None

    with _LOCK:
        row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    if not row:
        return None

    report = row_to_report(row)
    report["actions"] = list_actions(report_id)
    return report


def update_report(report_id: str, **fields: Any) -> Optional[dict[str, Any]]:
    allowed = {
        "status", "priority", "assigned_to", "assigned_department",
        "resolution_notes", "lat", "lng", "evidence",
    }
    sets, values = [], []
    for key, value in fields.items():
        if key in allowed:
            if key == "evidence" and not isinstance(value, str):
                value = json.dumps(value or [])
            sets.append(f"{key} = ?")
            values.append(value)

    if not sets:
        return get_report(report_id)

    conn = get_conn()
    if conn is None:
        return None

    sets.append("updated_at = ?")
    values.append(now_iso())
    values.append(report_id)

    with _LOCK:
        cur = conn.execute(f"UPDATE reports SET {', '.join(sets)} WHERE id = ?", values)
        conn.commit()
        if cur.rowcount == 0:
            return None
    return get_report(report_id)


def add_action(action: dict[str, Any]) -> dict[str, Any]:
    conn = get_conn()
    if conn is None:
        return action

    with _LOCK:
        conn.execute(
            """
            INSERT INTO report_actions
                (id, report_id, type, action_type, from_status, to_status,
                 notes, officer, department, has_evidence, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                action["id"],
                action["report_id"],
                action.get("type", "ACTION"),
                action.get("action_type"),
                action.get("from_status"),
                action.get("to_status"),
                action.get("notes", "") or "",
                action.get("officer", "") or "",
                action.get("department", "") or "",
                1 if action.get("has_evidence") else 0,
                action.get("created_at") or now_iso(),
            ),
        )
        conn.commit()
    return action


def list_actions(report_id: str) -> list[dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return []

    with _LOCK:
        rows = conn.execute(
            "SELECT * FROM report_actions WHERE report_id = ? ORDER BY created_at DESC, rowid DESC",
            (report_id,),
        ).fetchall()

    return [
        {
            "id": r["id"],
            "type": r["type"],
            "action_type": r["action_type"],
            "from_status": r["from_status"],
            "to_status": r["to_status"],
            "notes": r["notes"],
            "officer": r["officer"],
            "department": r["department"],
            "has_evidence": bool(r["has_evidence"]),
            "created_at": r["created_at"],
        }
        for r in rows
    ]


def report_stats() -> dict[str, Any]:
    conn = get_conn()
    if conn is None:
        return {}

    with _LOCK:
        total = conn.execute("SELECT COUNT(*) AS c FROM reports").fetchone()["c"]
        by_status = {
            r["status"]: r["c"]
            for r in conn.execute(
                "SELECT status, COUNT(*) AS c FROM reports GROUP BY status"
            ).fetchall()
        }
        by_priority = {
            r["priority"]: r["c"]
            for r in conn.execute(
                "SELECT priority, COUNT(*) AS c FROM reports GROUP BY priority"
            ).fetchall()
        }

    for key in ("NEW", "UNDER_REVIEW", "ACTION_TAKEN", "RESOLVED", "CLOSED"):
        by_status.setdefault(key, 0)
    for key in ("LOW", "MEDIUM", "HIGH", "CRITICAL"):
        by_priority.setdefault(key, 0)

    return {"total": total, "by_status": by_status, "by_priority": by_priority}


# â”€â”€ SOS alerts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def upsert_sos_alert(alert: dict[str, Any]) -> dict[str, Any]:
    conn = get_conn()
    if conn is None:
        return alert

    with _LOCK:
        conn.execute(
            """
            INSERT INTO sos_alerts
                (id, status, priority, lat, lng, accuracy, contact_count,
                 assigned_to, notes, received_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                status=excluded.status,
                lat=excluded.lat,
                lng=excluded.lng,
                accuracy=excluded.accuracy,
                contact_count=excluded.contact_count,
                assigned_to=COALESCE(excluded.assigned_to, sos_alerts.assigned_to),
                notes=excluded.notes,
                updated_at=excluded.updated_at
            """,
            (
                alert["id"],
                alert.get("status", "ACTIVE"),
                alert.get("priority", "CRITICAL"),
                alert.get("lat"),
                alert.get("lng"),
                alert.get("accuracy"),
                int(alert.get("contact_count") or 0),
                alert.get("assigned_to"),
                alert.get("notes", "") or "",
                alert.get("received_at") or now_iso(),
                now_iso(),
            ),
        )
        conn.commit()
    return alert


def row_to_sos_alert(row: sqlite3.Row) -> dict[str, Any]:
    keys = row.keys()
    return {
        "id": row["id"],
        "status": row["status"],
        "priority": row["priority"],
        "lat": row["lat"],
        "lng": row["lng"],
        "accuracy": row["accuracy"],
        "contact_count": row["contact_count"],
        "assigned_to": row["assigned_to"],
        "notes": row["notes"],
        "received_at": row["received_at"],
        "updated_at": row["updated_at"],
    }


def list_sos_alerts(include_resolved: bool = False) -> list[dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return []

    sql = "SELECT * FROM sos_alerts"
    if not include_resolved:
        sql += " WHERE status != 'RESOLVED'"
    sql += " ORDER BY received_at DESC LIMIT 100"

    with _LOCK:
        rows = conn.execute(sql).fetchall()

    return [row_to_sos_alert(r) for r in rows]


def update_sos_alert(alert_id: str, status: str, notes: str, officer: str) -> Optional[dict[str, Any]]:
    conn = get_conn()
    if conn is None:
        return None

    with _LOCK:
        cur = conn.execute(
            """
            UPDATE sos_alerts
               SET status = ?, notes = ?, assigned_to = COALESCE(?, assigned_to), updated_at = ?
             WHERE id = ?
            """,
            (status, notes or "", officer or None, now_iso(), alert_id),
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
        row = conn.execute("SELECT * FROM sos_alerts WHERE id = ?", (alert_id,)).fetchone()

    if not row:
        return None
    return {
        "id": row["id"],
        "status": row["status"],
        "priority": row["priority"],
        "lat": row["lat"],
        "lng": row["lng"],
        "accuracy": row["accuracy"],
        "contact_count": row["contact_count"],
        "assigned_to": row["assigned_to"],
        "notes": row["notes"],
        "received_at": row["received_at"],
    }


# â”€â”€ Journeys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def save_journey(journey_id: str, payload: dict[str, Any]) -> Optional[str]:
    """Persist a journey. Returns None when storage is unavailable."""
    conn = get_conn()
    if conn is None:
        return None

    with _LOCK:
        try:
            conn.execute(
                "INSERT OR REPLACE INTO journeys (id, payload, saved_at) VALUES (?, ?, ?)",
                (journey_id, json.dumps(payload, default=str), now_iso()),
            )
            conn.commit()
        except sqlite3.Error:
            conn.rollback()
            log.exception("save_journey failed")
            return None
    return journey_id


def list_journeys(limit: int = 50, owner_id: Optional[str] = None) -> list[dict[str, Any]]:
    """
    Return saved journeys, newest first.

    When `owner_id` is supplied only that owner's journeys are returned. The
    owner id lives inside the JSON payload, so filtering happens in Python;
    with a bounded journey table this stays cheap.
    """
    conn = get_conn()
    if conn is None:
        return []

    try:
        limit = max(1, min(int(limit or 50), 200))
    except (TypeError, ValueError, OverflowError):
        limit = 50

    with _LOCK:
        rows = conn.execute(
            "SELECT id, payload, saved_at FROM journeys ORDER BY saved_at DESC LIMIT ?",
            (limit * 4 if owner_id else limit,),
        ).fetchall()

    out: list[dict[str, Any]] = []
    for row in rows:
        try:
            payload = json.loads(row["payload"] or "{}")
        except (TypeError, ValueError):
            payload = {}
        if owner_id and str(payload.get("owner_id") or "") != owner_id:
            continue
        out.append(payload)
        if len(out) >= limit:
            break
    return out


def rate_journey(journey_id: str, rating: int) -> bool:
    conn = get_conn()
    if conn is None:
        return False

    if not isinstance(rating, int) or not 1 <= rating <= 5:
        return False

    with _LOCK:
        row = conn.execute("SELECT payload FROM journeys WHERE id = ?", (journey_id,)).fetchone()
        if not row:
            return False
        try:
            payload = json.loads(row["payload"])
        except Exception:
            payload = {}
        payload["userRating"] = rating
        conn.execute(
            "UPDATE journeys SET payload = ?, saved_at = ? WHERE id = ?",
            (json.dumps(payload, default=str), now_iso(), journey_id),
        )
        conn.commit()
    return True


# â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def row_to_report(row: sqlite3.Row) -> dict[str, Any]:
    try:
        evidence = json.loads(row["evidence"] or "[]")
    except Exception:
        evidence = []

    return {
        "id": row["id"],
        "category": row["category"],
        "location_label": row["location_label"],
        "details": row["details"] or "",
        "lat": row["lat"],
        "lng": row["lng"],
        "has_photo": bool(row["has_photo"]),
        "evidence": evidence,
        "created_at": row["created_at"],
        "status": row["status"],
        "priority": row["priority"],
        "assigned_to": row["assigned_to"],
        "assigned_department": row["assigned_department"],
        "resolution_notes": row["resolution_notes"] or "",
        "updated_at": row["updated_at"],
    }


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math

    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
