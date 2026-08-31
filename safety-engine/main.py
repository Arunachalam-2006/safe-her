"""
SafeHer Safety Engine — FastAPI application entry point.
Serves the /safety/analyze endpoint with CORS enabled.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.safety import router as safety_router

app = FastAPI(
    title="SafeHer Safety Engine",
    description="Real-time route safety analysis using OSM, OSRM, and weather data",
    version="1.0.0",
)

# Allow CORS from Expo dev server and any localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(safety_router)


@app.get("/")
async def root():
    return {
        "service": "SafeHer Safety Engine",
        "version": "1.0.0",
        "endpoints": ["/safety/analyze"],
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
