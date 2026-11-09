from __future__ import annotations

import argparse
from datetime import datetime, timezone
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import time

import joblib
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.dummy import DummyRegressor
from sklearn.inspection import permutation_importance
from sklearn.model_selection import RandomizedSearchCV, cross_validate
from sklearn.pipeline import Pipeline
from threadpoolctl import threadpool_limits

from wine_lab.data import (FEATURES, TARGET, ROOT, SEED, audit_data, duplicate_groups,
                           file_sha256, grouped_folds, holdout_indices, load_data)
from wine_lab.metrics import grouped_bootstrap, regression_metrics, subgroup_metrics
from wine_lab.models import ColumnSubset, model_catalog, pipeline

SCORING = {"mae": "neg_mean_absolute_error", "rmse": "neg_root_mean_squared_error", "r2": "r2"}
TIE_TOLERANCE = .005
ROBUSTNESS_SEEDS = [42, 17, 2026]


def json_write(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, allow_nan=False, default=str) + "\n", encoding="utf-8")


def summarize_cv(result):
    return {
        "cv_mae": float(-result["test_mae"].mean()),
        "cv_mae_sd": float(result["test_mae"].std(ddof=1)),
        "cv_rmse": float(-result["test_rmse"].mean()),
        "cv_r2": float(result["test_r2"].mean()),
        "train_mae": float(-result["train_mae"].mean()),
        "fold_maes": (-result["test_mae"]).tolist(),
        "mean_fit_seconds": float(result["fit_time"].mean()),
    }


