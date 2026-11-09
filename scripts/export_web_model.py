"""Export the locked CatBoost ensemble and scaler; no fitting or model selection."""
from pathlib import Path
import json
import sys

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from wine_lab.data import FEATURES, file_sha256, load_data
from wine_lab.predict import Predictor


def export():
    predictor = Predictor()
    output = ROOT / "web/lib/generated"
    output.mkdir(parents=True, exist_ok=True)
    raw_path = ROOT / ".cache/catboost-export.json"
    predictor.model.named_steps["model"].save_model(str(raw_path), format="json")
    raw = json.loads(raw_path.read_text())
    if any(s["split_type"] != "FloatFeature" for t in raw["oblivious_trees"] for s in t["splits"]):
        raise ValueError("Web runtime only supports numeric symmetric trees")
    scaler = predictor.model.named_steps["scale"]
    model = {
        "source_artifact_sha256": predictor.metadata["artifact_sha256"],
        "features": predictor.features,
        "means": scaler.mean_.tolist(), "scales": scaler.scale_.tolist(),
        "scale_and_bias": raw["scale_and_bias"],
        "trees": [{"splits": [[s["float_feature_index"], s["border"]] for s in tree["splits"]],
                   "leaves": tree["leaf_values"]} for tree in raw["oblivious_trees"]],
    }
    (output / "model.json").write_text(json.dumps(model, separators=(",", ":")), encoding="utf-8")
    (output / "metadata.json").write_text(json.dumps(predictor.metadata, indent=2), encoding="utf-8")
    read = lambda file: json.loads((ROOT / "reports" / file).read_text())
    analytics = {
        "evaluation": read("test_evaluation.json"), "selection": read("selection_lock.json"),
        "tuning": read("tuning_summary.json"), "feature_benchmark": read("feature_benchmark.json"),
        "audit": read("protocol.json")["audit"],
        "importance": pd.read_csv(ROOT / "reports/test_permutation_importance.csv").to_dict(orient="records"),
        "test_predictions": pd.read_csv(ROOT / "reports/test_predictions.csv")[["quality", "prediction"]].round(6).to_dict(orient="records"),
    }
    (output / "analytics.json").write_text(json.dumps(analytics, separators=(",", ":")), encoding="utf-8")
    frame = load_data()[predictor.features]
    ranges = predictor.metadata["training_ranges"]
    rng = np.random.default_rng(2026)
    random = pd.DataFrame({f: rng.uniform(ranges[f]["min"] * .7, ranges[f]["max"] * 1.3, 4000) for f in predictor.features})
    # Probe just below/at/above every exported split in original measurement units.
    edges = []
    center = frame.median().to_numpy()
    for info in raw["features_info"]["float_features"]:
        i = info["flat_feature_index"]
        for border in info["borders"]:
            for delta in [-1e-7, 0, 1e-7]:
                row = center.copy()
                row[i] = (border + delta) * scaler.scale_[i] + scaler.mean_[i]
                edges.append(row)
    cases = pd.concat([frame, random, pd.DataFrame(edges, columns=predictor.features)], ignore_index=True)
    expected = predictor.model.predict(cases)
    fixtures = {"source_artifact_sha256": model["source_artifact_sha256"],
                "features": predictor.features, "inputs": cases.to_numpy().tolist(),
                "predictions": expected.tolist(), "dataset_cases": len(frame),
                "random_cases": len(random), "boundary_cases": len(edges)}
    (output / "parity-fixtures.json").write_text(json.dumps(fixtures, separators=(",", ":")), encoding="utf-8")
    print(f"Exported {len(model['trees'])} fitted trees and {len(cases)} parity fixtures; original artifact unchanged")


if __name__ == "__main__":
    export()
