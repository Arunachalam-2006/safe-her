"""
Overpass Service — queries OpenStreetMap Overpass API for safety-relevant
infrastructure around each route segment midpoint.
Runs all segment queries in parallel via asyncio.gather().
"""

import asyncio
import math
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


async def fetch_infrastructure(segments: list[dict]) -> list[dict]:
    """
    Query Overpass API for all segment midpoints in parallel.

    Args:
        segments: list of segment dicts with "midpoint" key.

    Returns:
        list of infrastructure count dicts, one per segment.
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        tasks = [
            _query_single_segment(
                client,
                seg["midpoint"]["lat"],
                seg["midpoint"]["lng"],
                seg["segment_id"],
            )
            for seg in segments
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    # Handle any exceptions that leaked through
    cleaned = []
    for i, r in enumerate(results):
        if isinstance(r, Exception):
            cleaned.append(
                {
                    "segment_id": i,
                    "street_lamps": 0,
                    "police": 0,
                    "hospitals": 0,
                    "clinics": 0,
                    "pharmacies": 0,
                    "shops": 0,
                    "restaurants": 0,
                    "bus_stops": 0,
                    "total_elements": 0,
                    "error": str(r),
                }
            )
        else:
            cleaned.append(r)

    return cleaned


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
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.post(
                OVERPASS_URL,
                data={"data": query},
                headers=OVERPASS_HEADERS,
            )
            resp.raise_for_status()
            elements = resp.json().get("elements", [])
    except Exception as e:
        print(f"Overpass nearby-places query failed: {e}")
        return {"hubs": [], "counts": _categorize_elements([]), "error": str(e)}

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
