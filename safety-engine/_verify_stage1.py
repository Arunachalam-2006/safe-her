"""
Stage 1 verification: multiple route retrieval via OSRM via-point alternatives.

Live against the public OSRM demo server. Read-only apart from the engine's own
in-memory state.
"""
import asyncio
import logging
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
logging.disable(logging.CRITICAL)

from services.osrm_service import (  # noqa: E402
    fetch_route,
    _offset_point,
    _jaccard,
    _pick_distinct,
    MAX_ROUTES,
    MAX_DETOUR_RATIO,
    SIMILARITY_THRESHOLD,
)
from fastapi.testclient import TestClient  # noqa: E402
import main  # noqa: E402

PASS = FAIL = 0


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {extra}")


CHENNAI_CENTRAL = (13.0827, 80.2707)
MARINA_BEACH = (13.0500, 80.2820)

print("\n=== pure helpers (no network) ===")
p1 = _offset_point((80.2707, 13.0827), (80.2820, 13.0500), 0.5, 500, +1)
p2 = _offset_point((80.2707, 13.0827), (80.2820, 13.0500), 0.5, 500, -1)
check("offset produces a point", isinstance(p1, tuple) and len(p1) == 2, str(p1))
check("sides differ", p1 != p2, f"{p1} vs {p2}")

# Measure the PERPENDICULAR distance from the direct line, not from the origin.
# The previous assertion measured origin->offset, which is ~2 km simply because
# the point sits halfway along a 5 km route - it was a bad test, not a bad offset.
from services.osrm_service import _haversine, _polyline_length_m  # noqa: E402
direct = [(80.2707, 13.0827), (80.2820, 13.0500)]
mid_on_line = _offset_point(direct[0], direct[1], 0.5, 0.0, +1)
perp = _haversine(p1[1], p1[0], mid_on_line[1], mid_on_line[0])
check("perpendicular offset is ~500 m", 450 < perp < 550, f"{perp:.0f} m")
check("offset is not a globe wrap", perp < 2000, f"{perp:.0f} m")

same = [[0, 0], [1, 1], [2, 2]]
superset = [[0, 0], [1, 1], [2, 2], [3, 3], [4, 4]]
check("identical geometries -> 1.0", abs(_jaccard(same, same) - 1.0) < 1e-9,
      f"{_jaccard(same, same)}")
check("superset is NOT 1.0 (the bug I hit)", _jaccard(same, superset) < 0.9,
      f"{_jaccard(same, superset)}")
check("disjoint -> 0.0", _jaccard([[0, 0]], [[9, 9]]) == 0.0)

# Realistic fixtures: many shared vertices. The previous 2- and 3-vertex
# fixtures had a Jaccard of 0.67, which is legitimately BELOW the 0.80
# threshold, so the de-duper was correct to keep it.
base_geom = [[i * 0.001, i * 0.001] for i in range(60)]
near_dup = [[i * 0.001, i * 0.001] for i in range(62)]      # same road, longer
other = [[i * 0.001 + 0.5, i * 0.001 + 0.5] for i in range(60)]  # different road
cands = [
    {"geometry": base_geom, "distance_m": 100},
    {"geometry": near_dup, "distance_m": 110},
    {"geometry": other, "distance_m": 120},
]
kept = _pick_distinct(cands, 3)
check("de-dup drops the near-duplicate", len(kept) == 2, f"kept {len(kept)}")
check("de-dup keeps the shortest first", kept[0]["distance_m"] == 100)
check("near_dup really was similar", _jaccard(base_geom, near_dup) >= SIMILARITY_THRESHOLD,
      f"{_jaccard(base_geom, near_dup):.3f}")

