"""Create a training-only neighborhood index without changing the champion."""
from pathlib import Path
import argparse
import json
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from wine_lab.data import FEATURES, file_sha256, holdout_indices, load_data


def generate():
    metadata = json.loads((ROOT / "artifacts/metadata.json").read_text())
    data_path = ROOT / "data/winequality-red.csv"
    assert file_sha256(data_path) == metadata["data_sha256"]
    assert file_sha256(ROOT / "artifacts/champion.joblib") == metadata["artifact_sha256"]
    df = load_data()
    train, test = holdout_indices(df)
    selected = metadata["selected_features"]
    dev = df.iloc[train].drop_duplicates(FEATURES)
    # One representative real sample for each distinct projection into the three
    # model inputs. Identical projections must not inflate local density.
    reference = dev.drop_duplicates(selected)
    groups = dev.groupby(selected)["quality"]
    samples = []
    for row_id, row in reference.iterrows():
        key = tuple(row[f] for f in selected)
        scores = groups.get_group(key)
        samples.append({"row_id": int(row_id), "sample_id": f"UCI sample {row_id + 1}",
                        "values": [float(row[f]) for f in selected],
                        "observed_quality": int(row.quality),
                        "same_measurements_quality_range": [int(scores.min()), int(scores.max())]})
    # Use the champion's development-only scaler, recorded by the web export.
    fitted = json.loads((ROOT / "web/lib/generated/model.json").read_text())
    assert fitted["source_artifact_sha256"] == metadata["artifact_sha256"]
    values = np.asarray([sample["values"] for sample in samples])
    scaled = (values - fitted["means"]) / fitted["scales"]
    distance = np.sqrt(np.mean((scaled[:, None, :] - scaled[None, :, :]) ** 2, axis=2))
    np.fill_diagonal(distance, np.inf)
    # Each reference point's distance to five OTHER distinct input profiles.
    scores = np.sort(distance, axis=1)[:, :5].mean(axis=1)
    return {
        "source_artifact_sha256": metadata["artifact_sha256"],
        "dataset_sha256": metadata["data_sha256"], "features": selected,
        "means": fitted["means"], "scales": fitted["scales"],
        "training_rows": len(train), "heldout_rows_excluded": len(test),
        "reference_count": len(samples), "neighbors_for_distance": 5,
        "unusual_distance_threshold": round(float(np.quantile(scores, .95)), 10),
        "threshold_quantile": .95,
        "method": "Mean 5-neighbor root-mean-square standardized distance; 95th percentile of leave-one-profile-out development distances",
        "interpretation": "Training-support heuristic only; not an accuracy probability, prediction interval, or calibrated uncertainty estimate",
        "samples": samples,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = generate()
    path = ROOT / "web/lib/generated/reliability.json"
    if args.check:
        assert json.loads(path.read_text()) == result, "Training reference index does not reproduce"
        print("Training-only reliability index reproduced; held-out rows excluded")
    else:
        path.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")
        print(f"Exported {result['reference_count']} distinct training profiles; distance cutoff {result['unusual_distance_threshold']}")
