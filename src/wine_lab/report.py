"""Regenerate readable diagnostics from recorded results, without fitting models."""
from __future__ import annotations

import json
from pathlib import Path
import xml.etree.ElementTree as ET

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from wine_lab.data import ROOT
from wine_lab.metrics import subgroup_metrics


def generate(root: Path = ROOT):
    reports = root / "reports"
    read = lambda name: json.loads((reports / name).read_text())
    tuning = pd.DataFrame(read("tuning_summary.json")).sort_values("cv_mae")
    features = pd.DataFrame(read("feature_benchmark.json"))
    lock = read("selection_lock.json")
    evaluation = read("test_evaluation.json")
    pred = pd.read_csv(reports / "test_predictions.csv")
    # R2 is undefined within a single target level; do not report forced zeros.
    evaluation["by_quality"] = subgroup_metrics(pred.quality, pred.prediction)
    (reports / "test_evaluation.json").write_text(json.dumps(evaluation, indent=2, allow_nan=False) + "\n")
    diag = read("development_diagnostics.json")
    protocol = read("protocol.json")
    plt.rcParams.update({"font.size": 11, "axes.spines.top": False, "axes.spines.right": False,
                         "figure.facecolor": "#fbf8f4", "axes.facecolor": "#fbf8f4", "axes.titleweight": "bold"})
    fig, axes = plt.subplots(1, 2, figsize=(14, 6), layout="constrained")
    colors = ["#7b2446" if family == lock["family"] else "#b6a79c" for family in tuning.family]
    axes[0].barh(tuning.family[::-1], tuning.cv_mae[::-1], color=colors[::-1])
    axes[0].axvline(diag["baseline_cv"]["cv_mae"], color="#454545", ls="--", label="Median baseline")
    axes[0].set(title="10 model families: tuning CV", xlabel="Mean absolute error (lower is better)")
    axes[0].legend()
    for family, group in features.groupby("family"):
        group = group.sort_values("feature_count")
        axes[1].plot(group.feature_count, group.cv_mae, "o-", label=family)
    axes[1].scatter(lock["feature_count"], lock["cv_mae"], s=200, marker="*", color="#7b2446", zorder=5, label="Selected trade-off")
    axes[1].set(title="Finalists: 15 grouped folds each", xlabel="Number of input measurements", ylabel="Mean absolute error", xticks=[3, 5, 7, 9, 11])
    axes[1].legend()
    fig.suptitle("Wine Lab | Development benchmark", fontsize=19)
    fig.savefig(reports / "benchmark.png", dpi=160)
    plt.close(fig)
    fig, axes = plt.subplots(2, 2, figsize=(13, 10), layout="constrained")
    residual = pred.prediction - pred.quality
    rng = np.random.default_rng(42)
    axes[0, 0].scatter(pred.quality + rng.normal(0, .035, len(pred)), pred.prediction, alpha=.4, s=20, color="#7b2446")
    axes[0, 0].plot([3, 8], [3, 8], "--", color="gray")
    axes[0, 0].set(title="Predicted versus observed", xlabel="Observed quality (jittered)", ylabel="Predicted quality")
    axes[0, 1].hist(residual, bins=25, color="#7b2446", alpha=.85)
    axes[0, 1].axvline(0, color="gray", ls="--")
    axes[0, 1].set(title="Held-out residual distribution", xlabel="Prediction minus observed quality", ylabel="Samples")
    sub = evaluation["by_quality"]
    axes[1, 0].bar(list(sub), [sub[k]["mae"] for k in sub], color="#7b2446")
    for i, key in enumerate(sub):
        axes[1, 0].text(i, sub[key]["mae"] + .03, f"n={sub[key]['n']}", ha="center", fontsize=9)
    axes[1, 0].set(title="Rare extremes remain difficult", xlabel="Observed quality", ylabel="Mean absolute error", ylim=(0, 2.5))
    imp = pd.read_csv(reports / "test_permutation_importance.csv").sort_values("mae_increase")
    axes[1, 1].barh(imp.feature, imp.mae_increase, xerr=imp.repeat_sd, color="#7b2446")
    axes[1, 1].set(title="Post-lock permutation diagnostics", xlabel="MAE increase when shuffled (30 repeats)")
    fig.suptitle("Wine Lab | Independent test diagnostics (320 samples)", fontsize=19)
    fig.savefig(reports / "test_diagnostics.png", dpi=160)
    plt.close(fig)
    curve = pd.read_csv(reports / "learning_curve.csv").groupby("fraction").mean(numeric_only=True)
    fig, ax = plt.subplots(figsize=(8, 4.5), layout="constrained")
    ax.plot(curve.training_rows, curve.train_mae, "o-", label="Training MAE", color="#b6a79c")
    ax.plot(curve.training_rows, curve.validation_mae, "o-", label="Validation MAE", color="#7b2446")
    ax.set(title="Development-only learning curve", xlabel="Mean training samples per fold", ylabel="Mean absolute error")
    ax.legend()
    fig.savefig(reports / "learning_curve.png", dpi=160)
    plt.close(fig)
    test = evaluation["champion"]
    base = evaluation["baseline"]
    ci = evaluation["uncertainty"]["mae_95_ci"]
    family_rows = "\n".join(f"| {r.family} | {r.cv_mae:.4f} | {r.cv_rmse:.4f} | {r.configurations} |" for r in tuning.itertuples())
    feature_rows = "\n".join(f"| {r.family} | {r.feature_count} | {r.cv_mae:.4f} | {r.cv_rmse:.4f} |" for r in features.sort_values(["cv_mae", "feature_count"]).itertuples())
    subgroup_rows = "\n".join(f"| {k} | {v['n']} | {v['mae']:.3f} | {v['bias']:+.3f} |" for k, v in evaluation["by_quality"].items())
    qa = "Not recorded"
    if (reports / "qa-results.xml").exists():
        suites = ET.parse(reports / "qa-results.xml").getroot()
        total = sum(int(s.get("tests", 0)) for s in suites.iter("testsuite"))
        failures = sum(int(s.get("failures", 0)) + int(s.get("errors", 0)) for s in suites.iter("testsuite"))
        qa = f"{total} tests, {failures} failures/errors"
    card = f'''# Wine Lab model card

## Release decision

The promoted model is **{lock['family']}**, requiring only **{', '.join(lock['selected_features'])}**.
It is the selected MAE-versus-input-burden trade-off within this benchmark, not a claim of universal optimality.
The search covered 10 model families, {int(tuning.configurations.sum())} configurations, and 15 feature-count/family finalists.
Only this champion is saved for inference; all challenger configuration and evaluation evidence remains in reports.

The all-11-input CatBoost had repeated-CV MAE {lock['comparison_to_all_features']['all_feature_cv_mae']:.4f};
the selected 3-input version had {lock['cv_mae']:.4f}, a change of +{lock['comparison_to_all_features']['mae_change']:.4f}.
Before training we declared a 0.005-point MAE tolerance for selecting fewer inputs. This is an engineering tolerance,
not a statistical equivalence test. Removed inputs may still contain signal; they were not needed for this trade-off.
Reduced subsets reuse the tuned full-input hyperparameters, so this is a bounded search rather than exhaustive subset optimization.

## Independent evaluation

| Metric | Champion | Training-median baseline |
| --- | ---: | ---: |
| MAE | {test['mae']:.4f} | {base['mae']:.4f} |
| RMSE | {test['rmse']:.4f} | {base['rmse']:.4f} |
| R-squared | {test['r2']:.4f} | {base['r2']:.4f} |
| Median absolute error | {test['median_absolute_error']:.4f} | {base['median_absolute_error']:.4f} |
| Within 0.5 point | {test['within_half_point']:.1%} | {base['within_half_point']:.1%} |
| Within 1 point | {test['within_one_point']:.1%} | {base['within_one_point']:.1%} |
| Bias | {test['bias']:+.4f} | {base['bias']:+.4f} |
| 90th percentile absolute error | {test['p90_absolute_error']:.4f} | {base['p90_absolute_error']:.4f} |

MAE improved {evaluation['relative_mae_improvement']:.1%}. The group-bootstrap 95% MAE interval is
[{ci[0]:.4f}, {ci[1]:.4f}]. The paired baseline-improvement interval is
{evaluation['uncertainty']['baseline_mae_improvement_95_ci']}. These are uncertainty estimates for aggregate test performance,
not individual prediction intervals, and are conditional on this dataset and split.
The release passed the predefined gate: at least 5% lower MAE than baseline and a positive lower paired-bootstrap improvement bound.
The baseline wins the within-one-point metric; model superiority depends on the chosen objective.
No challenger was evaluated on the final test set. The deployed artifact is the exact model evaluated here, with no test-data refit.

## Data and validation

- Source: user-supplied UCI red wine CSV, 1,599 rows, 11 original predictors, no missing cells.
- 240 repeated rows; 1,359 unique predictor groups. No conflicting quality labels within identical predictors.
- Development: {protocol['development_rows']} rows. Test: {protocol['test_rows']} rows / {evaluation['test_groups']} identity groups.
- Fixed seed 42; test is the first fold of 5-fold shuffled StratifiedGroupKFold.
- Identical predictor tuples never cross any train/validation/test boundary. This controls exact-duplicate leakage,
  but unavailable producer/vintage/batch identities could still hide dependence.
- Model tuning: 5 grouped folds, fixed randomized search. Feature robustness: 5 folds at each of seeds 42, 17, and 2026.
- Feature ranking, scaling, and estimator fitting occur only within each training fold.
- Development folds are reused for model selection and are optimistically biased; the untouched test assesses the locked procedure.
- Bootstrap: 2,000 paired resamples of identity groups. Unique-group-weighted test MAE is {evaluation['equal_weight_per_unique_group']['mae']:.4f}.
- Raw predictions are continuous and unrounded. Quality is ordered, but this release optimizes regression MAE.

## Model family comparison (development tuning)

| Family | CV MAE | CV RMSE | Configurations |
| --- | ---: | ---: | ---: |
{family_rows}

The baseline development CV MAE is {diag['baseline_cv']['cv_mae']:.4f}.

## Feature-count comparison (15 development folds)

| Family | Input count | CV MAE | CV RMSE |
| --- | ---: | ---: | ---: |
{feature_rows}

Feature subsets are ranked anew inside each fold; this evaluates a selection procedure, not one globally preselected subset.
The production subset is frozen from the development-only fit. Repeated folds overlap; their standard deviations are descriptive,
not independent standard errors or evidence of statistical equivalence.

![Development benchmark](reports/benchmark.png)

## Failure analysis

| Observed quality | Test samples | MAE | Bias |
| --- | ---: | ---: | ---: |
{subgroup_rows}

The model pulls rare extreme scores toward common scores. Only 2 test wines scored 3 and 3 scored 8;
estimates at those extremes are highly uncertain. This is not a reliable detector of exceptional or very poor wines.
Within-score R-squared is undefined and reported as null.
No hard safety, purchasing, or release decision should be inferred from the predicted score alone.

![Test diagnostics](reports/test_diagnostics.png)

## QA and reproducibility

Local recorded QA: **{qa}**. Tests cover input integrity, target exclusion, duplicate grouping,
all fold boundaries, training-only scaler/selector fitting, all model families, metric known answers,
bootstrap determinism, selection rules, release gate, artifact and dataset checksums, golden predictions,
batch consistency, malformed inputs, range warnings, and API request/response behavior.
The separate locked-model reproduction command rebuilds from development rows and checks golden predictions.

The group-shuffled-label negative control scored MAE {diag['shuffled_target_cv']['cv_mae']:.4f},
versus {diag['shuffled_target_baseline_cv']['cv_mae']:.4f} for its median baseline: no useful signal remained.
This is one smoke-control permutation, not a formal permutation hypothesis test.

![Learning curve](reports/learning_curve.png)

## Use and limitations

Use the model to explore sensory quality estimates for measurements resembling Portuguese red Vinho Verde wines.
It does not establish causality, health/safety, market value, quality of white wines, or transfer to other regions.
Feature permutation is a post-lock diagnostic; correlated inputs and small test samples limit interpretation.
Only single-feature training-range checks are implemented; plausible ranges do not guarantee an in-distribution combination.
No calibrated individual prediction interval is provided. No generative AI is used in prediction.
Additional independent contemporary samples are the next requirement for stronger generalization evidence.

## References and disclosure

Dataset: Cortez, P., Cerdeira, A., Almeida, F., Matos, T., and Reis, J. (2009),
[Wine Quality, UCI](https://doi.org/10.24432/C56S3T), CC BY 4.0.
The supplied CSV uses comma separators and is preserved byte-for-byte.
Implementation, documentation, and analysis were produced with OpenAI Codex from user prompts.
Libraries and upstream algorithms are listed in the exact dependency lock; modeling code uses no application template. The web frontend uses the OpenAI Sites Vinext starter, React, and Lucide icons.
'''
    (root / "MODEL_CARD.md").write_text(card, encoding="utf-8")
    print(f"Generated model card and three diagnostic figures. QA: {qa}")


if __name__ == "__main__":
    generate()
