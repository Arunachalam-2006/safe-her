"""End-to-end HTTP verification for the Phase 1/2 backend fixes."""
import json
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
logging.disable(logging.CRITICAL)  # keep the report readable

# Import the app in-process (no network, no server) and drive it with the
# Starlette TestClient. Uses a scratch copy of the database.
import shutil
import tempfile

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "safeher.db")
BAK = None
if os.path.exists(DB):
    BAK = DB + ".verifybak"
    shutil.copy2(DB, BAK)

from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402

client = TestClient(main.app)

PASS = 0
FAIL = 0


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {extra}")


print("\n=== /health and / ===")
r = client.get("/health")
check("/health returns 200 when storage works", r.status_code == 200, r.text)
check("/health reports ok", r.json().get("status") == "ok", r.text)
r = client.get("/")
check("/ reports sqlite persistence", r.json().get("persistence") == "sqlite", r.text)
check("/ advertises GET /reports now", any("GET  /reports" in e for e in r.json()["endpoints"]))
check("/ version consistent", r.json().get("version") == main.VERSION, r.text)

print("\n=== CORS is no longer a wildcard ===")
r = client.get("/health", headers={"Origin": "https://evil.example.com"})
check("foreign origin not allowed to read", "access-control-allow-origin" not in
      {k.lower() for k in r.headers} or
      r.headers.get("access-control-allow-origin") != "*",
      f"ACAO={r.headers.get('access-control-allow-origin')}")
r = client.options("/safety/spot", headers={
    "Origin": "https://evil.example.com",
    "Access-Control-Request-Method": "POST",
})
check("preflight from foreign origin rejected",
      r.headers.get("access-control-allow-origin") is None,
      f"ACAO={r.headers.get('access-control-allow-origin')}")
r = client.options("/safety/spot", headers={
    "Origin": "http://localhost:8081",
    "Access-Control-Request-Method": "POST",
})
check("preflight from dev origin allowed",
      r.headers.get("access-control-allow-origin") == "http://localhost:8081",
      f"ACAO={r.headers.get('access-control-allow-origin')}")

print("\n=== input validation is enforced at the HTTP layer ===")
r = client.post("/safety/spot", json={"lat": 999, "lng": 0})
check("lat=999 rejected 422", r.status_code == 422, f"got {r.status_code}")
r = client.post("/safety/spot", json={"lat": 13.08, "lng": 80.27})
check("valid spot request accepted (not 422)", r.status_code != 422, f"got {r.status_code}")
r = client.post("/safety/analyze", json={
    "origin": {"lat": 13.08, "lng": 80.27},
    "destination": {"lat": 12.97, "lng": 80.22},
    "mode": "scooting",
})
check("mode='scooting' rejected 422", r.status_code == 422, f"got {r.status_code}")
r = client.post("/safety/hubs", json={"lat": 91, "lng": 0})
check("hubs lat=91 rejected 422", r.status_code == 422, f"got {r.status_code}")

print("\n=== oversized strings rejected ===")
r = client.post("/reports", json={
    "category": "x" * 500, "location_label": "y" * 500, "details": "z" * 9000,
})
check("oversized report rejected 422", r.status_code == 422, f"got {r.status_code}")

print("\n=== limit parameter no longer overflows ===")
# 1e400 previously reached int(inf) and raised OverflowError -> 500. It is now
# rejected by Pydantic as a 422 before it can overflow anything.
r = client.get("/government/reports?limit=1e400")
check("limit=1e400 does not 500", r.status_code != 500, f"got {r.status_code}")
r = client.get("/government/reports?limit=-5")
check("limit=-5 does not 500", r.status_code != 500, f"got {r.status_code}")
r = client.get("/government/reports?limit=99999")
check("limit=99999 rejected 422", r.status_code == 422, f"got {r.status_code}")

print("\n=== report round-trip persists with coordinates ===")
r = client.post("/reports", json={
    "category": "Verification", "location_label": "Test Lane",
    "details": "phase1 verify", "lat": 13.08, "lng": 80.27, "has_photo": False,
})
check("POST /reports 200", r.status_code == 200, f"{r.status_code} {r.text[:150]}")
body = r.json()
rid = body.get("report", {}).get("id")
check("report has id", bool(rid), r.text[:150])
check("coords stored", body.get("report", {}).get("lat") == 13.08, r.text[:200])
r2 = client.get(f"/government/reports/{rid}")
check("report retrievable by id", r2.status_code == 200, f"got {r2.status_code}")

print("\n=== SQL-level filtering actually works ===")
for pri in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
    client.post("/reports", json={
        "category": "FilterProbe", "location_label": f"probe-{pri}",
        "lat": 13.0, "lng": 80.0,
    })
r = client.get("/government/reports?priority=CRITICAL&limit=500")
check("priority filter returns 200", r.status_code == 200, f"got {r.status_code}")
crit = [x for x in r.json()["reports"] if x["priority"] == "CRITICAL"]
check("priority filter is exact (no leakage)", len(crit) == len(r.json()["reports"]),
      f"got {len(r.json()['reports'])} total, {len(crit)} critical")
