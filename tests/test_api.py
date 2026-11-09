import json

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from wine_lab.api import app
from wine_lab.data import ROOT


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def sample():
    metadata = json.loads((ROOT / "artifacts/metadata.json").read_text())
    return pd.read_csv(ROOT / "artifacts/golden_predictions.csv")[metadata["selected_features"]].iloc[0].to_dict()


def test_health_and_metadata(client):
    assert client.get("/health").json()["status"] == "ok"
    response = client.get("/model")
    assert response.status_code == 200
    assert response.json()["selected_features"]


def test_end_to_end_predict(client, sample):
    response = client.post("/predict", json={"samples": [sample, sample]})
    assert response.status_code == 200
    result = response.json()["predictions"]
    assert len(result) == 2
    assert result[0] == result[1]
    assert isinstance(result[0]["predicted_quality"], float)


@pytest.mark.parametrize("payload", [{}, {"samples": []}, {"samples": [{}]}, {"samples": [{"quality": 5}]}, {"samples": [], "extra": 1}])
def test_api_rejects_bad_payload(client, payload):
    assert client.post("/predict", json=payload).status_code == 422


def test_api_rejects_string_measurement(client, sample):
    sample[next(iter(sample))] = "5.3"
    assert client.post("/predict", json={"samples": [sample]}).status_code == 422


def test_openapi_documents_routes(client):
    assert {"/health", "/model", "/predict"} <= set(client.get("/openapi.json").json()["paths"])
