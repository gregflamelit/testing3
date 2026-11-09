import json

import numpy as np
import pandas as pd
import pytest

from wine_lab.data import ROOT, duplicate_groups, file_sha256, holdout_indices, load_data


def test_audit_is_oof_development_only_and_reference_scaling_is_fold_local():
    data = load_data()
    dev, test = holdout_indices(data)
    selected = ["volatile acidity", "sulphates", "alcohol"]
    groups = duplicate_groups(data)
    audit = json.loads((ROOT / "reports/reliability_validation_folds.json").read_text())
    seen = []
    for fold in audit:
        train = fold["training_row_ids"]
        valid = fold["validation_row_ids"]
        assert not set(train) & set(valid)
        assert set(fold["reference_row_ids"]) <= set(train)
        assert set(train) | set(valid) == set(dev)
        assert not set(valid) & set(test)
        assert not set(groups[train]) & set(groups[valid])
        np.testing.assert_allclose(fold["means"], data.iloc[train][selected].mean().to_numpy())
        assert fold["distance_cutoff"] > 0
        seen.extend(valid)
    assert len(seen) == len(set(seen)) == len(dev)


def test_flag_audit_metrics_reproduce_from_row_level_evidence():
    rows = pd.read_csv(ROOT / "reports/reliability_oof_predictions.csv")
    report = json.loads((ROOT / "reports/reliability_validation.json").read_text())
    rules = json.loads((ROOT / "web/lib/review-rules.json").read_text())
    assert rules == report["rules"]
    assert file_sha256(ROOT / "web/lib/review-rules.json") == report["rules_sha256"]
    assert file_sha256(ROOT / "artifacts/champion.joblib") == report["model_artifact_sha256"]
    np.testing.assert_allclose(rows.absolute_error, abs(rows.prediction - rows.quality))
    assert report["overall_oof_mae"] == pytest.approx(rows.absolute_error.mean())
    for summary in report["summaries"]:
        mask = rows[summary["reason"]].astype(bool)
        assert mask.sum() == summary["flagged"]["rows"]
        assert rows.loc[mask, "absolute_error"].mean() == pytest.approx(summary["flagged"]["mae"])
        assert rows.loc[~mask, "absolute_error"].mean() == pytest.approx(summary["not_flagged"]["mae"])
        assert summary["mae_difference"] == pytest.approx(summary["flagged"]["mae"] - summary["not_flagged"]["mae"])
    assert (rows.any_review == rows[["outside_range", "unusual_combination", "nearby_disagreement", "uncommon_score"]].any(axis=1)).all()
    assert json.loads((ROOT / "web/lib/generated/reliability-validation.json").read_text()) == report
