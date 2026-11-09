"""Audit frozen review rules using grouped out-of-fold development predictions.

Temporary fold models use frozen champion settings and the fixed three inputs.
The released artifact and final held-out set are never fitted or evaluated here.
"""
import argparse
import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd
from catboost import CatBoostRegressor
from sklearn.preprocessing import StandardScaler
from scipy.stats import spearmanr
from threadpoolctl import threadpool_limits

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from wine_lab.data import FEATURES, duplicate_groups, file_sha256, grouped_folds, holdout_indices, load_data

REASONS = ["outside_range", "unusual_combination", "nearby_disagreement", "uncommon_score", "any_review"]


def make_reference(train, selected, scaler, rules):
    unique = train.drop_duplicates(FEATURES)
    representatives = unique.drop_duplicates(selected)
    scores = unique.groupby(selected).quality.agg(["min", "max"])
    values = representatives[selected].to_numpy()
    scaled = scaler.transform(values)
    distances = np.sqrt(np.mean((scaled[:, None, :] - scaled[None, :, :]) ** 2, axis=2))
    np.fill_diagonal(distances, np.inf)
    cutoff = float(np.quantile(np.sort(distances, axis=1)[:, :rules["neighbors"]].mean(axis=1), rules["unusual_quantile"]))
    ranges = np.asarray([scores.loc[tuple(row)].to_numpy() for row in values])
    return scaled, ranges, cutoff, representatives.index.to_numpy()


def summarize(frame, reason, groups, seed=42, repetitions=2000):
    flag = frame[reason].astype(bool).to_numpy()
    error = frame.absolute_error.to_numpy()
    large = error > 1
    def stats(mask):
        values = error[mask]
        return {"rows": int(mask.sum()), "groups": int(len(np.unique(groups[mask]))),
                "mae": float(values.mean()) if len(values) else None,
                "median_absolute_error": float(np.median(values)) if len(values) else None,
                "rmse": float(np.sqrt(np.mean(values ** 2))) if len(values) else None,
                "error_over_one_rate": float(large[mask].mean()) if len(values) else None}
    yes, no = stats(flag), stats(~flag)
    aggregated = pd.DataFrame({"group": groups, "yes_n": flag.astype(int), "no_n": (~flag).astype(int),
                               "yes_error": error * flag, "no_error": error * ~flag}).groupby("group").sum()
    rng = np.random.default_rng(seed)
    sampled = rng.integers(0, len(aggregated), (repetitions, len(aggregated)))
    total = {c: aggregated[c].to_numpy()[sampled].sum(axis=1) for c in aggregated}
    valid = (total["yes_n"] > 0) & (total["no_n"] > 0)
    changes = total["yes_error"][valid] / total["yes_n"][valid] - total["no_error"][valid] / total["no_n"][valid]
    interval = np.quantile(changes, [.025, .975]).tolist() if len(changes) else None
    return {"reason": reason, "flagged": yes, "not_flagged": no,
            "flagged_share": float(flag.mean()),
            "mae_difference": yes["mae"] - no["mae"] if yes["mae"] is not None and no["mae"] is not None else None,
            "mae_difference_95_group_bootstrap_ci": interval,
            "fraction_large_errors_flagged": float((flag & large).sum() / large.sum()) if large.sum() else None,
            "higher_mae_interval_above_zero": bool(interval and interval[0] > 0)}


