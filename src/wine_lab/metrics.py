from __future__ import annotations

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score, median_absolute_error


def regression_metrics(y, pred) -> dict:
    y, pred = np.asarray(y, dtype=float), np.asarray(pred, dtype=float)
    if y.shape != pred.shape or y.size == 0 or not np.isfinite(y).all() or not np.isfinite(pred).all():
        raise ValueError("Metrics require matching nonempty finite arrays")
    error = pred - y
    return {
        "mae": float(mean_absolute_error(y, pred)),
        "rmse": float(np.sqrt(mean_squared_error(y, pred))),
        "r2": float(r2_score(y, pred)) if len(y) > 1 and np.ptp(y) > 0 else None,
        "median_absolute_error": float(median_absolute_error(y, pred)),
        "within_half_point": float(np.mean(np.abs(error) <= .5)),
        "within_one_point": float(np.mean(np.abs(error) <= 1)),
        "bias": float(error.mean()), "p90_absolute_error": float(np.quantile(np.abs(error), .9)),
    }


def subgroup_metrics(y, pred) -> dict:
    y, pred = np.asarray(y), np.asarray(pred)
    return {str(int(v)): {"n": int((y == v).sum()), **regression_metrics(y[y == v], pred[y == v])} for v in np.unique(y)}


def grouped_bootstrap(y, pred, baseline, groups, repetitions=2000, seed=42) -> dict:
    """Resample identity groups, retaining within-group dependence and row weights."""
    rng = np.random.default_rng(seed)
    y, pred, baseline, groups = map(np.asarray, (y, pred, baseline, groups))
    unique = np.unique(groups)
    members = [np.flatnonzero(groups == group) for group in unique]
    maes, gains = [], []
    for _ in range(repetitions):
        idx = np.concatenate([members[i] for i in rng.integers(0, len(members), len(members))])
        m = np.mean(np.abs(y[idx] - pred[idx]))
        maes.append(m)
        gains.append(np.mean(np.abs(y[idx] - baseline[idx])) - m)
    return {
        "repetitions": repetitions, "method": "paired percentile bootstrap of duplicate groups",
        "mae_95_ci": np.quantile(maes, [.025, .975]).tolist(),
        "baseline_mae_improvement_95_ci": np.quantile(gains, [.025, .975]).tolist(),
        "fraction_resamples_better_than_baseline": float(np.mean(np.asarray(gains) > 0)),
    }
