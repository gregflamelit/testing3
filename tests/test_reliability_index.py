import importlib.util
import json

from wine_lab.data import FEATURES, ROOT, file_sha256, holdout_indices, load_data


def test_neighbors_only_use_unique_development_profiles():
    index = json.loads((ROOT / "web/lib/generated/reliability.json").read_text())
    frame = load_data()
    train, test = holdout_indices(frame)
    ids = [r["row_id"] for r in index["samples"]]
    assert set(ids) <= set(train)
    assert not set(ids) & set(test)
    assert len(ids) == len(set(ids)) == index["reference_count"]
    projected = [tuple(row["values"]) for row in index["samples"]]
    assert len(projected) == len(set(projected))
    for row in index["samples"]:
        actual = frame.iloc[row["row_id"]]
        assert row["values"] == actual[index["features"]].tolist()
        assert row["observed_quality"] == actual.quality
    assert file_sha256(ROOT / "artifacts/champion.joblib") == index["source_artifact_sha256"]


def test_training_only_index_reproduces():
    spec = importlib.util.spec_from_file_location("export_reliability", ROOT / "scripts/export_reliability.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    assert module.generate() == json.loads((ROOT / "web/lib/generated/reliability.json").read_text())