def run(output=ROOT):
    metadata = json.loads((ROOT / "artifacts/metadata.json").read_text())
    lock = json.loads((ROOT / "reports/selection_lock.json").read_text())
    rules_path = ROOT / "web/lib/review-rules.json"
    rules = json.loads(rules_path.read_text())
    artifact_hash = file_sha256(ROOT / "artifacts/champion.joblib")
    assert artifact_hash == metadata["artifact_sha256"]
    data = load_data()
    dev_ids, test_ids = holdout_indices(data)
    dev = data.iloc[dev_ids].reset_index(drop=True)
    selected = metadata["selected_features"]
    settings = {k.removeprefix("model__"): v for k, v in lock["hyperparameters"].items()}
    rows, audits = [], []
    groups = duplicate_groups(dev)
    for fold, (tr, va) in enumerate(grouped_folds(dev, 42)):
        train, validation = dev.iloc[tr], dev.iloc[va]
        scaler = StandardScaler().fit(train[selected].to_numpy())
        model = CatBoostRegressor(**settings, random_seed=42, thread_count=1, verbose=False, allow_writing_files=False)
        model.fit(scaler.transform(train[selected].to_numpy()), train.quality)
        predictions = model.predict(scaler.transform(validation[selected].to_numpy()))
        refs, observed_ranges, cutoff, ref_ids = make_reference(train, selected, scaler, rules)
        distance = np.sqrt(np.mean((scaler.transform(validation[selected].to_numpy())[:, None, :] - refs[None, :, :]) ** 2, axis=2))
        nearest = np.argsort(distance, axis=1, kind="stable")[:, :rules["neighbors"]]
        ranges = {f: [float(train[f].min()), float(train[f].max())] for f in selected}
        audits.append({"fold": fold, "training_row_ids": dev_ids[tr].tolist(), "validation_row_ids": dev_ids[va].tolist(),
                       "reference_row_ids": dev_ids[ref_ids].tolist(), "training_rows": len(tr), "validation_rows": len(va),
                       "reference_profiles": len(refs), "distance_cutoff": cutoff, "means": scaler.mean_.tolist(),
                       "scales": scaler.scale_.tolist(), "ranges": ranges})
        for pos, (index, prediction) in enumerate(zip(va, predictions)):
            sample = dev.iloc[index]
            outside = any(not bounds[0] <= sample[f] <= bounds[1] for f, bounds in ranges.items())
            neighbor_distance = float(distance[pos, nearest[pos]].mean())
            neighboring_scores = observed_ranges[nearest[pos]]
            codes = {
                "outside_range": bool(outside),
                "unusual_combination": bool(not outside and neighbor_distance > cutoff),
                "nearby_disagreement": bool(neighboring_scores.max() - neighboring_scores.min() >= rules["disagreement_span"]),
                "uncommon_score": bool(prediction <= rules["uncommon_low"] or prediction >= rules["uncommon_high"]),
            }
            rows.append({"row_id": int(dev_ids[index]), "group_id": int(groups[index]), "fold": fold,
                         "quality": float(sample.quality), "prediction": float(prediction),
                         "absolute_error": float(abs(prediction - sample.quality)),
                         "neighborhood_distance": neighbor_distance, "distance_cutoff": cutoff,
                         **codes, "any_review": any(codes.values())})
    frame = pd.DataFrame(rows).sort_values("row_id").reset_index(drop=True)
    assert set(frame.row_id) == set(dev_ids) and not set(frame.row_id) & set(test_ids)
    group_ids = frame.group_id.to_numpy()
    summaries = [summarize(frame, reason, group_ids) for reason in REASONS]
    unique_group = frame.groupby("group_id").first().reset_index()
    sensitivities = [summarize(unique_group, reason, unique_group.group_id.to_numpy(), repetitions=1000) for reason in REASONS]
    correlation = spearmanr(frame.neighborhood_distance, frame.absolute_error)
    report = {
        "model_artifact_sha256": artifact_hash, "dataset_sha256": metadata["data_sha256"],
        "rule_version": rules["version"], "rules_sha256": file_sha256(rules_path), "rules": rules,
        "development_rows": len(dev), "excluded_test_rows": len(test_ids), "folds": 5, "seed": 42,
        "overall_oof_mae": float(frame.absolute_error.mean()), "overall_error_over_one_rate": float((frame.absolute_error > 1).mean()),
        "summaries": summaries, "unique_group_sensitivity": sensitivities,
        "distance_error_spearman": float(correlation.statistic),
        "method": "Five grouped OOF development folds. Frozen champion parameters and three-input schema; scaler, ranges, reference profiles and distance cutoff rebuilt using fold training rows only.",
        "limitations": [
            "Development data previously informed model/feature selection. This is an exploratory audit, not a new independent test.",
            "The original 11-measurement identity defines groups; distinct lab profiles with identical selected inputs may occur across folds.",
            "Flag definitions were frozen before this audit. No cutoff or model changes were chosen from these results.",
            "Rule subgroups overlap. Percentile group-bootstrap intervals are exploratory, unadjusted for multiple comparisons, and do not fully capture dependence from overlapping fold training sets.",
            "Observed association is not calibrated individual confidence or proof that human review improves outcomes.",
            "Rare flagged subgroups can have wide intervals. Additional independent data is needed for confirmation.",
        ],
    }
    output = Path(output)
    (output / "reports").mkdir(parents=True, exist_ok=True)
    frame.to_csv(output / "reports/reliability_oof_predictions.csv", index=False)
    (output / "reports/reliability_validation_folds.json").write_text(json.dumps(audits, indent=2))
    (output / "reports/reliability_validation.json").write_text(json.dumps(report, indent=2, allow_nan=False))
    (output / "web/lib/generated").mkdir(parents=True, exist_ok=True)
    (output / "web/lib/generated/reliability-validation.json").write_text(json.dumps(report, separators=(",", ":"), allow_nan=False))
    assert file_sha256(ROOT / "artifacts/champion.joblib") == artifact_hash
    print(json.dumps({"overall_oof_mae": report["overall_oof_mae"], "summaries": summaries}, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT)
    args = parser.parse_args()
    with threadpool_limits(limits=1):
        run(args.output)
