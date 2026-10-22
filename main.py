
from pathlib import Path
import pickle

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="VoyageX ML API")

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"


def load_model(filename):
    path = MODEL_DIR / filename

    with path.open("rb") as file:
        return pickle.load(file)


cancellation_model = load_model("1.cancellation_bundle.pkl")
fill_model = load_model("2. fill_model_rf.pkl")


class PredictionInput(BaseModel):
    features: dict[str, float]


@app.get("/")
def home():
    return {
        "message": "VoyageX API is running",
        "available_models": ["cancellation", "fill"]
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/predict/cancellation")
def predict_cancellation(data: PredictionInput):
    try:
        prediction = cancellation_model.predict([data.features])
        return {"prediction": prediction.tolist()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/predict/fill")
def predict_fill(data: PredictionInput):
    try:
        prediction = fill_model.predict([data.features])
        return {"prediction": prediction.tolist()}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
