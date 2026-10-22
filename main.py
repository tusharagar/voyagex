from pathlib import Path
import pickle

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"


def load_model(filename):
    path = MODEL_DIR / filename

    with path.open("rb") as file:
        return pickle.load(file)


cancellation_model = load_model("cancellation_bundle.pkl")
fill_model = load_model("fill_model_rf.pkl")