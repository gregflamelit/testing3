import json
import shutil

import joblib
import numpy as np
import pandas as pd
import pytest

from wine_lab.data import FEATURES, ROOT, file_sha256, holdout_indices, load_data
from wine_lab.metrics import regression_metrics
from wine_lab.predict import Predictor
from wine_lab.train import TIE_TOLERANCE


@pytest.fixture(scope="module")
def predictor():
    return Predictor()


@pytest.fixture
def record(predictor):
    frame = pd.read_csv(ROOT / "artifacts/golden_predictions.csv")
    return frame[predictor.features].iloc[0].to_dict()


def read_report(name):
    return json.loads((ROOT / "reports" / name).read_text())


def test_release_gate_passed():
    report = read_report("test_evaluation.json")
    assert report["release_gate_passed"]
    assert report["uncertainty"]["baseline_mae_improvement_95_ci"][0] > 0


def test_champion_meets_predeclared_selection_rule():
    rows = read_report("feature_benchmark.json")
    best = min(r["cv_mae"] for r in rows)
    eligible = [r for r in rows if r["cv_mae"] <= best + TIE_TOLERANCE]
    expected = sorted(eligible, key=lambda r: (r["feature_count"], r["cv_mae"], r["cv_rmse"], r["family"]))[0]
    actual = read_report("selection_lock.json")
    assert (actual["family"], actual["feature_count"]) == (expected["family"], expected["feature_count"])


def test_ten_families_and_fifteen_feature_candidates():
    assert len(read_report("tuning_summary.json")) == 10
    assert len(read_report("feature_benchmark.json")) == 15


def test_selected_schema_and_only_champion_artifact(predictor):
    lock = read_report("selection_lock.json")
    assert predictor.features == lock["selected_features"]
    assert "quality" not in predictor.features
    assert len(predictor.features) == lock["feature_count"]
    assert set(predictor.features) | set(lock["removed_features"]) == set(FEATURES)
    assert [p.name for p in (ROOT / "artifacts").glob("*.joblib")] == ["champion.joblib"]


def test_source_checksum(predictor):
    assert file_sha256(ROOT / "data/winequality-red.csv") == predictor.metadata["data_sha256"]


def test_artifact_checksum_rejects_corruption(tmp_path):
    shutil.copy(ROOT / "artifacts/metadata.json", tmp_path)
    (tmp_path / "champion.joblib").write_bytes(b"corrupted")
    with pytest.raises(ValueError, match="checksum"):
        Predictor(tmp_path)


def test_golden_predictions(predictor):
    golden = pd.read_csv(ROOT / "artifacts/golden_predictions.csv")
    actual = [r["predicted_quality"] for r in predictor.predict(golden[predictor.features].to_dict(orient="records"))]
    np.testing.assert_allclose(actual, golden.expected_prediction, atol=1e-9)


def test_persisted_test_predictions_match_artifact(predictor):
    data = load_data()
    predictions = pd.read_csv(ROOT / "reports/test_predictions.csv")
    actual = predictor.model.predict(data.iloc[predictions.row_id][predictor.features])
    np.testing.assert_allclose(actual, predictions.prediction, atol=1e-9)
    report = read_report("test_evaluation.json")
    assert regression_metrics(predictions.quality, actual)["mae"] == pytest.approx(report["champion"]["mae"])


def test_saved_split_and_folds_have_no_leakage():
    assignments = pd.read_csv(ROOT / "reports/split_assignments.csv")
    assert assignments.groupby("group_id").split.nunique().max() == 1
    folds = pd.read_csv(ROOT / "reports/cv_assignments.csv").merge(assignments, on="row_id")
    assert set(folds.split) == {"development"}
    assert folds.groupby(["seed", "group_id"]).fold.nunique().max() == 1
    assert not folds.duplicated(["seed", "row_id"]).any()


def test_scaler_training_count_proves_test_not_refitted(predictor):
    metadata = predictor.metadata
    assert not metadata["refit_on_test"]
    assert predictor.model.named_steps["scale"].n_samples_seen_ == metadata["training_rows"]
    assert metadata["training_rows"] + metadata["test_rows"] == len(load_data())


def test_predictions_deterministic_and_order_independent(predictor, record):
    a = predictor.predict([record])[0]["predicted_quality"]
    b = predictor.predict([dict(reversed(list(record.items())))])[0]["predicted_quality"]
    assert a == b == predictor.predict([record])[0]["predicted_quality"]


def test_batch_matches_individual(predictor, record):
    single = predictor.predict([record])[0]
    assert predictor.predict([record] * 4) == [single] * 4


@pytest.mark.parametrize("value", [None, "12.3", True, np.nan, np.inf, -1])
def test_bad_inference_values_rejected(predictor, record, value):
    record[predictor.features[0]] = value
    with pytest.raises(ValueError):
        predictor.predict([record])


def test_missing_input_rejected(predictor, record):
    record.pop(predictor.features[0])
    with pytest.raises(ValueError):
        predictor.predict([record])


@pytest.mark.parametrize("field", ["quality", "unknown"])
def test_extra_input_rejected(predictor, record, field):
    record[field] = 5
    with pytest.raises(ValueError):
        predictor.predict([record])


@pytest.mark.parametrize("count", [0, 1001])
def test_batch_limits(predictor, record, count):
    with pytest.raises(ValueError):
        predictor.predict([record] * count)


def test_out_of_range_is_flagged(predictor, record):
    feature = next(f for f in predictor.features if f not in ["pH", "density"])
    record[feature] = predictor.metadata["training_ranges"][feature]["max"] * 2
    assert any(feature in warning for warning in predictor.predict([record])[0]["warnings"])


def test_no_claimed_individual_interval(predictor):
    assert predictor.metadata["prediction_interval"] is None
