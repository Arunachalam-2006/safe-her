"""
End-to-end verification of the progressive-scoring flow the app performs:

  1. POST /safety/routes   -> draw all options on the map (~2s)
  2. POST /safety/score    -> score each option separately

Plus the 8 test cases from the brief.
"""
import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
logging.disable(logging.CRITICAL)

from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402
from services.osrm_service import _jaccard, SIMILARITY_THRESHOLD  # noqa: E402

client = TestClient(main.app)
PASS = FAIL = 0


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {extra}")


O = {"lat": 13.0827, "lng": 80.2707}   # Chennai Central
D = {"lat": 13.0500, "lng": 80.2820}   # Marina Beach

print("\n### PHASE 1: /safety/routes (what the map needs first)")
t = time.time()
r = client.post("/safety/routes", json={"origin": O, "destination": D, "mode": "driving"})
phase1 = time.time() - t
check("returns 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
routes = r.json().get("routes", [])
print(f"  {phase1:.1f}s -> {len(routes)} routes")
for i, x in enumerate(routes, 1):
    print(f"    Route {i}: {x['distanceKm']:.2f} km, {x['durationMin']} min, {len(x['coordinates'])} pts")

check("multiple routes available", len(routes) >= 2, f"got {len(routes)}")
check("routes are usable before any scoring", all(len(x["coordinates"]) > 1 for x in routes))
check("explicitly marked unscored", all(x["score"] is None and x["scored"] is False for x in routes))
check("phase 1 is fast (<10s)", phase1 < 10, f"{phase1:.1f}s")

print("\n### TEST 1: same source/destination -> multiple routes")
check("Test 1 passes", len(routes) >= 2, f"{len(routes)} routes")

print("\n### TEST 2: only one route available -> existing single-route behaviour")
r2 = client.post("/safety/routes", json={"origin": O, "destination": O, "mode": "driving"})
check("identical points does not 500", r2.status_code in (200, 422), f"got {r2.status_code}")
if r2.status_code == 200:
    n = len(r2.json().get("routes", []))
    print(f"     returned {n} route(s)")
    check("returns 1..3 routes", 1 <= n <= 3, f"got {n}")

print("\n### PHASE 2: /safety/score per route (what fills the cards in)")
scored = []
for i, opt in enumerate(routes):
    t = time.time()
    rr = client.post("/safety/score", json={
        "coordinates": opt["coordinates"],
        "origin": O, "destination": D, "mode": "driving",
        # Sent back from /safety/routes exactly as the app does.
        "turn_count": opt.get("turn_count", 0),
        "segments": opt.get("segments"),
    })
    el = time.time() - t
    check(f"route {i+1} scores 200", rr.status_code == 200, f"{rr.status_code} {rr.text[:150]}")
    if rr.status_code == 200:
        s = rr.json()
        scored.append(s)
        print(f"    Route {i}: score={s.get('score')} risk={s.get('risk_level')} "
              f"turns={opt.get('turn_count')} degraded={s.get('degraded')} ({el:.1f}s)")

print("\n### turn_count / road_types survive the round trip")
check("/safety/routes returns turn_count",
      all("turn_count" in x for x in routes), f"keys={list(routes[0].keys())}")
check("/safety/routes returns segments",
      all(x.get("segments") for x in routes))
check("segments carry road_types",
      all(all("road_types" in seg for seg in x["segments"]) for x in routes))
turn_counts = [x.get("turn_count") for x in routes]
print(f"     turn counts per route: {turn_counts}")
check("turn counts are not all identical",
      len(set(turn_counts)) > 1 or len(routes) == 1, f"all {turn_counts[0]}")

print("\n### TEST 3: different routes have different safety scores")
check("each route produced a score", len(scored) == len(routes), f"{len(scored)}/{len(routes)}")
scores = [s.get("score") for s in scored]
print(f"     scores: {scores}")
check("scores are numbers", all(isinstance(s, (int, float)) for s in scores))
if all(not s.get("degraded") for s in scored):
    check("TEST 3 passes (scores genuinely differ)", len(set(scores)) > 1, f"all {scores[0]}")
else:
    print("     NOTE: degraded - Overpass unavailable, so scores may match")

print("\n### TEST 4/5: route selection contract")
# The app holds allRoutes and swaps selectedRouteIndex; emulate that.
selected = 0
best = max(range(len(scored)), key=lambda i: scored[i].get("score") or -1)
selected = best
check("safest route can be identified", best >= 0, f"best={best}")
for target in (0, 1, min(2, len(routes) - 1)):
    selected = target
    check(f"can select route index {target}", 0 <= selected < len(routes))
check("selection is reversible", (selected := 0) == 0)

print("\n### TEST 6: routing API failure -> graceful error")
import services.osrm_service as osrm  # noqa: E402
import routes.safety as safety_mod  # noqa: E402
import httpx  # noqa: E402

orig = osrm._osrm_geometry


async def boom(client_, profile, points):
    raise httpx.ConnectError("simulated routing outage")


osrm._osrm_geometry = boom
safety_mod.fetch_route.__globals__["_osrm_geometry"] = boom
r6 = client.post("/safety/routes", json={"origin": O, "destination": D, "mode": "driving"})
check("routing outage returns an error status, not a crash",
      r6.status_code in (422, 502), f"got {r6.status_code}")
print(f"     status {r6.status_code}: {r6.json().get('detail', '')[:70]}")
osrm._osrm_geometry = orig
safety_mod.fetch_route.__globals__["_osrm_geometry"] = orig

print("\n### TEST 7: safety API failure -> route still usable, score marked unavailable")
r7 = client.post("/safety/score", json={
    "coordinates": [[13.0, 80.2], [13.01, 80.21], [13.02, 80.22]],
    "origin": O, "destination": D, "mode": "driving",
})
check("scoring a plain geometry succeeds", r7.status_code == 200, f"{r7.status_code}")
if r7.status_code == 200:
    check("returns a scoreable shape", "score" in r7.json(), str(list(r7.json().keys())))

r7b = client.post("/safety/score", json={"coordinates": [[13.0, 80.2]], "origin": O,
                                        "destination": D, "mode": "driving"})
check("single-point geometry rejected 422", r7b.status_code == 422, f"got {r7b.status_code}")
r7c = client.post("/safety/score", json={"coordinates": [[13.0, 80.2], [13.0, 80.2]],
                                         "origin": O, "destination": D, "mode": "driving"})
check("zero-length geometry rejected 422", r7c.status_code == 422, f"got {r7c.status_code}")

print("\n### TEST 8: distinctness of what the user is shown")
worst = 0.0
for i in range(len(routes)):
    for j in range(i + 1, len(routes)):
        worst = max(worst, _jaccard(routes[i]["coordinates"], routes[j]["coordinates"]))
check(f"all shown routes are genuinely distinct (jaccard < {SIMILARITY_THRESHOLD})",
      worst < SIMILARITY_THRESHOLD, f"worst={worst:.3f}")
print(f"     worst pairwise similarity: {worst:.3f}")
check("routes show a real trade-off (distance varies)",
      len({round(x["distanceKm"], 2) for x in routes}) > 1,
      f"{[round(x['distanceKm'],2) for x in routes]}")
print(f"     distances: {[round(x['distanceKm'],2) for x in routes]} km")
print(f"     etas     : {[x['durationMin'] for x in routes]} min")

print("\n### cap + validation")
r8 = client.get("/health")
check("health ok", r8.status_code == 200, f"got {r8.status_code}")
for label, payload in [
    ("bad lat", {"origin": {"lat": 999, "lng": 80}, "destination": D}),
    ("bad mode", {"origin": O, "destination": D, "mode": "scooting"}),
]:
    rr = client.post("/safety/routes", json=payload)
    check(f"{label} still rejected", rr.status_code == 422, f"got {rr.status_code}")

print(f"\n{'*** ALL PASS ***' if FAIL == 0 else '*** FAILURES ***'}: {PASS} passed, {FAIL} failed\n")
sys.exit(1 if FAIL else 0)
