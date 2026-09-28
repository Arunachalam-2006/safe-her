"""
SafeHer Safety Engine — FastAPI application entry point.
Serves the /safety/analyze endpoint with CORS enabled.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from routes.safety import router as safety_router
from routes.spot_safety import router as spot_router
from routes.hubs import router as hubs_router
from routes.reports import router as reports_router
from routes.journeys import router as journeys_router
from routes.government import router as government_router

import db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
)
log = logging.getLogger("safeher.engine")

VERSION = "1.2.0"

app = FastAPI(
    title="SafeHer Safety Engine",
    description="Real-time route safety analysis using OSM, OSRM, and weather data",
    version=VERSION,
)

# ── CORS ───────────────────────────────────────────────────────────────
# Previously `allow_origins=["*"]` app-wide. Combined with the officer API
# having no authentication, that meant ANY website a user visited could read
# the full report database (precise victim coordinates) and mutate officer
# workflow state from their browser.
#
# Native apps (Android/iOS) send no Origin header and are unaffected by CORS,
# so restricting this only affects browser clients. Configure real origins with
# SAFEH_ALLOWED_ORIGINS (comma-separated); the defaults cover local dev.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "SAFEH_ALLOWED_ORIGINS",
        "http://localhost:8081,http://localhost:19006,http://127.0.0.1:8081",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Officer-Key"],
)

app.include_router(safety_router)
app.include_router(spot_router)
app.include_router(hubs_router)
app.include_router(reports_router)
app.include_router(journeys_router)
app.include_router(government_router)


@app.get("/")
async def root():
    return {
        "service": "SafeHer Safety Engine",
        "version": VERSION,
        "persistence": "sqlite" if db.storage_available() else "unavailable",
        "endpoints": [
            "GET  /health",
            "POST /safety/analyze",
            "POST /safety/spot",
            "POST /safety/hubs",
            "GET  /reports",
            "POST /reports",
            "GET  /journeys",
            "POST /journeys/save",
            "PATCH /journeys/{journey_id}/rating",
            "GET  /government/reports",
            "GET  /government/reports/{report_id}",
            "POST /government/reports/{report_id}/actions",
            "GET  /government/stats",
            "GET  /government/sos",
            "POST /government/sos",
            "POST /government/sos/{alert_id}",
        ],
    }


@app.get("/health")
async def health():
    # Previously always returned status "ok" even in the degraded path, where
    # every write was being silently dropped.
    ok = db.storage_available()
    return JSONResponse(
        status_code=200 if ok else 503,
        content={
            "status": "ok" if ok else "degraded",
            "database": "connected" if ok else "unavailable",
            "version": VERSION,
            "cors_origins": ALLOWED_ORIGINS,
        },
    )
