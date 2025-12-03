from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import joblib
import numpy as np

app = FastAPI()

# Allow frontend to access backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load your trained ML models
pain_model = joblib.load("pain_model.joblib")
therapy_model = joblib.load("therapy_model.joblib")
feature_list = ['cycle_day','temp','gsr','emg','pain']

# Data shape sent from frontend
class InputData(BaseModel):
    cycle_day: int
    pain: int
    temp: float
    gsr: float
    emg: float

@app.post("/predict")
def predict(data: InputData):
    # Convert to correct ML format
    arr = np.array([[ 
        data.cycle_day,
        data.temp,
        data.gsr,
        data.emg,
        data.pain
    ]])

    predicted_pain = float(pain_model.predict(arr)[0])
    therapy_label = int(therapy_model.predict(arr)[0])

    therapy_map = {
        0: "light heat",
        1: "medium heat + mild vibration",
        2: "strong heat + vibration",
        3: "combo high intensity"
    }

    return {
        "predicted_pain": predicted_pain,
        "therapy": therapy_map.get(therapy_label, "light heat")
    }
