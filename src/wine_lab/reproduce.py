"""Rebuild the locked champion without repeating or changing model selection."""
import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from threadpoolctl import threadpool_limits

from wine_lab.data import ROOT, file_sha256, holdout_indices, load_data
from wine_lab.models import ColumnSubset, model_catalog


def rebuild(output: Path):
    metadata = json.loads((ROOT / "artifacts/metadata.json").read_text())
    lock = json.loads((ROOT / "reports/selection_lock.json").read_text())
    data_path = ROOT / "data/winequality-red.csv"
    if file_sha256(data_path) != metadata["data_sha256"]:
        raise ValueError("Dataset checksum mismatch")
    frame = load_data(data_path)
    train, _ = holdout_indices(frame)
    features = lock["selected_features"]
    model = model_catalog()[lock["family"]][0]
    model.set_params(**{k.removeprefix("model__"): v for k, v in lock["hyperparameters"].items()})
    # Match the scaler/model ndarray path used by fold-local SelectFromModel.
    production = Pipeline([("columns", ColumnSubset(features)), ("scale", StandardScaler()), ("model", model)])
    with threadpool_limits(limits=1):
        production.fit(frame.iloc[train][features], frame.iloc[train].quality)
    golden = pd.read_csv(ROOT / "artifacts/golden_predictions.csv")
    pred = production.predict(golden[features])
    np.testing.assert_allclose(pred, golden.expected_prediction, atol=1e-7, rtol=1e-7)
    output.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(production, output, compress=3)
    print(f"Rebuilt locked champion; golden predictions agree. Wrote {output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".cache/rebuilt_champion.joblib")
    args = parser.parse_args()
    if args.output.resolve() == (ROOT / "artifacts/champion.joblib").resolve():
        parser.error("Reproduction writes a separate artifact; release promotion must update metadata/checksum together")
    rebuild(args.output)


if __name__ == "__main__":
    main()
