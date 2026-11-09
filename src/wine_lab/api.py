from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict

from wine_lab.predict import Predictor


@asynccontextmanager
async def lifespan(app):
    app.state.predictor = Predictor()
    yield


app = FastAPI(title="Wine Lab Champion Model", version="1.0.0", lifespan=lifespan)


class PredictionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    samples: list[dict]


@app.get("/health")
def health():
    return {"status": "ok", "model_version": app.state.predictor.metadata["model_version"]}


@app.get("/model")
def metadata():
    return app.state.predictor.metadata


@app.post("/predict")
def predict(request: PredictionRequest):
    try:
        return {"predictions": app.state.predictor.predict(request.samples)}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
