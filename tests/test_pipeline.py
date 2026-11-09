import numpy as np
import pytest
from sklearn.base import clone
from sklearn.linear_model import Ridge

from wine_lab.data import FEATURES, holdout_indices, load_data
from wine_lab.models import model_catalog, pipeline


def test_scaling_uses_training_only():
    data = load_data()
    train, test = holdout_indices(data)
    fitted = pipeline(Ridge()).fit(data.iloc[train][FEATURES], data.iloc[train].quality)
    np.testing.assert_allclose(fitted.named_steps["scale"].mean_, data.iloc[train][FEATURES].mean())
    assert not np.allclose(fitted.named_steps["scale"].mean_, data.iloc[test][FEATURES].mean())


@pytest.mark.parametrize("k", [3, 5, 7, 9, 11])
def test_selector_feature_count_and_train_only(k):
    data = load_data().head(150)
    fitted = pipeline(Ridge(), k).fit(data[FEATURES], data.quality)
    selector = fitted.named_steps["select"]
    if k < 11:
        assert int(selector.get_support().sum()) == k
        assert selector.estimator_.n_features_in_ == 11
    assert fitted.named_steps["scale"].n_samples_seen_ == 150
    assert fitted.named_steps["model"].n_features_in_ == k


def test_selector_does_not_refit_on_prediction():
    data = load_data().head(100)
    fitted = pipeline(Ridge(), 5).fit(data[FEATURES], data.quality)
    before = fitted.named_steps["select"].estimator_.feature_importances_.copy()
    fitted.predict(data[FEATURES] * 1.2)
    np.testing.assert_array_equal(before, fitted.named_steps["select"].estimator_.feature_importances_)


@pytest.mark.parametrize("name", list(model_catalog()))
def test_every_model_family_fits_and_predicts(name):
    model, _ = model_catalog()[name]
    updates = {}
    params = model.get_params()
    for key in ["n_estimators", "iterations", "max_iter"]:
        if key in params and name != "SVR":
            updates[key] = 20
    model = clone(model).set_params(**updates)
    data = load_data().head(100)
    fitted = pipeline(model).fit(data[FEATURES], data.quality)
    pred = fitted.predict(data[FEATURES].head(5))
    assert pred.shape == (5,)
    assert np.isfinite(pred).all()
