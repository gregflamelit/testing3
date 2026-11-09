import numpy as np
import pandas as pd
import pytest

from wine_lab.data import (FEATURES, TARGET, audit_data, duplicate_groups, grouped_folds,
                           holdout_indices, load_data, validate_frame)


@pytest.fixture
def data():
    return load_data()


def test_source_shape_and_quality(data):
    assert data.shape == (1599, 12)
    assert data.quality.between(3, 8).all()
    assert audit_data(data)["duplicate_rows"] == 240
    assert audit_data(data)["conflicting_target_groups"] == 0


def test_target_absent_from_inputs():
    assert TARGET not in FEATURES
    assert len(FEATURES) == len(set(FEATURES)) == 11


def test_groups_ignore_target(data):
    modified = data.copy()
    modified[TARGET] = np.arange(len(data)) % 11
    np.testing.assert_array_equal(duplicate_groups(data), duplicate_groups(modified))


def test_groups_cover_duplicates(data):
    assert len(np.unique(duplicate_groups(data))) == 1359


def test_holdout_no_group_leakage(data):
    tr, te = holdout_indices(data)
    groups = duplicate_groups(data)
    assert not set(groups[tr]) & set(groups[te])
    assert not set(tr) & set(te)
    assert set(tr) | set(te) == set(range(len(data)))
    assert .15 < len(te) / len(data) < .25


def test_holdout_deterministic(data):
    a, b = holdout_indices(data), holdout_indices(data)
    for left, right in zip(a, b):
        np.testing.assert_array_equal(left, right)


@pytest.mark.parametrize("seed", [42, 17, 2026])
def test_every_cv_fold_is_disjoint_and_covers_dev(data, seed):
    dev = data.iloc[holdout_indices(data)[0]].reset_index(drop=True)
    groups = duplicate_groups(dev)
    val = []
    for tr, va in grouped_folds(dev, seed):
        assert not set(groups[tr]) & set(groups[va])
        assert not set(tr) & set(va)
        val.extend(va)
    assert sorted(val) == list(range(len(dev)))


@pytest.mark.parametrize("column", FEATURES + [TARGET])
def test_missing_columns_rejected(data, column):
    with pytest.raises(ValueError, match="columns"):
        validate_frame(data.drop(columns=column))


@pytest.mark.parametrize("value", [np.nan, np.inf, -np.inf, -1])
def test_invalid_measurements_rejected(data, value):
    frame = data.head(3).copy()
    frame.loc[0, "alcohol"] = value
    with pytest.raises(ValueError):
        validate_frame(frame)


@pytest.mark.parametrize("value", [2.5, -1, 11])
def test_invalid_target_rejected(data, value):
    frame = data.head(3).copy()
    frame.loc[0, TARGET] = value
    with pytest.raises(ValueError, match="Quality"):
        validate_frame(frame)


def test_extra_target_or_columns_rejected(data):
    with pytest.raises(ValueError):
        validate_frame(data, training=False)
    with pytest.raises(ValueError):
        validate_frame(data.assign(extra=1))


def test_duplicate_column_names_rejected(data):
    with pytest.raises(ValueError):
        validate_frame(pd.concat([data, data[[FEATURES[0]]]], axis=1))


def test_empty_rejected(data):
    with pytest.raises(ValueError):
        validate_frame(data.iloc[:0])


def test_string_and_bool_rejected(data):
    for value in ["1.5", True]:
        frame = data.head(2).copy()
        frame["alcohol"] = value
        with pytest.raises(ValueError, match="numeric"):
            validate_frame(frame)


@pytest.mark.parametrize("field,value", [("pH", 0), ("pH", 15), ("density", 0)])
def test_physical_guards(data, field, value):
    frame = data.head(2).copy()
    frame[field] = value
    with pytest.raises(ValueError):
        validate_frame(frame)
