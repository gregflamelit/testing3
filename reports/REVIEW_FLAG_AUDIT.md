# Do review flags identify larger model errors?

**This exploratory audit did not demonstrate reliable error-risk separation.** The flags remain useful
descriptions of training support and scope, not proven detectors of inaccurate predictions.

## Recorded results

Five grouped out-of-fold folds cover all 1,279 development rows once. Overall OOF MAE is 0.4768.
The final 320 test rows were excluded. No deployed artifact, input selection, hyperparameter, or rule threshold was changed.

| Flag | Flagged rows | Unflagged rows | Flagged MAE | Unflagged MAE | Difference | 95% group-bootstrap difference interval |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Outside studied range | 8 | 1,271 | 0.929 | 0.474 | +0.455 | [-0.021, 0.977] |
| Unusual combination | 62 | 1,217 | 0.483 | 0.477 | +0.006 | [-0.105, 0.131] |
| Nearby tasting scores disagree | 82 | 1,197 | 0.506 | 0.475 | +0.031 | [-0.083, 0.154] |
| Uncommon predicted score | 10 | 1,269 | 0.324 | 0.478 | -0.154 | [-0.437, 0.157] |
| Any flag | 151 | 1,128 | 0.487 | 0.475 | +0.012 | [-0.070, 0.100] |

All intervals include zero. Outside-range errors were descriptively larger, but only eight samples qualified.
The uncommon-prediction flag did not identify larger average errors in this sample.
Flags overlap; subgroup sample counts cannot be added together.

Any flag covered 11.8% of development samples and captured 13.75% of absolute errors greater than one point.
Errors above one point occurred in 14.6% of flagged samples versus 12.2% of unflagged samples.
These results do not justify advertising the flags as calibrated confidence or reliable error alerts.

## Fold-local method

- Preserve the original development/test partition and five-fold grouped splitter (seed 42).
- Use the frozen three-input schema and champion CatBoost hyperparameters, without search or reselection.
- Fit temporary audit models and scalers on each fold's training rows only. They are not promoted or serialized as production models.
- Build ranges, distinct projected reference samples, observed-score ranges, and the leave-one-profile-out 95th-percentile distance cutoff from that fold's training rows only.
- Predict the validation fold once and derive flags before comparing with its observed quality.
- Freeze the original rule definitions: five neighbors; 95th-percentile distance cutoff; nearby score span at least 3; uncommon estimate at/below 4 or at/above 7.
- Resample original 11-input identity groups 2,000 times to describe uncertainty in flagged-minus-unflagged MAE.

## Limits

The development dataset already informed model and feature selection, so this is an exploratory diagnostic,
not an independent test or a nested model-selection estimate. Identity groups use all original 11 measurements;
different original profiles may share the selected three values across folds.
Overlapping fold training sets introduce dependencies not fully captured by the group-bootstrap intervals.
Intervals are not adjusted for multiple comparisons. No threshold was tuned after seeing these results.
Fresh independent data would be needed to confirm an error-risk relationship, and a prospective user study
would be needed to measure whether reviewing these cases improves decisions.

## Evidence and reproduction

- `reliability_oof_predictions.csv`: one record per development row with prediction, absolute error, fold, and all flags.
- `reliability_validation_folds.json`: training/validation/reference row IDs, fold means, scales, ranges, and cutoffs.
- `reliability_validation.json`: full summaries, bootstrap intervals, distance/error correlation, and unique-group-weighted sensitivity analysis.
- `web/lib/review-rules.json`: versioned frozen rules.
- `tests/test_flag_validation.py`: exclusion, grouping, fold-local preprocessing, artifact integrity, and numerical-summary checks.

```bash
python scripts/validate_review_flags.py --output audit-output
```

The manual **Reproduce review flag audit** GitHub Actions workflow runs this command and uploads its outputs.
It does not change the model, rules, app, or deployment automatically.
