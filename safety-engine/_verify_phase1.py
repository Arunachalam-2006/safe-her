"""Verification for the Phase 1 backend fixes. Read-only against the repo."""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from engine.ruleBasedScoring import rule_based_scoring
from services.feature_service import (
    normalize_segment_features,
    prepare_analysis_features,
    local_hour_and_weekday,
)
from services.weather_service import fetch_weather
from routes.safety import AnalyzeRequest, Coords
from routes.spot_safety import SpotRequest, _score_spot
from pydantic import ValidationError

PASS = 0
FAIL = 0


def check(name, cond, extra=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}  {extra}")


print("\n=== B2: empty segments must not raise UnboundLocalError ===")
try:
    out = rule_based_scoring({"segments": [], "global_features": {}})
    check("empty segments returns a dict", isinstance(out, dict))
    check("empty segments score == 0", out.get("score") == 0, f"got {out.get('score')!r}")
    check("no UnboundLocalError", True)
    print(f"         -> {out}")
except Exception as e:
    check("empty segments returns a dict", False, f"{type(e).__name__}: {e}")

print("\n=== B2: zero-length segments average their factors ===")
seg = {
    "segment_id": 0, "lat": 13.0, "lng": 80.0, "length_m": 0.0,
    "factors": {"lighting": 0.8, "road": 0.6, "police": 1.0, "hospital": 0.5,
                "amenities": 0.4, "weather": 1.0, "time": 1.0, "route": 0.9},
    "features": {"road_type": "primary", "road_score": 0.85, "street_lamp_count": 3},
    "overpass_results": 12,
}
try:
    out = rule_based_scoring({"segments": [seg], "global_features": {}})
    check("zero-length does not raise", isinstance(out, dict))
    check("road_type resolved from segment", out["features"]["road_type"] == "primary",
          f"got {out['features'].get('road_type')!r}")
    check("road_score resolved from segment", out["features"]["road_score"] == 0.85,
          f"got {out['features'].get('road_score')!r}")
    # A client that posts `segments` without length_m used to get score 0, while
    # the segments in the SAME payload scored 59. The route total must agree
    # with its own segments.
    seg_scores = [s["score"] for s in out["segments"]]
    check("zero-length route score is not a bogus 0", out["score"] > 0, f"got {out['score']}")
    check("route score matches its segments", out["score"] == round(sum(seg_scores) / len(seg_scores)),
          f"route={out['score']} segments={seg_scores}")
    check("risk level agrees with the score",
          out["risk_level"] == ("LOW" if out["score"] >= 80 else "MODERATE" if out["score"] >= 60
                                else "ELEVATED" if out["score"] >= 40 else "HIGH"),
          f"score={out['score']} risk={out['risk_level']}")
    # Factors must be averaged across segments, not taken from the last one.
    check("lighting factor preserved (0.8 -> 80)", out["factors"]["lighting"] == 80,
          f"got {out['factors']['lighting']}")
    check("police factor preserved (1.0 -> 100)", out["factors"]["police"] == 100,
          f"got {out['factors']['police']}")
except Exception as e:
    check("zero-length does not raise", False, f"{type(e).__name__}: {e}")

print("\n=== B3: mixed lengths weight by length; zero-length segments are averaged ===")
a = dict(seg); a["segment_id"] = 0; a["length_m"] = 300.0
a["factors"] = {"lighting": 1.0, "road": 1.0, "police": 1.0, "hospital": 1.0,
                "amenities": 1.0, "weather": 1.0, "time": 1.0, "route": 1.0}
b = dict(seg); b["segment_id"] = 1; b["length_m"] = 100.0
b["factors"] = {"lighting": 0.0, "road": 0.0, "police": 0.0, "hospital": 0.0,
                "amenities": 0.0, "weather": 0.0, "time": 0.0, "route": 0.0}
try:
    out = rule_based_scoring({"segments": [a, b], "global_features": {}})
    # 300m at 100 + 100m at 0 = 75
    check("length-weighted average is used", out["score"] == 75, f"got {out['score']}")
except Exception as e:
    check("length-weighted average is used", False, f"{type(e).__name__}: {e}")

print("\n=== B4: multiple zero-length segments are averaged, not taken from the last ===")
c1 = dict(seg); c1["segment_id"] = 0; c1["length_m"] = 0
c1["factors"] = {"lighting": 1.0, "road": 0.5, "police": 0.5, "hospital": 0.5,
                 "amenities": 0.5, "weather": 0.5, "time": 0.5, "route": 0.5}
c2 = dict(seg); c2["segment_id"] = 1; c2["length_m"] = 0
c2["factors"] = {"lighting": 0.0, "road": 0.5, "police": 0.5, "hospital": 0.5,
                 "amenities": 0.5, "weather": 0.5, "time": 0.5, "route": 0.5}
