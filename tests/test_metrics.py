import numpy as np
import pytest

from wine_lab.metrics import grouped_bootstrap, regression_metrics, subgroup_metrics


def test_metrics_known_answer():
    m = regression_metrics([3, 5, 7], [4, 5, 6])
    assert m["mae"] == pytest.approx(2 / 3)
    assert m["rmse"] == pytest.approx(np.sqrt(2 / 3))
    assert m["bias"] == 0
    assert m["within_one_point"] == 1
    assert m["within_half_point"] == pytest.approx(1 / 3)


@pytest.mark.parametrize("y,pred", [([], []), ([1], [1, 2]), ([1], [np.nan]), ([np.inf], [1])])
def test_invalid_metrics_rejected(y, pred):
    with pytest.raises(ValueError):
        regression_metrics(y, pred)


def test_subgroup_sample_counts():
    result = subgroup_metrics([3, 3, 5], [3, 4, 6])
    assert result["3"]["n"] == 2
    assert result["5"]["n"] == 1
    assert result["5"]["r2"] is None
    assert result["3"]["r2"] is None


def test_group_bootstrap_deterministic_and_paired():
    args = ([3, 3, 5, 7], [3, 3, 5, 7], [5, 5, 5, 5], [0, 0, 1, 2])
    a = grouped_bootstrap(*args, repetitions=100)
    b = grouped_bootstrap(*args, repetitions=100)
    assert a == b
    assert a["mae_95_ci"] == [0, 0]
    assert a["baseline_mae_improvement_95_ci"][0] >= 0
