"""
OSRM Service — fetches route geometry from the public OSRM API,
then splits it into N equal-length segments with midpoint + road type data.

Multiple route alternatives
---------------------------
The public OSRM demo server (router.project-osrm.org) runs a single path
algorithm. It ACCEPTS `alternatives=true` and returns `code: "Ok"`, then
silently returns exactly ONE route. Verified against two independent public
instances. `continue_straight=false` returns a byte-identical route and
`exclude=motorway` is rejected with HTTP 400.

So alternatives are GENERATED rather than requested: the router is asked for a
pool of routes that each pass through a slightly offset via-point, forcing it
onto different roads. Candidates are then de-duplicated with a symmetric
Jaccard measure of their vertex sets.

Why the metric must be symmetric: an asymmetric overlap treats a route that
merely CONTAINS the baseline as a 100% match, so a near-duplicate gets
presented to the user as a genuinely different option. Jaccard
(|A n B| / |A u B|) scores that correctly as low overlap.
"""

import asyncio
import math

import httpx

# HTTPS, not HTTP. A user's origin and destination - exactly the coordinates a
# safety app exists to protect - were travelling in cleartext, and the returned
# route was attacker-modifiable in transit. Every other integration here already
# used TLS.
OSRM_BASE = "https://router.project-osrm.org/route/v1"
PROFILE_MAP = {"driving": "driving", "walking": "foot", "cycling": "bike"}
VALID_MODES = frozenset(PROFILE_MAP)

# Alternative-generation tuning (validated against Chennai Central -> Marina Beach)
MAX_ROUTES = 3
# A via-point candidate whose route is this much longer than the direct route is
# a pointless detour rather than a useful alternative.
MAX_DETOUR_RATIO = 1.6
# Two candidates above this Jaccard similarity are the same road.
SIMILARITY_THRESHOLD = 0.80
# Offset distance (m) x position along the route x side, ordered so the most
# promising variants are tried first. Opposite sides of the direct line produce
# the most genuinely different routes, so those lead.
VIA_OFFSETS_M = (250, 450, 150)
VIA_POSITIONS = (0.35, 0.70, 0.50, 0.20, 0.85)
VIA_SIDES = (-1, 1)
# How many via-variants to request per round trip. Kept small so a typical plan
# costs ~9 OSRM calls rather than the full grid.
VIA_WAVE_SIZE = 8

_EARTH_RADIUS_M = 6_371_000.0


def _ordered_via_variants() -> list[tuple[float, float, int]]:
    """(offset_m, fraction, side) candidates, largest/most-central first."""
    out = []
    for frac in VIA_POSITIONS:
        for side in VIA_SIDES:
            for metres in VIA_OFFSETS_M:
                out.append((metres, frac, side))
    return out


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return distance in metres between two coordinates."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _midpoint(coords: list[list[float]]) -> tuple[float, float]:
    """Return the midpoint (lat, lng) of a list of [lng, lat] coords."""
    if not coords:
        return (0.0, 0.0)
    mid_idx = len(coords) // 2
    return (coords[mid_idx][1], coords[mid_idx][0])


def _polyline_length_m(coords: list[list[float]]) -> float:
    """Sum haversine distances along a polyline of [lng, lat] coords."""
    total = 0.0
    for i in range(len(coords) - 1):
        total += _haversine(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0])
    return total


