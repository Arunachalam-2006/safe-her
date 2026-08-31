"""
Weather Service — fetches current weather conditions from Open-Meteo API.
Called once per analysis using the route origin coordinates.
"""

import httpx

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


async def fetch_weather(lat: float, lng: float) -> dict:
    """
    Fetch current weather conditions from Open-Meteo.

    Returns:
        {
            "temperature": float,
            "precipitation": float,
            "rain": float,
            "visibility": float,     # metres
            "windspeed": float,      # km/h
            "weathercode": int,
            "cloudcover": float,     # %
        }
    """
    params = {
        "latitude": lat,
        "longitude": lng,
        "current": "temperature_2m,precipitation,rain,visibility,windspeed_10m,weathercode,cloudcover",
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(OPEN_METEO_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        current = data.get("current", {})
        return {
            "temperature": current.get("temperature_2m", 25.0),
            "precipitation": current.get("precipitation", 0.0),
            "rain": current.get("rain", 0.0),
            "visibility": current.get("visibility", 10000.0),
            "windspeed": current.get("windspeed_10m", 0.0),
            "weathercode": current.get("weathercode", 0),
            "cloudcover": current.get("cloudcover", 0.0),
        }
    except Exception as e:
        print(f"Weather fetch failed: {e}")
        # Return neutral defaults so scoring can still proceed
        return {
            "temperature": 25.0,
            "precipitation": 0.0,
            "rain": 0.0,
            "visibility": 10000.0,
            "windspeed": 5.0,
            "weathercode": 0,
            "cloudcover": 30.0,
        }
