"""
Safety Analysis Router — POST /safety/analyze endpoint.
Orchestrates OSRM → Overpass (parallel) → Weather → Feature → Scoring pipeline.
"""

import logging
import asyncio
import math
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from services.osrm_service import fetch_route
from services.overpass_service import fetch_infrastructure
from services.weather_service import fetch_weather
from services.feature_service import prepare_analysis_features
from engine.safetyEngine import analyze_safety

router = APIRouter(prefix="/safety", tags=["safety"])

TravelMode = Literal["driving", "walking", "cycling"]


class Coords(BaseModel):
    # Without bounds, lat=999 / lng=-999 was accepted and interpolated straight
    # into the Overpass query string, and Pydantic v2 coerces "nan"/"inf".
    lat: float = Field(..., ge=-90.0, le=90.0, allow_inf_nan=False)
    lng: float = Field(..., ge=-180.0, le=180.0, allow_inf_nan=False)


class AnalyzeRequest(BaseModel):
    origin: Coords
    destination: Coords
    # Previously a free-form str, so mode="scooting" silently fell through to a
    # driving route and produced a safety score for the wrong travel mode.
    mode: TravelMode = "driving"


@router.post("/analyze")
async def analyze_route(req: AnalyzeRequest):
    """
    Full safety analysis pipeline:
    1. Fetch routes (including alternatives) from OSRM
    2. Query Overpass for infrastructure (parallel for all routes' segments)
    3. Fetch weather from Open-Meteo
    4. Prepare features & score each route
    """
    try:
        # Step 1: OSRM route(s)
        routes_data = await fetch_route(
            req.origin.lat,
            req.origin.lng,
            req.destination.lat,
            req.destination.lng,
            req.mode,
        )
    except ValueError as e:
        # Unroutable pair (e.g. both points in the ocean) is bad input, not a
        # gateway failure.
        raise HTTPException(status_code=422, detail="No route found between those points")
    except Exception:
        # Previously `str(e)` was returned verbatim, which embeds the full
        # OSRM request URL - i.e. the user's exact origin and destination.
        logging.exception("OSRM routing failed")
        raise HTTPException(status_code=502, detail="Routing service unavailable")

    if not routes_data:
        raise HTTPException(status_code=500, detail="No routes found")

    # Step 2 & 3: Run Overpass (for all segments across all routes) + Weather in parallel
    degraded_reasons: list[str] = []
    try:
        weather_task = fetch_weather(req.origin.lat, req.origin.lng)
        infra_tasks = [fetch_infrastructure(r["segments"]) for r in routes_data]

        # Budget must EXCEED the inner per-request HTTP timeout (Overpass uses
        # 15s) or this outer wait always fires first and throws away results
        # that were about to succeed.
        results = await asyncio.wait_for(
            asyncio.gather(weather_task, *infra_tasks), timeout=25.0
        )

        weather = results[0]
        infra_by_route = results[1:]

        # The upstream services swallow their own exceptions and return
        # neutral placeholders, so a timeout here is not the only failure mode.
        # Detect both and tell the client the data is not trustworthy.
        if not weather:
            weather = {}
            degraded_reasons.append("weather")
        for r_idx, infra in enumerate(infra_by_route):
            if not infra:
                infra_by_route[r_idx] = []
                degraded_reasons.append("infrastructure")
            else:
                failed = [i for i in infra if isinstance(i, dict) and i.get("error")]
                if failed and len(failed) == len(infra):
                    degraded_reasons.append("infrastructure")

    except Exception as e:
        logging.warning("Parallel services failed or timed out: %s", e)
        degraded_reasons.append("infrastructure" if "infra" in str(e).lower() else "services")
        # Keep the segments and pair them with zeroed infrastructure rather than
        # an empty list. `prepare_analysis_features` zips segments against
        # infra_results, so an empty list produced zero segments and crashed
        # the scorer with UnboundLocalError.
        weather = {}
        infra_by_route = [
            [{"total_elements": 0, "street_lamps": 0, "police": 0, "error": str(e)} for _ in r["segments"]]
            for r in routes_data
        ]

    # Step 4 & 5: Process and score each route option
    analyzed_routes = []
    
    for idx, route_data in enumerate(routes_data):
        infra_results = infra_by_route[idx] if idx < len(infra_by_route) else []
        
        # Step 4: Prepare features
        features_input = prepare_analysis_features(
            segments=route_data["segments"],
            infra_results=infra_results,
            weather=weather,
            turn_count=route_data["turn_count"],
            distance_m=route_data["distance_m"],
        )

        # Step 5: ML/Rule Engine scoring
        result = await analyze_safety(features_input)
        
        # Inject OSRM geometry and route info for Leaflet web/mobile
        result["coordinates"] = [[pt[1], pt[0]] for pt in route_data["geometry"]]
        result["distanceKm"] = route_data["distance_m"] / 1000.0
        result["durationMin"] = max(1, round(route_data["duration_s"] / 60.0))
        result["routeIndex"] = idx

        # Be honest with the client: a score computed from zeroed infrastructure
        # looks identical to a genuinely unlit, unpatrolled street otherwise.
        result["degraded"] = bool(degraded_reasons)
        if degraded_reasons:
            result["degraded_sources"] = sorted(set(degraded_reasons))
            result["confidence"] = min(result.get("confidence", 1.0), 0.35)

        analyzed_routes.append(result)

    return analyzed_routes
