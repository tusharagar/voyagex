
from pathlib import Path
import pickle
import xgboost as xgb
import joblib

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"


def load_cancellation_model():
    model = xgb.XGBClassifier()
    model.load_model(str(MODEL_DIR / "cancellation_model.json"))
    return model


def load_fill_model():
    path = MODEL_DIR / "fill_model_rf.pkl"

    try:
        return joblib.load(path)
    except Exception:
        with path.open("rb") as file:
            return pickle.load(file)


cancellation_model = load_cancellation_model()
fill_model = load_fill_model()
