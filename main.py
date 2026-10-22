
from pathlib import Path

import joblib
import pandas as pd
import xgboost as xgb
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="VoyageX ML API", version="1.0.0")

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"

cancellation_model = xgb.XGBClassifier()
cancellation_model.load_model(
    str(MODEL_DIR / "cancellation_model.json")
)

fill_model = joblib.load(
    MODEL_DIR / "fill_model_rf.pkl"
)

feature_file = MODEL_DIR / "feature_names.txt"

if feature_file.exists():
    with feature_file.open("r", encoding="utf-8") as f:
        cancellation_features = [
            line.strip() for line in f if line.strip()
        ]
else:
    cancellation_features = None


class PredictionInput(BaseModel):
    features: dict[str, float]


@app.get("/")
def home():
    return {
        "message": "VoyageX API is running",
        "models": ["cancellation", "fill"]
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/predict/cancellation")
def predict_cancellation(data: PredictionInput):
    try:
        features = cancellation_features or list(data.features.keys())
        missing = [f for f in features if f not in data.features]

        if missing:
            raise HTTPException(
                status_code=422,
                detail={"missing_features": missing}
            )

        frame = pd.DataFrame(
            [[data.features[f] for f in features]],
            columns=features
        )

        prediction = cancellation_model.predict(frame)

        result = {"prediction": prediction.tolist()}

        if hasattr(cancellation_model, "predict_proba"):
            result["probabilities"] = (
                cancellation_model.predict_proba(frame).tolist()
            )

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/predict/fill")
def predict_fill(data: PredictionInput):
    try:
        frame = pd.DataFrame([data.features])
        prediction = fill_model.predict(frame)

        result = {"prediction": prediction.tolist()}

        if hasattr(fill_model, "predict_proba"):
            result["probabilities"] = (
                fill_model.predict_proba(frame).tolist()
            )

        return result

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