def _split_coords(coords: list[list[float]], n: int) -> list[list[list[float]]]:
    """Split coordinate list into n roughly equal chunks."""
    total = len(coords)
    if total <= n:
        return [[c] for c in coords]
    chunk_size = max(1, total // n)
    segments = []
    for i in range(n):
        start = i * chunk_size
        end = start + chunk_size if i < n - 1 else total
        segments.append(coords[start:end])
    return segments


def _road_types_from_steps(steps: list[dict]) -> list[str]:
    """Extract road types from OSRM steps."""
    types = []
    for step in steps:
        intersections = step.get("intersections", [])
        for inter in intersections:
            entries = inter.get("entry", [])
            # Extract road class from step name or ref
            pass
        # Use the step's "name" and try to extract the road type from maneuver
        road_name = step.get("name", "")
        ref = step.get("ref", "")
        # The actual highway tag isn't directly in OSRM response,
        # but we can infer from step distance and road class
        road_class = step.get("driving_side", "")
        types.append(road_name or ref or "unknown")
    return types


async def _osrm_geometry(client, profile: str, points: list[tuple[float, float]]):
    """Fetch one geometry through an ordered list of (lng, lat) waypoints."""
    coords = ";".join(f"{lng},{lat}" for lng, lat in points)
    url = (
        f"{OSRM_BASE}/{profile}/{coords}"
        f"?overview=full&geometries=geojson&steps=true&annotations=true"
    )
    resp = await client.get(url)
    resp.raise_for_status()
    data = resp.json()
    if data.get("code") != "Ok" or not data.get("routes"):
        return None
    route = data["routes"][0]
    return {
        "geometry": route["geometry"]["coordinates"],
        "distance_m": route["distance"],
        "duration_s": route["duration"],
        "legs": route.get("legs", []),
    }


def _offset_point(
    a: tuple[float, float],
    b: tuple[float, float],
    frac: float,
    metres: float,
    side: int,
) -> tuple[float, float]:
    """
    Point `frac` along a->b, pushed `metres` perpendicular to the line.

    Uses a local equirectangular projection so the offset is a true distance in
    metres. A naive degrees-only offset on the raw lng/lat difference is wrong by
    the cosine of the latitude and, for this route shape, produced a 24,000 km
    "alternative" that wrapped around the globe.
    """
    mid_lng = a[0] + frac * (b[0] - a[0])
    mid_lat = a[1] + frac * (b[1] - a[1])

    kx = math.cos(math.radians(mid_lat)) * math.pi / 180.0 * _EARTH_RADIUS_M
    ky = math.pi / 180.0 * _EARTH_RADIUS_M

    dx_m = (b[0] - a[0]) * kx
    dy_m = (b[1] - a[1]) * ky
    length = math.hypot(dx_m, dy_m)
    if length == 0:
        return (mid_lng, mid_lat)

    px = (-dy_m / length) * metres * side
    py = (dx_m / length) * metres * side
    return (mid_lng + px / kx, mid_lat + py / ky)


def _jaccard(c1: list, c2: list, precision: int = 4) -> float:
    """Symmetric similarity of two geometries, 0.0 (disjoint) .. 1.0 (identical)."""
    s1 = {(round(x, precision), round(y, precision)) for x, y in c1}
    s2 = {(round(x, precision), round(y, precision)) for x, y in c2}
    if not s1 or not s2:
        return 0.0
    return len(s1 & s2) / len(s1 | s2)


def _pick_distinct(candidates: list[dict], want: int) -> list[dict]:
    """
    Greedily keep the most mutually-distinct candidates, best (shortest) first.

    A candidate is rejected if it is too similar to ANY already-kept route -
    note MAX over the kept set, not MIN. Using MIN lets a route through that is
    merely a near-copy of one kept route while being totally different from
    another, which is how a 85%-identical duplicate once got presented as a
    distinct alternative.
    """
    ordered = sorted(candidates, key=lambda r: r["distance_m"])
    kept = []
    for cand in ordered:
        if len(kept) >= want:
            break
        if cand.get("_dropped"):
            continue
        if all(_jaccard(cand["geometry"], k["geometry"]) < SIMILARITY_THRESHOLD for k in kept):
            kept.append(cand)
    return kept


def _build_route_record(raw: dict, num_segments: int) -> dict:
    """Turn one OSRM route payload into the engine's route dict."""
    geometry = raw["geometry"]
    distance_m = raw["distance_m"]
    duration_s = raw["duration_s"]

    turn_count = 0
    steps: list[dict] = []
    for leg in raw.get("legs", []):
        leg_steps = leg.get("steps", [])
        steps.extend(leg_steps)
        for step in leg_steps:
            mtype = step.get("maneuver", {}).get("type", "")
            if mtype in ("turn", "end of road", "fork", "roundabout"):
                turn_count += 1

    seg_coords = _split_coords(geometry, num_segments)
    segments = []
    for i, coords in enumerate(seg_coords):
        mid_lat, mid_lng = _midpoint(coords)
        length_m = _polyline_length_m(coords) if len(coords) > 1 else 0.0

        step_fraction_start = i / num_segments
        step_fraction_end = (i + 1) / num_segments
        seg_road_types = []
        for si, step in enumerate(steps):
            sf_start = si / max(len(steps), 1)
            sf_end = (si + 1) / max(len(steps), 1)
            if sf_end > step_fraction_start and sf_start < step_fraction_end:
                seg_road_types.append(step.get("name", "unknown"))

        segments.append(
            {
                "segment_id": i,
                "coords": coords,
                "midpoint": {"lat": mid_lat, "lng": mid_lng},
                "length_m": length_m,
                "road_types": seg_road_types if seg_road_types else ["unknown"],
            }
        )

    return {
        "geometry": geometry,
        "distance_m": distance_m,
        "duration_s": duration_s,
        "turn_count": turn_count,
        "segments": segments,
    }


async def fetch_route(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    mode: str = "driving",
    num_segments: int = 5,
    max_routes: int = MAX_ROUTES,
) -> list[dict]:
    """
    Fetch up to `max_routes` distinct routes between two points.

    Returns a list of route dicts (geometry, distance_m, duration_s,
    turn_count, segments). With a single routable pair this returns exactly one
    route, so the existing single-route experience is preserved.
    """
    # Previously `PROFILE_MAP.get(mode, "driving")`, so an unknown mode such as
    # "scooting" silently produced a DRIVING route and scored it as one.
    if mode not in PROFILE_MAP:
        raise ValueError(
            f"Unsupported travel mode '{mode}'. Expected one of {sorted(VALID_MODES)}."
        )
    profile = PROFILE_MAP[mode]
    origin = (origin_lng, origin_lat)
    dest = (dest_lng, dest_lat)

    async with httpx.AsyncClient(timeout=10.0) as client:
        # The direct route always comes first and is authoritative.
        try:
            direct = await _osrm_geometry(client, profile, [origin, dest])
        except httpx.HTTPError as e:
            raise ValueError(f"OSRM request failed: {e}") from e

        if not direct:
            raise ValueError("OSRM returned no routes")

        candidates = [direct]

        if max_routes > 1:
            # Candidate pool is requested in WAVES and stops as soon as enough
            # distinct routes are found. Firing the whole grid at once cost 33
            # requests per plan against a free demo server, which is both slow
            # and antisocial; in practice the first wave is nearly always enough.
            ordered = _ordered_via_variants()
            async with httpx.AsyncClient(timeout=10.0) as pool_client:
                for wave_start in range(0, len(ordered), VIA_WAVE_SIZE):
                    if len(_pick_distinct(candidates, max_routes)) >= max_routes:
                        break
                    wave = ordered[wave_start:wave_start + VIA_WAVE_SIZE]
                    results = await asyncio.gather(
                        *(
                            _osrm_geometry(
                                pool_client,
                                profile,
                                [origin, _offset_point(origin, dest, frac, metres, side), dest],
                            )
                            for metres, frac, side in wave
                        ),
                        return_exceptions=True,
                    )
                    max_distance = direct["distance_m"] * MAX_DETOUR_RATIO
                    for res in results:
                        if isinstance(res, BaseException) or not res:
                            continue
                        # Reject pointless detours.
                        if res["distance_m"] > max_distance:
                            continue
                        # Guard against a degenerate geometry.
                        if len(res["geometry"]) < 2:
                            continue
                        candidates.append(res)

    distinct = _pick_distinct(candidates, max_routes)
    if not distinct:
        distinct = [direct]

    return [_build_route_record(r, num_segments) for r in distinct]