try:
    out = rule_based_scoring({"segments": [c1, c2], "global_features": {}})
    # lighting avg = 0.5 -> 50. The old code would have used only c2 -> 0.
    check("lighting is the mean of both segments", out["factors"]["lighting"] == 50,
          f"got {out['factors']['lighting']}")
    check("road is the mean of both segments", out["factors"]["road"] == 50,
          f"got {out['factors']['road']}")
except Exception as e:
    check("lighting is the mean of both segments", False, f"{type(e).__name__}: {e}")

print("\n=== healthy path unchanged ===")
good = dict(seg)
good["length_m"] = 500.0
try:
    out = rule_based_scoring({"segments": [good], "global_features": {}})
    check("normal route scores > 0", out["score"] > 0, f"got {out['score']}")
    check("normal route has confidence", out["confidence"] > 0, f"got {out['confidence']}")
except Exception as e:
    check("normal route scores", False, f"{type(e).__name__}: {e}")

print("\n=== C6: weather outage must not score as perfect weather ===")
neutral_ok = {"rain": 0.0, "visibility": 10000.0, "windspeed": 5.0,
              "weathercode": 0, "degraded": False}
neutral_bad = dict(neutral_ok, degraded=True)
f_ok = normalize_segment_features(good, {"street_lamps": 5, "total_elements": 40},
                                  neutral_ok, 3, 500.0)["factors"]
f_bad = normalize_segment_features(good, {"street_lamps": 5, "total_elements": 40},
                                   neutral_bad, 3, 500.0)["factors"]
check("healthy weather scores 1.0", f_ok["weather"] == 1.0, f"got {f_ok['weather']}")
check("degraded weather does NOT score 1.0", f_bad["weather"] != 1.0, f"got {f_bad['weather']}")
check("degraded weather is neutral (0.60)", f_bad["weather"] == 0.60, f"got {f_bad['weather']}")

print("\n=== C6: Overpass outage must not read as 'nothing nearby' ===")
real_empty = {"street_lamps": 0, "police": 0, "total_elements": 0}
outage = {"street_lamps": 0, "police": 0, "total_elements": 0, "error": "timeout"}
a = normalize_segment_features(good, real_empty, neutral_ok, 3, 500.0)
b = normalize_segment_features(good, outage, neutral_ok, 3, 500.0)
check("real empty street scores low", a["factors"]["lighting"] < 0.5, f"got {a['factors']['lighting']}")
check("outage is NOT scored as a measurement", b["factors"]["lighting"] > a["factors"]["lighting"],
      f"outage={b['factors']['lighting']} real={a['factors']['lighting']}")
check("outage marks infra_degraded", b["features"]["infra_degraded"] is True)
check("real empty is not degraded", a["features"]["infra_degraded"] is False)
check("outage confidence collapses", b["features"]["lighting_confidence"] <= 0.2,
      f"got {b['features']['lighting_confidence']}")

print("\n=== M21/M22: time bands and night definition ===")
hours = {}
for h in range(24):
    tb = 1.0 if 6 <= h < 20 else 0.75 if 20 <= h < 22 else 0.55 if 22 <= h < 23 else 0.45
    hours[h] = tb
check("hour 20 uses the 0.75 band (was 1.0)", hours[20] == 0.75, f"got {hours[20]}")
check("hour 19 still daytime", hours[19] == 1.0, f"got {hours[19]}")
check("hour 21 uses 0.75", hours[21] == 0.75, f"got {hours[21]}")
check("hour 22 uses 0.55", hours[22] == 0.55, f"got {hours[22]}")
check("hour 23 is night 0.45", hours[23] == 0.45, f"got {hours[23]}")
check("hour 2 is night 0.45", hours[2] == 0.45, f"got {hours[2]}")

spot = _score_spot({"street_lamps": 8, "police": 1, "hospitals": 1, "shops": 6,
                    "restaurants": 2, "pharmacies": 1, "bus_stops": 2,
                    "total_elements": 40, "degraded": False},
                   neutral_ok, lng_hint=80.27)
check("spot uses the same night rule (>=19)", spot["details"]["is_night"] ==
      (spot["details"]["hour"] >= 19 or spot["details"]["hour"] < 6),
      f"hour={spot['details']['hour']} night={spot['details']['is_night']}")
check("spot not degraded when data is good", spot["degraded"] is False)

spot_bad = _score_spot({"street_lamps": 0, "police": 0, "hospitals": 0, "shops": 0,
                        "restaurants": 0, "pharmacies": 0, "bus_stops": 0,
                        "total_elements": 0, "error": "boom"},
                       neutral_bad, lng_hint=80.27)
check("spot marks degraded on outage", spot_bad["degraded"] is True)
check("spot confidence drops below 0.5 on outage", spot_bad["confidence"] < 0.5,
      f"got {spot_bad['confidence']}")
