def rule_based_scoring(features_input: dict) -> dict:
    """Execute STEP 5 rules on the prepared features."""
    
    segments_data = features_input.get("segments", [])
    global_features = features_input.get("global_features", {})

    WEIGHTS = {
        "lighting":   0.20,
        "road":       0.15,
        "police":     0.15,
        "hospital":   0.10,
        "amenities":  0.10,
        "weather":    0.10,
        "time":       0.10,
        "route":      0.10
    }

    final_segments = []
    total_length = 0.0
    weighted_score_sum = 0.0
    
    # Aggregating factor score averages
    global_factors = {k: 0.0 for k in WEIGHTS.keys()}
    
    confidence = 1.0

    for seg in segments_data:
        raw_score = 0.0
        factors = seg["factors"]
        
        for k, weight in WEIGHTS.items():
            factor_score = factors.get(k, 0.0)
            raw_score += factor_score * weight
            global_factors[k] += factor_score * seg["length_m"]

        segment_score = round(raw_score * 100)
        
        risk_level = "HIGH"
        if segment_score >= 80: risk_level = "LOW"
        elif segment_score >= 60: risk_level = "MODERATE"
        elif segment_score >= 40: risk_level = "ELEVATED"
        
        length_m = seg["length_m"]
        total_length += length_m
        weighted_score_sum += (segment_score * length_m)

        final_segments.append({
            "segment_id": seg["segment_id"],
            "score": segment_score,
            "risk_level": risk_level,
            "lat": seg["lat"],
            "lng": seg["lng"],
            "length_m": length_m
        })
        
        # Confidence penalties
        if seg["overpass_results"] == 0:
            confidence -= 0.08
        if seg["features"].get("street_lamp_count", 0) == 0:
            confidence -= 0.05

    confidence = max(0.50, round(confidence, 2))

    if total_length > 0:
        final_route_score = int(round(weighted_score_sum / total_length))
        for k in global_factors:
            global_factors[k] = int(round((global_factors[k] / total_length) * 100))
    else:
        final_route_score = 0
        global_factors = {k: int(round(factors[k] * 100)) for k in WEIGHTS.keys()}

    final_risk = "HIGH"
    if final_route_score >= 80: final_risk = "LOW"
    elif final_route_score >= 60: final_risk = "MODERATE"
    elif final_route_score >= 40: final_risk = "ELEVATED"

    # Best guess dominant road_type
    dominant_road = "unknown"
    if segments_data:
        dominant_road = segments_data[0]["features"].get("road_type", "unknown")
    global_features["road_type"] = dominant_road
    global_features["road_score"] = segments_data[0]["features"].get("road_score", 0.0)

    return {
        "score": final_route_score,
        "risk_level": final_risk,
        "confidence": confidence,
        "factors": global_factors,
        "features": global_features,
        "segments": final_segments
    }
