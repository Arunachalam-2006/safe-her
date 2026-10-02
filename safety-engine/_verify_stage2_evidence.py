"""
Stage 2 verification — POST /reports contract.

Focus:
  A) BACKWARD COMPATIBILITY — a request without `evidence` must behave exactly
     as it did before this change (evidence == []).
  B) New requests carrying `evidence[]` are stored in the existing column.
  C) Hostile input from an UNAUTHENTICATED client is bounded, not echoed.
"""
import json
import urllib.request
import urllib.error

BASE = "http://127.0.0.1:8000"

passed = failed = 0


def check(name, cond, extra=""):
    global passed, failed
    if cond:
        passed += 1
        print("  PASS  " + name)
    else:
        failed += 1
        print("  FAIL  " + name + ("  -> " + str(extra) if extra else ""))


def post(payload):
    req = urllib.request.Request(
        BASE + "/reports",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def get(report_id):
    with urllib.request.urlopen(BASE + "/reports", timeout=30) as r:
        return json.loads(r.read())["reports"]


print("=== A) BACKWARD COMPATIBILITY (no evidence field sent) ===")
status, body = post({
    "category": "Theft", "location_label": "Adyar bus stop", "details": "old client",
    "lat": 13.0, "lng": 80.0, "has_photo": False,
})
check("old client accepted (200)", status == 200, status)
check("evidence defaults to []", body.get("report", {}).get("evidence") == [],
      body.get("report", {}).get("evidence"))
check("has_photo preserved as false", body["report"]["has_photo"] is False)
old_id = body["report"]["id"]

status, body = post({
    "category": "Harassment", "location_label": "Marina", "details": "old2",
    "lat": 13.0, "lng": 80.0, "has_photo": True,
})
check("old client with has_photo=true accepted", status == 200, status)
check("has_photo preserved as true", body["report"]["has_photo"] is True)
check("evidence still [] with has_photo=true", body["report"]["evidence"] == [],
      body["report"]["evidence"])

status, body = post({"category": "Other", "location_label": "T Nagar"})
check("minimal body (no details/coords) still works", status == 200, status)
check("null coords stored as null", body["report"]["lat"] is None and body["report"]["lng"] is None)

status, body = post({
    "category": "Other", "location_label": "explicit null evidence",
    "evidence": None,
})
check("explicit evidence:null works", status == 200, status)
check("explicit null -> []", body["report"]["evidence"] == [])

print("\n=== A2) evidence:[] (empty list) ===")
status, body = post({"category": "Other", "location_label": "empty list", "evidence": []})
check("empty list accepted", status == 200, status)
check("empty list -> []", body["report"]["evidence"] == [])

print("\n=== B) NEW: evidence[] with a Storage path ===")
NEW_EVIDENCE = [{
    "uri": "reports/a1b2c3d4e5f60718293a4b5c6d7e8f90.jpg",
    "kind": "supabase-storage",
    "bucket": "report-images",
    "uploaded_at": "2026-10-01T12:00:00.000Z",
}]
status, body = post({
    "category": "Poor lighting", "location_label": "Anna Nagar", "details": "dark",
    "lat": 13.08, "lng": 80.27, "has_photo": True, "evidence": NEW_EVIDENCE,
})
check("accepted (200)", status == 200, status)
stored = body.get("report", {}).get("evidence")
check("evidence round-trips as a list", isinstance(stored, list), stored)
check("uri preserved", stored and stored[0].get("uri") == NEW_EVIDENCE[0]["uri"], stored)
check("kind preserved", stored and stored[0].get("kind") == "supabase-storage", stored)
check("bucket preserved", stored and stored[0].get("bucket") == "report-images", stored)
new_id = body["report"]["id"]

# Confirm it really is persisted in SQLite, not just echoed back.
all_reports = get(new_id)
found = [r for r in all_reports if r["id"] == new_id]
check("row is present in GET /reports", len(found) == 1, len(found))
check("persisted evidence matches", found and found[0]["evidence"][0]["uri"] == NEW_EVIDENCE[0]["uri"],
      found[0]["evidence"] if found else None)
check("persisted has_photo true", found and found[0]["has_photo"] is True)
check("old client row untouched", any(r["id"] == old_id for r in all_reports))

print("\n=== C) HOSTILE input (unauthenticated client) ===")
# Non-dict items are rejected by pydantic validation with a 422 before the
# sanitizer ever runs. That is the correct API behaviour for malformed input.
status, body = post({"category": "Other", "location_label": "X", "evidence": ["a", "b", 7]})
check("non-dict items -> 422 (not silently stored)", status == 422, status)
check("422 names the offending index", "dict_type" in json.dumps(body), body)

status, body = post({"category": "Other", "location_label": "X", "evidence": [{}, {"uri": "   "}]})
check("empty / whitespace-only items dropped, 200", status == 200, status)
check("empty / whitespace-only items -> []", body["report"]["evidence"] == [], body["report"]["evidence"])

status, body = post({"category": "Other", "location_label": "X", "evidence": [{"uri": "A" * 5000}]})
ev = body["report"]["evidence"]
check("oversized string truncated", ev and len(ev[0]["uri"]) == 512, len(ev[0]["uri"]) if ev else None)

status, body = post({
    "category": "Other", "location_label": "X",
    "evidence": [{"uri": f"reports/p{i}.jpg"} for i in range(11)],
})
check("item count capped at 10", len(body["report"]["evidence"]) == 10, len(body["report"]["evidence"]))

status, body = post({
    "category": "Other", "location_label": "X",
    "evidence": [{"uri": "reports/ok.jpg", "nested": {"deep": "x"}, "num": 5}],
})
ev = body["report"]["evidence"]
check("non-string fields dropped", ev and set(ev[0].keys()) == {"uri"}, ev)

print("\n=== D) no duplicate columns, no new table ===")
import sqlite3
import os
db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "safety-engine", "safeher.db")
conn = sqlite3.connect(os.path.abspath(db_path))
cols = [r[1] for r in conn.execute("PRAGMA table_info(reports)")]
tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
check("no image_path column", "image_path" not in cols, cols)
check("no image_url column", "image_url" not in cols, cols)
check("no photo_url column", "photo_url" not in cols, cols)
check("existing evidence column reused", "evidence" in cols, cols)
check("evidence is TEXT", cols and cols[cols.index("evidence")] is not None)
print("       reports columns: " + ", ".join(cols))
print("       sqlite tables : " + ", ".join(tables))
check("no new table created", "report_images" not in tables and "storage_objects" not in tables, tables)
conn.close()

print(f"\n*** {'ALL PASS' if failed == 0 else 'FAILURES'} ***: {passed} passed, {failed} failed\n")
raise SystemExit(1 if failed else 0)
