from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedGroupKFold

FEATURES = [
    "fixed acidity", "volatile acidity", "citric acid", "residual sugar",
    "chlorides", "free sulfur dioxide", "total sulfur dioxide", "density",
    "pH", "sulphates", "alcohol",
]
TARGET = "quality"
SEED = 42
ROOT = Path(__file__).resolve().parents[2]


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_frame(frame: pd.DataFrame, *, training: bool = True) -> pd.DataFrame:
    expected = FEATURES + ([TARGET] if training else [])
    if set(frame.columns) != set(expected) or len(frame.columns) != len(expected):
        raise ValueError(f"Expected exactly these columns: {expected}")
    if frame.empty:
        raise ValueError("At least one sample is required")
    if any(not pd.api.types.is_numeric_dtype(frame[c]) or pd.api.types.is_bool_dtype(frame[c]) for c in expected):
        raise ValueError("All measurements must be numeric, not strings or booleans")
    out = frame.loc[:, expected].astype(float)
    if not np.isfinite(out.to_numpy()).all():
        raise ValueError("Missing, infinite, and NaN measurements are not allowed")
    if (out[FEATURES] < 0).any().any():
        raise ValueError("Measurements cannot be negative")
    if (out["density"] <= 0).any() or ((out["pH"] <= 0) | (out["pH"] > 14)).any():
        raise ValueError("Density must be positive and pH must be in (0, 14]")
    if training and ((out[TARGET] % 1 != 0).any() or not out[TARGET].between(0, 10).all()):
        raise ValueError("Quality must be an integer on the 0-10 scale")
    return out


def load_data(path: Path | None = None) -> pd.DataFrame:
    return validate_frame(pd.read_csv(path or ROOT / "data/winequality-red.csv"))


def duplicate_groups(frame: pd.DataFrame) -> np.ndarray:
    # Quality is deliberately absent from identity construction.
    keys = list(frame[FEATURES].itertuples(index=False, name=None))
    lookup: dict[tuple, int] = {}
    return np.array([lookup.setdefault(key, len(lookup)) for key in keys], dtype=int)


def grouped_folds(frame: pd.DataFrame, seed: int = SEED, n_splits: int = 5):
    groups = duplicate_groups(frame)
    splitter = StratifiedGroupKFold(n_splits=n_splits, shuffle=True, random_state=seed)
    return list(splitter.split(frame[FEATURES], frame[TARGET], groups))


def holdout_indices(frame: pd.DataFrame):
    return grouped_folds(frame, SEED)[0]


def audit_data(frame: pd.DataFrame) -> dict:
    return {
        "rows": len(frame), "input_count": len(FEATURES),
        "missing_cells": int(frame.isna().sum().sum()),
        "duplicate_rows": int(frame.duplicated().sum()),
        "unique_predictor_groups": int(len(np.unique(duplicate_groups(frame)))),
        "conflicting_target_groups": int(frame.groupby(FEATURES)[TARGET].nunique().gt(1).sum()),
        "quality_counts": {str(int(k)): int(v) for k, v in frame[TARGET].value_counts().sort_index().items()},
        "ranges": {c: {"min": float(frame[c].min()), "max": float(frame[c].max())} for c in FEATURES},
    }
