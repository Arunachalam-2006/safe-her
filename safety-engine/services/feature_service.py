import math
from datetime import datetime

def normalize_segment_features(segment: dict, infra: dict, weather: dict, turn_count: int, distance_m: float):
    """Normalize raw values into 0.0-1.0 for a single segment based on STEP 4 rules."""
    
    # 1. LIGHTING SCORE
    street_lamp_count = infra.get("street_lamps", 0)
    segment_length_km = max(segment.get("length_m", 0) / 1000.0, 0.1)
    lamp_density_per_km = street_lamp_count / segment_length_km
    
    if lamp_density_per_km >= 15: lighting_score = 1.0
    elif lamp_density_per_km >= 10: lighting_score = 0.85
    elif lamp_density_per_km >= 5: lighting_score = 0.70
    elif lamp_density_per_km >= 2: lighting_score = 0.55
    elif lamp_density_per_km == 0: lighting_score = 0.40
    else: lighting_score = 0.40
    
    lighting_confidence = 0.4 if street_lamp_count == 0 else 0.9

    # 2. ROAD TYPE SCORE
    scores = {
        "motorway": 0.90, "trunk": 0.90,
        "primary": 0.85,  "secondary": 0.75,
        "tertiary": 0.70, "residential": 0.65,
        "service": 0.50,  "path": 0.40,
        "footway": 0.40,  "cycleway": 0.60,
        "unknown": 0.60
    }
    
    road_types = segment.get("road_types", ["unknown"])
    
    # Find most common road type
    type_counts = {}
    for rt in road_types:
        matched = False
        rt_lower = rt.lower() if rt else ""
        for key in scores.keys():
            if key in rt_lower:
                type_counts[key] = type_counts.get(key, 0) + 1
                matched = True
                break
        if not matched:
            type_counts["unknown"] = type_counts.get("unknown", 0) + 1
    
    dominant_road_type = "unknown"
    if type_counts:
        dominant_road_type = max(type_counts, key=type_counts.get)
        
    road_score = scores.get(dominant_road_type, 0.60)

    # 3. POLICE SCORE
    police = infra.get("police", 0)
    # Overpass queries for 1000m. If count >= 1 it's within 1000m.
    if police >= 1: 
        police_score = 1.00 # Or 0.75 depending on actual distance, but we only have counts. Using 1.0 for simplicity if found within 1km.
    else: 
        police_score = 0.25
        
    # 4. HOSPITAL SCORE
    hospitals = infra.get("hospitals", 0)
    clinics = infra.get("clinics", 0)
    if hospitals >= 1 or clinics >= 1:
        hospital_score = 1.00 # Overpass hospital=2000m, clinic=1500m. True distance requires processing elements.
    else:
        hospital_score = 0.30

    # 5. AMENITY SCORE
    shops = infra.get("shops", 0)
    restaurants = infra.get("restaurants", 0)
    pharmacies = infra.get("pharmacies", 0)
    bus_stops = infra.get("bus_stops", 0)
    amenity_total = shops + restaurants + pharmacies + bus_stops
    
    if amenity_total >= 10: amenity_score = 1.00
    elif amenity_total >= 6: amenity_score = 0.80
    elif amenity_total >= 3: amenity_score = 0.60
    elif amenity_total >= 1: amenity_score = 0.40
    else: amenity_score = 0.20

    # 6. WEATHER SCORE
    rain_mm = weather.get("rain", 0.0)
    visibility_m = weather.get("visibility", 10000.0)
    wind_kmh = weather.get("windspeed", 0.0)
    weather_code = weather.get("weathercode", 0)
    
    w_score = 1.0
    if rain_mm > 5:          w_score -= 0.30
    elif rain_mm > 0:        w_score -= 0.10
    
    if visibility_m < 1000: w_score -= 0.30
    elif visibility_m < 5000: w_score -= 0.15
    
    if wind_kmh > 50:    w_score -= 0.20
    elif wind_kmh > 30:  w_score -= 0.10
    
    if weather_code >= 80: w_score -= 0.20
    w_score = max(0.0, w_score)

    # 7. TIME SCORE
    now = datetime.now()
    hour = now.hour
    dow = now.weekday()
    if 6 <= hour <= 20:    time_base = 1.00
    elif 20 <= hour <= 22: time_base = 0.75
    elif 22 <= hour <= 23: time_base = 0.55
    else:                  time_base = 0.45
    if dow >= 5: time_base *= 0.95

    # 8. ROUTE SCORE
    distance_km = max(distance_m / 1000.0, 0.1)
    turns_per_km = turn_count / distance_km
    if turns_per_km < 2:  r_score = 0.90
    elif turns_per_km < 5:  r_score = 0.75
    elif turns_per_km < 10: r_score = 0.60
    else: r_score = 0.45

    return {
        "factors": {
            "lighting": lighting_score,
            "road": road_score,
            "police": police_score,
            "hospital": hospital_score,
            "amenities": amenity_score,
            "weather": w_score,
            "time": time_base,
            "route": r_score
        },
        "features": {
            "street_lamp_count": street_lamp_count,
            "lamp_density_per_km": lamp_density_per_km,
            "lighting_confidence": lighting_confidence,
            "road_type": dominant_road_type,
            "road_score": road_score,
            "police_distance_m": 1000 if police >= 1 else 3000,
            "police_count_1km": police,
            "hospital_distance_m": 2000 if hospitals >= 1 else 5000,
            "clinic_distance_m": 1500 if clinics >= 1 else 5000,
            "shop_count": shops,
            "restaurant_count": restaurants,
            "pharmacy_count": pharmacies,
            "bus_stop_count": bus_stops,
            "amenity_total": amenity_total,
            "turns": turn_count,
            "turns_per_km": turns_per_km
        }
    }

