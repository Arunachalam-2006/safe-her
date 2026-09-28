"""
Overpass Service — queries OpenStreetMap Overpass API for safety-relevant
infrastructure around each route segment midpoint.

Segment queries run concurrently but are capped by a semaphore, and results are
cached briefly by rounded coordinate, because the public Overpass instance
rate-limits aggressively and there was previously no cache and no cap.
"""

import asyncio
import logging
import math
import time

import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Overpass rejects requests without a User-Agent (HTTP 406). A descriptive UA is
# also required by OSM usage policy. Shared by all Overpass POSTs.
OVERPASS_HEADERS = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "SafeHer/1.0 (women & citizen safety app; contact@safeher.app)",
    "Accept": "application/json",
}


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance in metres between two coordinates."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _classify_place(tags: dict):
    """Map an OSM element's tags to a safe-hub (category, human label), or (None, None)."""
    amenity = tags.get("amenity")
    if amenity == "police":
        return ("police", "Police station")
    if amenity == "hospital":
        return ("hospital", "Hospital")
    if amenity == "clinic":
        return ("clinic", "Clinic")
    if amenity == "pharmacy":
        return ("pharmacy", "24/7 pharmacy")
    if amenity == "fuel":
        return ("fuel", "Fuel station")
    if tags.get("public_transport") == "stop_position":
        return ("bus_stop", "Transit stop")
    return (None, None)


def _build_query(lat: float, lng: float) -> str:
    """Build an Overpass QL query for safety infrastructure counts."""
    return f"""[out:json][timeout:10];
(
  node["highway"="street_lamp"](around:500,{lat},{lng});
  node["amenity"="police"](around:1000,{lat},{lng});
  node["amenity"="hospital"](around:2000,{lat},{lng});
  node["amenity"="clinic"](around:1500,{lat},{lng});
  node["amenity"~"pharmacy|bank|fuel"](around:500,{lat},{lng});
  node["shop"](around:500,{lat},{lng});
  node["amenity"="restaurant"](around:500,{lat},{lng});
  node["public_transport"="stop_position"](around:500,{lat},{lng});
);
out body;"""


def _categorize_elements(elements: list[dict]) -> dict:
    """Categorize Overpass elements into infrastructure counts."""
    counts = {
        "street_lamps": 0,
        "police": 0,
        "hospitals": 0,
        "clinics": 0,
        "pharmacies": 0,
        "shops": 0,
        "restaurants": 0,
        "bus_stops": 0,
    }

    for el in elements:
        tags = el.get("tags", {})

        if tags.get("highway") == "street_lamp":
            counts["street_lamps"] += 1
        elif tags.get("amenity") == "police":
            counts["police"] += 1
        elif tags.get("amenity") == "hospital":
            counts["hospitals"] += 1
        elif tags.get("amenity") == "clinic":
            counts["clinics"] += 1
        elif tags.get("amenity") == "pharmacy":
            counts["pharmacies"] += 1
        elif tags.get("shop"):
            counts["shops"] += 1
        elif tags.get("amenity") == "restaurant":
            counts["restaurants"] += 1
        elif tags.get("public_transport") == "stop_position":
            counts["bus_stops"] += 1

    return counts


async def _query_single_segment(
    client: httpx.AsyncClient, lat: float, lng: float, segment_id: int
) -> dict:
    """Run Overpass query for one segment midpoint."""
    query = _build_query(lat, lng)
    try:
        resp = await client.post(
            OVERPASS_URL,
            data={"data": query},
            headers=OVERPASS_HEADERS,
        )
        resp.raise_for_status()
        data = resp.json()
        elements = data.get("elements", [])
        counts = _categorize_elements(elements)
        counts["segment_id"] = segment_id
        counts["total_elements"] = len(elements)
        return counts
    except Exception as e:
        print(f"Overpass query failed for segment {segment_id}: {e}")
        return {
            "segment_id": segment_id,
            "street_lamps": 0,
            "police": 0,
            "hospitals": 0,
            "clinics": 0,
            "pharmacies": 0,
            "shops": 0,
            "restaurants": 0,
            "bus_stops": 0,
            "total_elements": 0,
            "error": str(e),
        }


# Global concurrency cap. The public Overpass instance rate-limits, and a single
# /safety/analyze used to fire up to 3 routes x 5 segments = 15 simultaneous
# POSTs with no semaphore and no 429 handling, which reliably produced the
# all-zeros results that then scored as "genuinely unlit street".
_OVERPASS_SEMAPHORE = asyncio.Semaphore(3)

# Small TTL cache keyed on rounded coordinates. Repeated home-screen polling
# otherwise re-queried Overpass for the same point every few seconds, burning
# the shared free quota (there was no caching anywhere in the engine).
_CACHE_TTL_S = 600.0
_cache: dict[str, tuple[float, object]] = {}


def _cache_key(lat: float, lng: float) -> str:
    # ~110 m precision: enough to reuse a cache hit for a user standing still,
    # without returning data for a materially different point.
    return f"{round(lat, 3)},{round(lng, 3)}"


