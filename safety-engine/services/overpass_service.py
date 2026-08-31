"""
Overpass Service — queries OpenStreetMap Overpass API for safety-relevant
infrastructure around each route segment midpoint.
Runs all segment queries in parallel via asyncio.gather().
"""

import asyncio
import httpx

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


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
            headers={"Content-Type": "application/x-www-form-urlencoded"},
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
