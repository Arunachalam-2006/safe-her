"""
OSRM Service — fetches route geometry from the public OSRM API,
then splits it into N equal-length segments with midpoint + road type data.
"""

import math
import httpx

OSRM_BASE = "http://router.project-osrm.org/route/v1"
PROFILE_MAP = {"driving": "driving", "walking": "foot", "cycling": "bike"}


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


async def fetch_route(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    mode: str = "driving",
    num_segments: int = 5,
) -> list[dict]:
    """
    Fetch routes (including alternatives) from OSRM and return list of geometries + segments.

    Returns:
        List of dicts:
        [
            {
                "geometry": [[lng, lat], ...],
                "distance_m": float,
                "duration_s": float,
                "turn_count": int,
                "segments": [...]
            }
        ]
    """
    profile = PROFILE_MAP.get(mode, "driving")
    url = (
        f"{OSRM_BASE}/{profile}/{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
        f"?overview=full&geometries=geojson&steps=true&annotations=true&alternatives=true"
    )

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    if data.get("code") != "Ok" or not data.get("routes"):
        raise ValueError(f"OSRM returned no routes: {data.get('code', 'unknown')}")

    routes_list = []
    for route_idx, route in enumerate(data.get("routes", [])):
        geometry = route["geometry"]["coordinates"]  # [[lng, lat], ...]
        distance_m = route["distance"]
        duration_s = route["duration"]

        # Extract turn count from steps
        legs = route.get("legs", [])
        steps = []
        turn_count = 0
        for leg in legs:
            leg_steps = leg.get("steps", [])
            steps.extend(leg_steps)
            for step in leg_steps:
                maneuver = step.get("maneuver", {})
                mtype = maneuver.get("type", "")
                if mtype in ("turn", "end of road", "fork", "roundabout"):
                    turn_count += 1

        # Split geometry into segments
        seg_coords = _split_coords(geometry, num_segments)

        segments = []
        for i, coords in enumerate(seg_coords):
            mid_lat, mid_lng = _midpoint(coords)
            length_m = _polyline_length_m(coords) if len(coords) > 1 else 0.0

            # Assign road types from steps that might overlap this segment
            # Use simple proportional mapping
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

        routes_list.append(
            {
                "geometry": geometry,
                "distance_m": distance_m,
                "duration_s": duration_s,
                "turn_count": turn_count,
                "segments": segments,
            }
        )

    return routes_list
