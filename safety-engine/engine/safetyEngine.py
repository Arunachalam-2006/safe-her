from .ruleBasedScoring import rule_based_scoring

async def analyze_safety(features: dict) -> dict:
    """Analyze the safety score. This is the only entry point logic."""
    # TODAY: rule-based scoring
    return rule_based_scoring(features)

    # FUTURE: swap this one line for ML model
    # return await ml_model.predict(features)
