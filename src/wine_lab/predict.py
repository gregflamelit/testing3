from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from wine_lab.data import ROOT, file_sha256


class Predictor:
    """Load only the trusted repository champion, after verifying its checksum."""
    def __init__(self, directory: Path | None = None):
        directory = Path(directory or ROOT / "artifacts")
        self.metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
        artifact = directory / "champion.joblib"
        if file_sha256(artifact) != self.metadata["artifact_sha256"]:
            raise ValueError("Model artifact checksum mismatch")
        self.model = joblib.load(artifact)
        self.features = self.metadata["selected_features"]

    def predict(self, records: list[dict]) -> list[dict]:
        if not records or len(records) > 1000:
            raise ValueError("Provide between 1 and 1000 samples")
        for record in records:
            if not isinstance(record, dict) or set(record) != set(self.features):
                raise ValueError(f"Each sample must contain exactly: {self.features}")
            if any(isinstance(v, bool) or not isinstance(v, (float, int)) for v in record.values()):
                raise ValueError("Measurements must be numbers, not booleans, strings, or null")
        frame = pd.DataFrame.from_records(records).loc[:, self.features].astype(float)
        if not np.isfinite(frame.to_numpy()).all():
            raise ValueError("Measurements must be finite")
        if (frame < 0).any().any():
            raise ValueError("Measurements cannot be negative")
        if "density" in frame and (frame.density <= 0).any():
            raise ValueError("Density must be positive")
        if "pH" in frame and not ((frame.pH > 0) & (frame.pH <= 14)).all():
            raise ValueError("pH must be in (0, 14]")
        prediction = self.model.predict(frame)
        results = []
        for i, p in enumerate(prediction):
            warnings = []
            for f in self.features:
                bounds = self.metadata["training_ranges"][f]
                if not bounds["min"] <= frame.iloc[i][f] <= bounds["max"]:
                    warnings.append(f"{f} is outside the training range [{bounds['min']}, {bounds['max']}]")
            results.append({
                "predicted_quality": float(p), "model_version": self.metadata["model_version"],
                "warnings": warnings,
                "reference_test_mae": self.metadata["test_metrics"]["mae"],
                "note": "Continuous sensory quality estimate; test MAE is aggregate error, not an individual prediction interval.",
            })
        return results


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Predict from a CSV containing only the selected feature columns")
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    frame = pd.read_csv(args.input)
    result = Predictor().predict(frame.to_dict(orient="records"))
    pd.concat([frame, pd.DataFrame(result)], axis=1).to_csv(args.output, index=False)


if __name__ == "__main__":
    main()