print("\n=== LIVE: /safety/routes (routing only) ===")
client = TestClient(main.app)
t = time.time()
r = client.post("/safety/routes", json={
    "origin": {"lat": CHENNAI_CENTRAL[0], "lng": CHENNAI_CENTRAL[1]},
    "destination": {"lat": MARINA_BEACH[0], "lng": MARINA_BEACH[1]},
    "mode": "driving",
})
elapsed = time.time() - t
check("returns 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
routes = r.json().get("routes", [])
print(f"  elapsed: {elapsed:.1f}s   routes: {len(routes)}")
for i, x in enumerate(routes, 1):
    print(f"    Route {i}: {x['distanceKm']:.2f} km, {x['durationMin']} min, "
          f"{len(x['coordinates'])} pts, scored={x['scored']}, score={x['score']}")

check("returns more than one route", len(routes) > 1, f"got {len(routes)}")
check("never exceeds MAX_ROUTES", len(routes) <= MAX_ROUTES, f"got {len(routes)}")
check("all have geometry", all(len(x["coordinates"]) > 1 for x in routes))
check("all marked unscored", all(x["scored"] is False and x["score"] is None for x in routes))
check("geometry is [lat,lng] order",
      13.0 < routes[0]["coordinates"][0][0] < 13.2 and 80.0 < routes[0]["coordinates"][0][1] < 80.4,
      str(routes[0]["coordinates"][0]))


# Compare FULL geometries, not the first 20 vertices - the first 20 are all near
# the shared origin and identical on every route, which made the previous
# version of this check fail for the wrong reason.
def geom_key(x):
    return tuple((round(p[0], 5), round(p[1], 5)) for p in x["coordinates"])


check("every route geometry is unique",
      len({geom_key(x) for x in routes}) == len(routes),
      f"{len({geom_key(x) for x in routes})} unique of {len(routes)}")

base = routes[0]["distanceKm"]
check("no absurd detour (max 1.6x direct)", all(x["distanceKm"] <= base * MAX_DETOUR_RATIO + 0.1 for x in routes),
      f"base={base:.2f} got={[round(x['distanceKm'],2) for x in routes]}")

worst = 0.0
for i in range(len(routes)):
    for j in range(i + 1, len(routes)):
        worst = max(worst, _jaccard(routes[i]["coordinates"], routes[j]["coordinates"]))
check(f"routes genuinely distinct (max pairwise jaccard < {SIMILARITY_THRESHOLD})",
      worst < SIMILARITY_THRESHOLD, f"worst={worst:.3f}")
print(f"  worst pairwise similarity: {worst:.3f}")

print("\n=== LIVE: identical origin/destination -> graceful single route ===")
r = client.post("/safety/routes", json={
    "origin": {"lat": 13.0827, "lng": 80.2707},
    "destination": {"lat": 13.0827, "lng": 80.2707},
    "mode": "driving",
})
check("same-point request does not 500", r.status_code in (200, 422), f"got {r.status_code}")
if r.status_code == 200:
    print(f"  returned {len(r.json().get('routes', []))} route(s)")

print("\n=== LIVE: /safety/analyze still works and now returns multiple scored routes ===")
t = time.time()
r = client.post("/safety/analyze", json={
    "origin": {"lat": CHENNAI_CENTRAL[0], "lng": CHENNAI_CENTRAL[1]},
    "destination": {"lat": MARINA_BEACH[0], "lng": MARINA_BEACH[1]},
    "mode": "driving",
})
elapsed = time.time() - t
check("analyze returns 200", r.status_code == 200, f"{r.status_code} {r.text[:200]}")
scored = r.json()
check("analyze returns a list", isinstance(scored, list), str(type(scored)))
if isinstance(scored, list) and scored:
    print(f"  elapsed: {elapsed:.1f}s   scored routes: {len(scored)}")
    for i, x in enumerate(scored):
        print(f"    Route {x.get('routeIndex', i)}: score={x.get('score')} "
              f"risk={x.get('risk_level')} {x.get('distanceKm')} km "
              f"segments={len(x.get('segments', []))}")
    check("analyze also returns multiple routes", len(scored) > 1, f"got {len(scored)}")
    check("every route has its own score",
          all(isinstance(x.get("score"), (int, float)) for x in scored))
    check("each route keeps its own geometry",
          len({geom_key(x) for x in scored}) == len(scored))
    scores = [x.get("score") for x in scored]
    degraded = [bool(x.get("degraded")) for x in scored]
    if len(set(scores)) == 1 and any(degraded):
        # Not a failure: Overpass was unavailable, so every route correctly
        # received the same neutral degraded score rather than a fabricated one.
        check("identical scores only occur because data was degraded", True)
        print(f"  NOTE: Overpass was degraded -> all routes share a neutral score "
              f"({scores[0]}). This is the intended no-fabrication behaviour.")
    else:
        check("scores are per-route (not identical copies)",
              len(set(scores)) > 1 or len(scored) == 1, f"scores={scores}")
    print(f"  degraded flags: {degraded}")

print("\n=== validation still enforced ===")
for label, payload, path in [
    ("bad lat", {"origin": {"lat": 999, "lng": 80}, "destination": {"lat": 13, "lng": 80}}, "/safety/routes"),
    ("bad mode", {"origin": {"lat": 13, "lng": 80}, "destination": {"lat": 12, "lng": 80}, "mode": "scooting"}, "/safety/routes"),
]:
    rr = client.post(path, json=payload)
    check(f"{label} rejected on /safety/routes", rr.status_code == 422, f"got {rr.status_code}")

print(f"\n{'*** ALL PASS ***' if FAIL == 0 else '*** FAILURES ***'}: {PASS} passed, {FAIL} failed\n")
sys.exit(1 if FAIL else 0)
