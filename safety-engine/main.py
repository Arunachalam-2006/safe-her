"""
SafeHer Safety Engine — FastAPI application entry point.
Serves the /safety/analyze endpoint with CORS enabled.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.safety import router as safety_router
from routes.spot_safety import router as spot_router
from routes.hubs import router as hubs_router
from routes.reports import router as reports_router
from routes.journeys import router as journeys_router

app = FastAPI(
    title="SafeHer Safety Engine",
    description="Real-time route safety analysis using OSM, OSRM, and weather data",
    version="1.0.0",
)

# Allow CORS from the Expo dev server / app. No cookies are used, so a wildcard
# origin is paired with allow_credentials=False (the valid, browser-accepted combo).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(safety_router)
app.include_router(spot_router)
app.include_router(hubs_router)
app.include_router(reports_router)
app.include_router(journeys_router)


@app.get("/")
async def root():
    return {
        "service": "SafeHer Safety Engine",
        "version": "1.0.0",
        "endpoints": [
            "/safety/analyze",
            "/safety/spot",
            "/safety/hubs",
            "/reports",
            "/journeys/save",
        ],
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