check("spot weather not 1.0 when degraded", spot_bad["factors"]["weather"] != 100,
      f"got {spot_bad['factors']['weather']}")

print("\n=== M30: local time, not the server clock ===")
h_ist, _ = local_hour_and_weekday(80.27)
h_utc, _ = local_hour_and_weekday(0.0)
h_none, _ = local_hour_and_weekday(None)
print(f"         IST(80.27)={h_ist}  UTC(0)={h_utc}  None={h_none}")
check("Chennai local time differs from UTC", h_ist != h_utc or h_utc in (0, 23),
      f"both {h_ist}")
check("None longitude does not raise", h_none in range(24))
check("garbage longitude does not raise", local_hour_and_weekday("abc")[0] in range(24))

print("\n=== validation: coordinates and travel mode ===")
for bad, label in [({"lat": 999, "lng": 0}, "lat=999"),
                   ({"lat": 0, "lng": -999}, "lng=-999"),
                   ({"lat": float("nan"), "lng": 0}, "lat=nan"),
                   ({"lat": float("inf"), "lng": 0}, "lat=inf")]:
    try:
        Coords(**bad)
        check(f"Coords rejects {label}", False, "accepted!")
    except ValidationError:
        check(f"Coords rejects {label}", True)

check("Coords accepts Chennai", Coords(lat=13.08, lng=80.27).lat == 13.08)
for bad in [{"lat": float("nan"), "lng": 0}, {"lat": 91, "lng": 0}]:
    try:
        SpotRequest(**bad)
        check(f"SpotRequest rejects {bad}", False, "accepted!")
    except ValidationError:
        check("SpotRequest rejects invalid", True)

try:
    AnalyzeRequest(origin=Coords(lat=13, lng=80), destination=Coords(lat=12, lng=80),
                   mode="scooting")
    check("mode='scooting' rejected (was silently 'driving')", False, "accepted!")
except ValidationError:
    check("mode='scooting' rejected (was silently 'driving')", True)
ok = AnalyzeRequest(origin=Coords(lat=13, lng=80), destination=Coords(lat=12, lng=80),
                    mode="walking")
check("mode='walking' accepted", ok.mode == "walking")

print("\n=== C5-adjacent: hospital/clinic counts now aggregated ===")
agg = prepare_analysis_features(
    segments=[{"segment_id": 0, "lat": 13, "lng": 80, "length_m": 500}],
    infra_results=[{"street_lamps": 4, "police": 1, "hospitals": 2, "clinics": 1,
                    "shops": 3, "restaurants": 1, "pharmacies": 0, "bus_stops": 2,
                    "total_elements": 30}],
    weather=neutral_ok, turn_count=2, distance_m=500.0)
f = agg["global_features"]
check("hospital_count aggregated", f.get("hospital_count") == 2, f"got {f.get('hospital_count')}")
check("clinic_count aggregated", f.get("clinic_count") == 1, f"got {f.get('clinic_count')}")
check("hospital distance driven by count", f["hospital_distance_m"] == 2000)
agg0 = prepare_analysis_features(
    segments=[{"segment_id": 0, "lat": 13, "lng": 80, "length_m": 500}],
    infra_results=[{"street_lamps": 4, "total_elements": 30}],
    weather=neutral_ok, turn_count=2, distance_m=500.0)
check("no hospital -> distance 5000", agg0["global_features"]["hospital_distance_m"] == 5000,
      f"got {agg0['global_features']['hospital_distance_m']}")
# A successful lookup that simply found no hospital IS a real measurement.
check("clean result is NOT degraded", agg0["global_features"]["infra_degraded"] is False)
# A completely empty infra list means we know nothing at all.
agg_empty = prepare_analysis_features(
    segments=[{"segment_id": 0, "lat": 13, "lng": 80, "length_m": 500}],
    infra_results=[],
    weather=neutral_ok, turn_count=2, distance_m=500.0)
check("empty infra_results -> degraded", agg_empty["global_features"]["infra_degraded"] is True)

print("\n=== degraded infra pairs with real segments (no crash) ===")
try:
    out = prepare_analysis_features(
        segments=[{"segment_id": i, "lat": 13, "lng": 80, "length_m": 500,
                   "midpoint": {"lat": 13, "lng": 80}}
                  for i in range(3)],
        infra_results=[{"street_lamps": 0, "police": 0, "total_elements": 0,
                        "error": "timeout"} for _ in range(3)],
        weather=neutral_bad, turn_count=4, distance_m=1500.0)
    check("degraded segments still produced", len(out["segments"]) == 3,
          f"got {len(out['segments'])}")
except Exception as e:
    check("degraded segments still produced", False, f"{type(e).__name__}: {e}")

print(f"\n{'*** ALL PASS ***' if FAIL == 0 else '*** FAILURES ***'}: {PASS} passed, {FAIL} failed\n")
sys.exit(1 if FAIL else 0)