def prepare_analysis_features(segments: list, infra_results: list, weather: dict, turn_count: int, distance_m: float):
    """Produces the 'features' dict expected by safetyEngine.py"""
    
    segment_data = []
    
    # Aggregated raw features for ML
    total_lamps = sum(i.get("street_lamps", 0) for i in infra_results)
    total_shops = sum(i.get("shops", 0) for i in infra_results)
    total_restaurants = sum(i.get("restaurants", 0) for i in infra_results)
    total_pharm = sum(i.get("pharmacies", 0) for i in infra_results)
    total_bus = sum(i.get("bus_stops", 0) for i in infra_results)
    total_police = sum(i.get("police", 0) for i in infra_results)
    
    now = datetime.now()
    hour = now.hour
    dow = now.weekday()
    
    global_features = {
        "hour": hour,
        "day_of_week": dow,
        "is_night": hour >= 19 or hour <= 6,
        "is_weekend": dow >= 5,
        "street_lamp_count": total_lamps,
        "lamp_density_per_km": total_lamps / max(distance_m / 1000.0, 0.1),
        "lighting_confidence": 0.4 if total_lamps == 0 else 0.9,
        "road_type": "unknown", # Will aggregate later
        "road_score": 0.0,
        "police_distance_m": 1000 if total_police >= 1 else 3000,
        "police_count_1km": total_police,
        "hospital_distance_m": 2000,
        "clinic_distance_m": 1500,
        "shop_count": total_shops,
        "restaurant_count": total_restaurants,
        "pharmacy_count": total_pharm,
        "bus_stop_count": total_bus,
        "amenity_total": total_shops + total_restaurants + total_pharm + total_bus,
        "rain_mm": weather.get("rain", 0.0),
        "visibility_m": weather.get("visibility", 10000.0),
        "wind_kmh": weather.get("windspeed", 0.0),
        "weather_code": weather.get("weathercode", 0),
        "distance_m": distance_m,
        "turns": turn_count,
        "turns_per_km": turn_count / max(distance_m / 1000.0, 0.1)
    }

    for seg, infra in zip(segments, infra_results):
        norm = normalize_segment_features(seg, infra, weather, turn_count, distance_m)
        segment_data.append({
            "segment_id": seg["segment_id"],
            "lat": seg["midpoint"]["lat"],
            "lng": seg["midpoint"]["lng"],
            "length_m": seg.get("length_m", 0),
            "factors": norm["factors"],
            "features": norm["features"],
            "overpass_results": infra.get("total_elements", 0)
        })
        
    return {
        "global_features": global_features,
        "segments": segment_data
    }