def _cache_get(key: str):
    hit = _cache.get(key)
    if hit and (time.monotonic() - hit[0]) < _CACHE_TTL_S:
        return hit[1]
    if hit:
        _cache.pop(key, None)
    return None


def _cache_put(key: str, value) -> None:
    now = time.monotonic()
    # Opportunistic prune so the dict cannot grow without bound.
    if len(_cache) > 500:
        for k in [k for k, v in _cache.items() if now - v[0] > _CACHE_TTL_S]:
            _cache.pop(k, None)
    _cache[key] = (now, value)


async def _query_single_segment_sem(client, lat: float, lng: float, seg_id):
    async with _OVERPASS_SEMAPHORE:
        return await _query_single_segment(client, lat, lng, seg_id)


async def fetch_infrastructure(segments: list[dict]) -> list[dict]:
    """
    Query Overpass API for all segment midpoints, with a concurrency cap and
    a short-lived cache.

    Args:
        segments: list of segment dicts with "midpoint" key.

    Returns:
        list of infrastructure count dicts, one per segment.
    """
    if not segments:
        return []

    async with httpx.AsyncClient(timeout=15.0) as client:
        tasks = []
        cached_slots: list = [None] * len(segments)
        live_indices: list[int] = []

        for idx, seg in enumerate(segments):
            # `midpoint` was indexed directly here, outside any try, so a
            # segment without one raised out of this function entirely.
            midpoint = seg.get("midpoint") or {}
            lat = midpoint.get("lat", seg.get("lat"))
            lng = midpoint.get("lng", seg.get("lng"))
            if lat is None or lng is None:
                cached_slots[idx] = {
                    "segment_id": idx, "street_lamps": 0, "police": 0,
                    "hospitals": 0, "clinics": 0, "pharmacies": 0, "shops": 0,
                    "restaurants": 0, "bus_stops": 0, "total_elements": 0,
                    "error": "segment has no coordinates",
                }
                continue

            key = _cache_key(lat, lng)
            hit = _cache_get(key)
            if hit is not None:
                cached_slots[idx] = dict(hit, segment_id=idx)
            else:
                live_indices.append(idx)
                tasks.append(_query_single_segment_sem(client, lat, lng, idx))

        results = await asyncio.gather(*tasks, return_exceptions=True)

    for slot, r in zip(live_indices, results):
        if isinstance(r, BaseException):
            cached_slots[slot] = {
                "segment_id": slot, "street_lamps": 0, "police": 0,
                "hospitals": 0, "clinics": 0, "pharmacies": 0, "shops": 0,
                "restaurants": 0, "bus_stops": 0, "total_elements": 0,
                "error": str(r)[:200],
            }
        else:
            if not r.get("error"):
                seg = segments[slot]
                midpoint = seg.get("midpoint") or {}
                lat = midpoint.get("lat", seg.get("lat"))
                lng = midpoint.get("lng", seg.get("lng"))
                if lat is not None and lng is not None:
                    _cache_put(_cache_key(lat, lng), r)
            cached_slots[slot] = r

    return cached_slots


async def fetch_nearby_places(lat: float, lng: float) -> dict:
    """
    Fetch actual nearby safe hubs (named, with distances) around a single point.

    Returns:
        {
            "hubs": [ { category, label, name, lat, lng, distance_m }, ... ]  # sorted nearest-first
            "counts": { street_lamps, police, hospitals, clinics, pharmacies, ... }
        }
    """
    query = _build_query(lat, lng)
    key = _cache_key(lat, lng)
    hit = _cache_get(key)
    if hit is not None:
        return hit
    try:
        async with _OVERPASS_SEMAPHORE:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(
                    OVERPASS_URL,
                    data={"data": query},
                    headers=OVERPASS_HEADERS,
                )
                resp.raise_for_status()
                elements = resp.json().get("elements", [])
    except Exception as e:
        # Was a bare print(); no handler was configured for the logging module
        # anywhere in this project, so these failures were invisible.
        logging.warning("Overpass nearby-places query failed: %s", e)
        return {
            "hubs": [],
            "counts": _categorize_elements([]),
            "total_elements": 0,
            "degraded": True,
            "error": str(e)[:200],
        }

    counts = _categorize_elements(elements)
    counts["total_elements"] = len(elements)

    hubs = []
    for el in elements:
        tags = el.get("tags", {})
        category, label = _classify_place(tags)
        if not category or category == "bus_stop":
            # bus stops are counted for amenities but are not "safe hubs" to route to
            continue
        elat, elng = el.get("lat"), el.get("lon")
        if elat is None or elng is None:
            continue
        hubs.append(
            {
                "category": category,
                "label": label,
                "name": tags.get("name") or label,
                "lat": elat,
                "lng": elng,
                "distance_m": round(_haversine_m(lat, lng, elat, elng)),
            }
        )

    hubs.sort(key=lambda p: p["distance_m"])
    return {"hubs": hubs, "counts": counts}