r = client.get("/government/reports?q=probe-critical")
check("text search works", r.status_code == 200 and
      all("probe-critical" in json.dumps(x).lower() for x in r.json()["reports"]),
      f"got {len(r.json().get('reports', []))}")

print("\n=== ordering: newest first within priority bucket ===")
r = client.get("/government/reports?priority=CRITICAL&limit=500")
times = [x.get("created_at") for x in r.json()["reports"] if x.get("created_at")]
check("CRITICAL bucket is newest-first", times == sorted(times, reverse=True),
      f"got {times[:4]}")

r = client.get("/government/reports?limit=500")
prios = [x.get("priority") for x in r.json()["reports"]]
order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
check("priority buckets ordered CRITICAL first",
      prios == sorted(prios, key=lambda p: order.get(p, 9)), f"got {prios[:8]}")

print("\n=== SOS state machine + typed intake ===")
r = client.post("/government/sos", json={"lat": 13.08, "lng": 80.27, "session_id": "verify-sos-1"})
check("SOS intake 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
aid = r.json().get("alert", {}).get("id")
check("SOS alert id returned", aid == "verify-sos-1", r.text[:200])
r = client.post("/government/sos", json={"lat": 999, "lng": 0})
check("SOS lat=999 rejected 422", r.status_code == 422, f"got {r.status_code}")
r = client.post("/government/sos", json={"lat": 13.0, "lng": 80.0, "session_id": {"a": 1}})
check("SOS non-string session_id rejected 422", r.status_code == 422, f"got {r.status_code}")

r = client.post("/government/sos/verify-sos-1", json={"status": "RESOLVED"})
check("SOS can be resolved", r.status_code == 200, f"{r.status_code} {r.text[:150]}")
r = client.post("/government/sos/verify-sos-1", json={"status": "ACTIVE"})
check("RESOLVED -> ACTIVE now rejected 409", r.status_code == 409, f"got {r.status_code}")
r = client.post("/government/sos/verify-sos-1", json={"status": "BOGUS"})
check("invalid SOS status rejected 422", r.status_code == 422, f"got {r.status_code}")
r = client.post("/government/sos/nonexistent-id", json={"status": "RESOLVED"})
check("unknown alert 404", r.status_code == 404, f"got {r.status_code}")

print("\n=== journeys scoping ===")
r = client.post("/journeys/save", json={
    "origin": {"lat": 13.0, "lng": 80.0}, "destination": {"lat": 12.9, "lng": 80.1},
    "safetyScore": 72, "riskLevel": "MODERATE", "owner_id": "user-A",
})
check("journey saved 200", r.status_code == 200, f"{r.status_code} {r.text[:150]}")
jid = r.json().get("journey_id")
r = client.get("/journeys?owner_id=user-A")
check("owner A sees own journey", any(x.get("journey_id") == jid for x in r.json()["journeys"]),
      r.text[:200])
r = client.get("/journeys?owner_id=user-B")
check("owner B does NOT see A's journey",
      not any(x.get("journey_id") == jid for x in r.json()["journeys"]),
      r.text[:200])
check("response reports it is scoped", r.json().get("scoped") is True)
r = client.post("/journeys/save", json={"safetyScore": 500})
check("journey safetyScore=500 rejected 422", r.status_code == 422, f"got {r.status_code}")

print("\n=== invalid report transitions still rejected ===")
r = client.post(f"/government/reports/{rid}/actions", json={
    "type": "STATUS_CHANGE", "to_status": "CLOSED",
})
check("NEW -> CLOSED allowed by table", r.status_code == 200, f"got {r.status_code} {r.text[:150]}")
r = client.post(f"/government/reports/{rid}/actions", json={
    "type": "STATUS_CHANGE", "to_status": "NEW",
})
check("CLOSED -> NEW rejected 409", r.status_code == 409, f"got {r.status_code}")
r = client.post(f"/government/reports/{rid}/actions", json={
    "type": "ACTION", "notes": "x" * 9000,
})
check("oversized action notes rejected 422", r.status_code == 422, f"got {r.status_code}")

print("\n=== stats and degradation flags ===")
r = client.get("/government/stats")
check("stats 200", r.status_code == 200, f"got {r.status_code}")

# restore original database
if BAK and os.path.exists(BAK):
    try:
        client.close()
    except Exception:
        pass
    import sqlite3
    con = sqlite3.connect(DB)
    con.execute("DELETE FROM reports")
    con.execute("DELETE FROM report_actions")
    con.execute("DELETE FROM sos_alerts")
    con.execute("DELETE FROM journeys")
    con.commit()
    con.close()
    os.remove(BAK)
    print("\n  (scratch rows cleaned from safeher.db)")

print(f"\n{'*** ALL PASS ***' if FAIL == 0 else '*** FAILURES ***'}: {PASS} passed, {FAIL} failed\n")
sys.exit(1 if FAIL else 0)
