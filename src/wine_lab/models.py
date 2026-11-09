from __future__ import annotations

from catboost import CatBoostRegressor
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.ensemble import (ExtraTreesRegressor, RandomForestRegressor,
                              GradientBoostingRegressor, HistGradientBoostingRegressor)
from sklearn.feature_selection import SelectFromModel
from sklearn.linear_model import ElasticNet, Ridge
from sklearn.neighbors import KNeighborsRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVR
from xgboost import XGBRegressor


class ColumnSubset(TransformerMixin, BaseEstimator):
    """Freeze a training-only-selected subset for a minimal production schema."""
    def __init__(self, columns):
        self.columns = columns

    def fit(self, X, y=None):
        self.feature_names_in_ = X.columns.to_numpy()
        self.n_features_in_ = X.shape[1]
        return self

    def transform(self, X):
        # SelectFromModel hands an ndarray to the fitted scaler. Preserve that
        # contract when replacing it with the frozen production column subset.
        return X.loc[:, self.columns].to_numpy(dtype=float)


def pipeline(model, k: int = 11, memory=None) -> Pipeline:
    selector = "passthrough" if k == 11 else SelectFromModel(
        ExtraTreesRegressor(n_estimators=120, min_samples_leaf=2, random_state=42, n_jobs=1),
        threshold=-float("inf"), max_features=k,
    )
    return Pipeline([("select", selector), ("scale", StandardScaler()), ("model", model)], memory=memory)


def model_catalog():
    return {
        "Ridge": (Ridge(), {"alpha": [.01, .1, 1, 10, 100, 1000]}),
        "ElasticNet": (ElasticNet(max_iter=20000, random_state=42), {
            "alpha": [.001, .005, .01, .05, .1], "l1_ratio": [.1, .5, .9]}),
        "KNN": (KNeighborsRegressor(n_jobs=1), {
            "n_neighbors": [5, 11, 21, 35, 51], "weights": ["uniform", "distance"], "p": [1, 2]}),
        "SVR": (SVR(), {"C": [.5, 2, 8, 32], "epsilon": [.05, .1, .2], "gamma": ["scale", .03, .1, .3]}),
        "RandomForest": (RandomForestRegressor(n_estimators=350, random_state=42, n_jobs=1), {
            "max_depth": [None, 8, 14], "min_samples_leaf": [1, 2, 4, 8], "max_features": [.6, 1.0]}),
        "ExtraTrees": (ExtraTreesRegressor(n_estimators=400, random_state=42, n_jobs=1), {
            "max_depth": [None, 10, 18], "min_samples_leaf": [1, 2, 4], "max_features": [.7, 1.0]}),
        "GradientBoosting": (GradientBoostingRegressor(random_state=42), {
            "n_estimators": [150, 350, 600], "learning_rate": [.025, .05, .1],
            "max_depth": [2, 3, 4], "min_samples_leaf": [5, 15], "loss": ["squared_error", "huber"]}),
        "HistGradientBoosting": (HistGradientBoostingRegressor(random_state=42, early_stopping=False), {
            "max_iter": [150, 350, 600], "learning_rate": [.025, .05, .1],
            "max_leaf_nodes": [7, 15, 31], "min_samples_leaf": [10, 20, 35], "l2_regularization": [0, 1, 10]}),
        "XGBoost": (XGBRegressor(random_state=42, n_jobs=1, objective="reg:squarederror", tree_method="hist"), {
            "n_estimators": [200, 450, 700], "max_depth": [2, 3, 5], "learning_rate": [.025, .05, .1],
            "min_child_weight": [3, 8], "reg_lambda": [1, 10], "subsample": [.8, 1.0], "colsample_bytree": [.8, 1.0]}),
        "CatBoost": (CatBoostRegressor(random_seed=42, thread_count=1, verbose=False, allow_writing_files=False), {
            "iterations": [300, 600, 900], "depth": [4, 6, 8], "learning_rate": [.025, .05, .1],
            "l2_leaf_reg": [3, 10, 30], "loss_function": ["RMSE", "MAE"]}),
    }
