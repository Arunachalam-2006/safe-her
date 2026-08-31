"""
Safety Analysis Router — POST /safety/analyze endpoint.
Orchestrates OSRM → Overpass (parallel) → Weather → Feature → Scoring pipeline.
"""

import logging
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.osrm_service import fetch_route
from services.overpass_service import fetch_infrastructure
from services.weather_service import fetch_weather
from services.feature_service import prepare_analysis_features
from engine.safetyEngine import analyze_safety

router = APIRouter(prefix="/safety", tags=["safety"])


class Coords(BaseModel):
    lat: float
    lng: float


class AnalyzeRequest(BaseModel):
    origin: Coords
    destination: Coords
    mode: str = "driving"


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
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"OSRM routing failed: {str(e)}")

    if not routes_data:
        raise HTTPException(status_code=500, detail="No routes found")

    # Step 2 & 3: Run Overpass (for all segments across all routes) + Weather in parallel
    try:
        weather_task = fetch_weather(req.origin.lat, req.origin.lng)
        infra_tasks = [fetch_infrastructure(r["segments"]) for r in routes_data]
        
        results = await asyncio.wait_for(
            asyncio.gather(weather_task, *infra_tasks), timeout=12.0
        )
        
        weather = results[0]
        infra_by_route = results[1:]
    except Exception as e:
        logging.warning(f"Parallel services failed or timed out: {e}")
        weather = {}
        infra_by_route = [[] for _ in routes_data]

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
        
        analyzed_routes.append(result)

    return analyzed_routes