def run_search(args):
    started = time.monotonic()
    out = Path(args.output)
    if (out / "reports/test_evaluation.json").exists():
        raise RuntimeError("This run already consumed its final test set. Use --output for a separate experiment; do not overwrite results.")
    for folder in ["reports", "artifacts"]:
        (out / folder).mkdir(parents=True, exist_ok=True)
    data_path = Path(args.data)
    df = load_data(data_path)
    dev_idx, test_idx = holdout_indices(df)
    dev = df.iloc[dev_idx].reset_index(drop=True)
    # Test outcomes are not passed into search, selection, or diagnostics.
    X, y = dev[FEATURES], dev[TARGET]
    folds = grouped_folds(dev)
    cache = joblib.Memory(out / ".cache/pipeline", verbose=0)
    protocol = {
        "seed": SEED, "data_sha256": file_sha256(data_path), "audit": audit_data(df),
        "development_rows": len(dev_idx), "test_rows": len(test_idx),
        "split": "first fold of 5-fold StratifiedGroupKFold, shuffled seed=42",
        "group_identity": "exact tuple of all 11 predictor values; target excluded",
        "primary_metric": "MAE", "tie_tolerance_mae": TIE_TOLERANCE,
        "search_draws_per_family": args.draws, "cv_folds": 5,
        "robustness_seeds": ROBUSTNESS_SEEDS, "finalist_families": args.finalists,
        "feature_counts": [3, 5, 7, 9, 11],
        "selection_rule": "Within 0.005 MAE of lowest repeated-CV MAE, choose fewest features, then MAE, then RMSE, then name",
        "feature_selection": "ExtraTrees top-k fit independently inside every training fold; all-11 passthrough control",
        "test_policy": "only locked champion and median baseline; no test-driven model or feature changes",
        "release_gate": "test MAE at least 5% below baseline and positive lower 95% paired group-bootstrap improvement bound",
        "created_utc": datetime.now(timezone.utc).isoformat(),
    }
    json_write(out / "reports/protocol.json", protocol)
    assignments = pd.DataFrame({"row_id": range(len(df)), "group_id": duplicate_groups(df), "split": "test"})
    assignments.loc[dev_idx, "split"] = "development"
    assignments.to_csv(out / "reports/split_assignments.csv", index=False)
    fold_rows = []
    for seed in ROBUSTNESS_SEEDS:
        for fold, (tr, va) in enumerate(grouped_folds(dev, seed)):
            for pos in va:
                fold_rows.append({"seed": seed, "fold": fold, "row_id": int(dev_idx[pos])})
    pd.DataFrame(fold_rows).to_csv(out / "reports/cv_assignments.csv", index=False)
    baseline_result = cross_validate(DummyRegressor(strategy="median"), X, y, cv=folds,
                                    scoring=SCORING, return_train_score=True)
    baseline_cv = summarize_cv(baseline_result)
    catalog = model_catalog()
    tuning, tuned = [], {}
    for name, (model, space) in catalog.items():
        print(f"TUNING {name}", flush=True)
        space = {f"model__{key}": value for key, value in space.items()}
        count = min(args.draws, int(np.prod([len(v) for v in space.values()])))
        search = RandomizedSearchCV(pipeline(model, memory=cache), space, n_iter=count,
                                    scoring=SCORING, refit="mae", cv=folds, random_state=SEED,
                                    n_jobs=args.jobs, error_score="raise", return_train_score=True)
        search.fit(X, y)
        table = pd.DataFrame(search.cv_results_)
        table.to_csv(out / f"reports/search_{name}.csv", index=False)
        row = {"family": name, "cv_mae": float(-search.best_score_),
               "cv_mae_sd": float(table.iloc[search.best_index_]["std_test_mae"]),
               "cv_rmse": float(-table.iloc[search.best_index_]["mean_test_rmse"]),
               "parameters": search.best_params_, "configurations": count}
        tuning.append(row)
        tuned[name] = clone(search.best_estimator_.named_steps["model"])
        json_write(out / "reports/tuning_summary.json", sorted(tuning, key=lambda r: r["cv_mae"]))
        print(f"  {name}: CV MAE={row['cv_mae']:.4f}", flush=True)
    leaders = sorted(tuning, key=lambda r: (r["cv_mae"], r["family"]))[:args.finalists]
    robust_folds = [split for seed in ROBUSTNESS_SEEDS for split in grouped_folds(dev, seed)]
    finalists = []
    for leader in leaders:
        name = leader["family"]
        for k in [3, 5, 7, 9, 11]:
            print(f"ROBUSTNESS {name} features={k} (15 folds)", flush=True)
            result = cross_validate(pipeline(clone(tuned[name]), k, cache), X, y, cv=robust_folds,
                                    scoring=SCORING, return_train_score=True, n_jobs=args.jobs,
                                    error_score="raise")
            finalists.append({"family": name, "feature_count": k, **summarize_cv(result)})
            json_write(out / "reports/feature_benchmark.json", finalists)
    best_mae = min(r["cv_mae"] for r in finalists)
    eligible = [r for r in finalists if r["cv_mae"] <= best_mae + TIE_TOLERANCE]
    winner = sorted(eligible, key=lambda r: (r["feature_count"], r["cv_mae"], r["cv_rmse"], r["family"]))[0]
    full = next(r for r in finalists if r["family"] == winner["family"] and r["feature_count"] == 11)
    winner["comparison_to_all_features"] = {
        "all_feature_cv_mae": full["cv_mae"], "mae_change": winner["cv_mae"] - full["cv_mae"],
        "paired_fold_mae_changes": (np.array(winner["fold_maes"]) - np.array(full["fold_maes"])).tolist(),
        "caution": "Repeated CV folds overlap; fold differences are descriptive, not independent significance tests.",
    }
    champion = pipeline(clone(tuned[winner["family"]]), winner["feature_count"])
    champion.fit(X, y)
    selector = champion.named_steps["select"]
    selected = FEATURES if isinstance(selector, str) else list(np.array(FEATURES)[selector.get_support()])
    # Keep the fitted scaler and regressor, replace selector with the selected columns.
    production = Pipeline([
        ("columns", ColumnSubset(selected).fit(X[selected])),
        ("scale", champion.named_steps["scale"]),
        ("model", champion.named_steps["model"]),
    ])
    # Production column selection deliberately emits arrays, including all-11 runs.
    # Dropping only the scaler's optional names preserves all learned parameters.
    if hasattr(production.named_steps["scale"], "feature_names_in_"):
        del production.named_steps["scale"].feature_names_in_
    np.testing.assert_allclose(champion.predict(X), production.predict(X[selected]), atol=1e-12)
    selection = {**winner, "selected_features": selected,
                 "removed_features": [f for f in FEATURES if f not in selected],
                 "hyperparameters": next(r["parameters"] for r in leaders if r["family"] == winner["family"])}
    json_write(out / "reports/selection_lock.json", selection)
    print(f"LOCKED {winner['family']} with {selected}", flush=True)
    # Development-only out-of-fold residuals, learning curves and negative control.
    oof_rows, learning = [], []
    for fold, (tr, va) in enumerate(folds):
        fitted = clone(champion).fit(X.iloc[tr], y.iloc[tr])
        pred = fitted.predict(X.iloc[va])
        for pos, p in zip(va, pred):
            oof_rows.append({"row_id": int(dev_idx[pos]), "fold": fold, "quality": float(y.iloc[pos]), "prediction": float(p)})
        for frac in [.4, .7, 1.0]:
            train_groups = duplicate_groups(dev)[tr]
            ids = np.unique(train_groups)
            np.random.default_rng(SEED + fold).shuffle(ids)
            use = tr[np.isin(train_groups, ids[:max(1, int(len(ids) * frac))])]
            fitted_curve = clone(champion).fit(X.iloc[use], y.iloc[use])
            learning.append({"fold": fold, "fraction": frac, "training_rows": len(use),
                             "train_mae": regression_metrics(y.iloc[use], fitted_curve.predict(X.iloc[use]))["mae"],
                             "validation_mae": regression_metrics(y.iloc[va], fitted_curve.predict(X.iloc[va]))["mae"]})
    pd.DataFrame(oof_rows).to_csv(out / "reports/development_oof_predictions.csv", index=False)
    pd.DataFrame(learning).to_csv(out / "reports/learning_curve.csv", index=False)
    # Shuffle labels at the group level so duplicate identity still shares a target.
    groups = duplicate_groups(dev)
    unique_groups = np.unique(groups)
    group_labels = np.array([y.iloc[np.flatnonzero(groups == g)[0]] for g in unique_groups])
    np.random.default_rng(SEED).shuffle(group_labels)
    shuffled = group_labels[groups]
    negative = cross_validate(clone(champion), X, shuffled, cv=folds, scoring=SCORING,
                              return_train_score=True, n_jobs=args.jobs, error_score="raise")
    neg_dummy = cross_validate(DummyRegressor(strategy="median"), X, shuffled, cv=folds,
                              scoring=SCORING, return_train_score=True)
    json_write(out / "reports/development_diagnostics.json", {
        "baseline_cv": baseline_cv, "shuffled_target_cv": summarize_cv(negative),
        "shuffled_target_baseline_cv": summarize_cv(neg_dummy),
        "negative_control_note": "One group-level label permutation is a smoke check, not a permutation significance test.",
        "selection_bias_note": "Development CV is reused for tuning and selection; final holdout supplies the independent assessment.",
    })
    # This is the only final test evaluation. Never rank challenger models on test.
    test = df.iloc[test_idx]
    test_pred = production.predict(test[selected])
    baseline = DummyRegressor(strategy="median").fit(X, y)
    baseline_pred = baseline.predict(test[FEATURES])
    test_metrics = regression_metrics(test[TARGET], test_pred)
    baseline_metrics = regression_metrics(test[TARGET], baseline_pred)
    bootstrap = grouped_bootstrap(test[TARGET], test_pred, baseline_pred, duplicate_groups(test))
    group_table = pd.DataFrame({"g": duplicate_groups(test), "y": test[TARGET].to_numpy(), "pred": test_pred}).groupby("g").mean()
    evaluation = {
        "champion": test_metrics, "baseline": baseline_metrics, "uncertainty": bootstrap,
        "relative_mae_improvement": 1 - test_metrics["mae"] / baseline_metrics["mae"],
        "by_quality": subgroup_metrics(test[TARGET], test_pred),
        "equal_weight_per_unique_group": regression_metrics(group_table.y, group_table.pred),
        "test_rows": len(test), "test_groups": len(group_table),
        "training_rows": len(dev), "all_scores_are_unrounded": True,
        "release_gate_passed": bool(test_metrics["mae"] < .95 * baseline_metrics["mae"]
                                    and bootstrap["baseline_mae_improvement_95_ci"][0] > 0),
    }
    json_write(out / "reports/test_evaluation.json", evaluation)
    predictions = pd.DataFrame({"row_id": test_idx, "group_id": duplicate_groups(test),
                                "quality": test[TARGET].to_numpy(), "prediction": test_pred, "baseline": baseline_pred})
    predictions["error"] = predictions.prediction - predictions.quality
    predictions.to_csv(out / "reports/test_predictions.csv", index=False)
    # Diagnostic only, produced after the immutable selection lock.
    importance = permutation_importance(production, test[selected], test[TARGET],
                                        scoring="neg_mean_absolute_error", n_repeats=30, random_state=SEED, n_jobs=args.jobs)
    pd.DataFrame({"feature": selected, "mae_increase": importance.importances_mean,
                  "repeat_sd": importance.importances_std}).sort_values("mae_increase", ascending=False).to_csv(
                      out / "reports/test_permutation_importance.csv", index=False)
    if not evaluation["release_gate_passed"]:
        raise RuntimeError("Release gate failed; results retained and no model published. Do not tune against the consumed test.")
    joblib.dump(production, out / "artifacts/champion.joblib", compress=3)
    metadata = {
        "model_version": "wine-quality-1.0.0", "family": winner["family"], "seed": SEED,
        "selected_features": selected, "removed_features": selection["removed_features"],
        "data_sha256": protocol["data_sha256"],
        "artifact_sha256": file_sha256(out / "artifacts/champion.joblib"),
        "training_rows": len(dev), "test_rows": len(test), "refit_on_test": False,
        "training_ranges": {f: {"min": float(X[f].min()), "max": float(X[f].max())} for f in selected},
        "test_metrics": test_metrics, "test_mae_95_ci": bootstrap["mae_95_ci"],
        "prediction_interval": None,
        "scope": "Portuguese red Vinho Verde samples; sensory quality proxy, not safety, price, or causal advice",
        "dependencies": {p: importlib.metadata.version(p) for p in ["numpy", "pandas", "scipy", "scikit-learn", "catboost", "xgboost", "joblib"]},
        "python": platform.python_version(), "elapsed_seconds": time.monotonic() - started,
    }
    json_write(out / "artifacts/metadata.json", metadata)
    fixtures = test[selected].head(8).copy()
    fixtures["expected_prediction"] = production.predict(fixtures)
    fixtures.to_csv(out / "artifacts/golden_predictions.csv", index=False)
    json_write(out / "reports/run_summary.json", {"family": winner["family"], "selected_features": selected,
               "test_mae": test_metrics["mae"], "baseline_mae": baseline_metrics["mae"],
               "elapsed_seconds": metadata["elapsed_seconds"], "model_sha256": metadata["artifact_sha256"]})
    print(json.dumps(evaluation, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", default=str(ROOT / "data/winequality-red.csv"))
    parser.add_argument("--output", default=str(ROOT))
    parser.add_argument("--draws", type=int, default=12)
    parser.add_argument("--finalists", type=int, default=3)
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args()
    if args.draws < 1 or not 1 <= args.finalists <= 10 or args.jobs < 1:
        parser.error("draws/jobs must be positive and finalists must be in [1, 10]")
    with threadpool_limits(limits=1):
        run_search(args)


if __name__ == "__main__":
    main()
