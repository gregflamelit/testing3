# Training support and comparable samples

The champion and its predictions are unchanged. The additional panel provides context, not a new model,
an accuracy probability, a prediction interval, or a calibrated uncertainty measure.

## Reference data and leakage controls

`scripts/export_reliability.py` reads the locked split, original dataset checksum, champion checksum,
and its fitted scaler. It uses the 1,279 development rows only; all 320 held-out rows are excluded.
Original 11-input duplicate lab records are removed first. Identical projections into the three selected
measurements are then represented once, to avoid inflating neighborhood density. The resulting index
contains **1,075 distinct three-input profiles**, each represented by a real development sample.
For profiles with different observed tasting scores, the original score range is retained.
Labels never enter distance calculations or model prediction.

## Distance check

1. Standardize volatile acidity, sulphates, and alcohol with the champion's development-only means/scales.
2. Calculate root-mean-square standardized distance across those three measurements.
3. Average the five nearest distinct reference-profile distances.
4. Compare that value with the 95th percentile of leave-one-profile-out distances calculated on development references.

The reference cutoff is **0.3530873968**. The representative point itself is excluded when constructing
the cutoff. This is an empirical training-support heuristic. It has not been calibrated to a population
false-positive rate and says nothing about the probability that an individual prediction is correct.
Implausibly large finite inputs have their diagnostic distance capped at 1,000,000; they are also flagged by range checks.

## Human review triggers

- A measurement falls outside the development range: check units and use sensory review.
- A combination has neighborhood distance above the cutoff, even if every value is individually in range.
- Scores among five nearby profiles (including retained same-profile score ranges) span at least three points.
- The model estimate is at or below 4, or at or above 7: these score regions warrant extra caution.

No trigger is a guarantee of error, and no absence of triggers is a guarantee of correctness.
The app displays the three nearest real representative development samples, their measurements, and observed sensory scores.
Other chemistry and unrecorded producer/vintage differences may affect actual quality.

## Reference comparisons

Batch rows retain original file order until the user requests sorting. A chosen reference remains selected across
search, pagination, and review filters. Differences are raw model estimate differences and measured-input differences;
alcohol changes are percentage points. Self-comparison gives zero. There is no established significance threshold
or confidence interval for score differences. Small differences must not be presented as proof of better wine
or as causal advice to change a chemical measurement.

CSV exports retain reference IDs and exact numeric differences. General result exports include training-support status,
human-review flags, and reasons. Formula-like sample labels are escaped for spreadsheet safety.

## Reproduce and test

From the repository root with Python dependencies installed:

```bash
python scripts/export_reliability.py --check
python -m pytest tests/test_reliability_index.py
```

The tests prove every comparable row belongs to development data, actual measurements/scores match the CSV,
selected-input profiles are unique, the index reproduces, and the champion artifact checksum is unchanged.
Web tests separately check unusual in-range combinations, deterministic neighbors, extreme values, and reference arithmetic.

## Exploratory out-of-fold flag validation

The frozen flags were audited across five grouped development folds. Within each fold, the temporary model, scaler, ranges, neighbor index, and distance cutoff used training rows only. No held-out test rows were used. Any flag had OOF MAE 0.487 versus 0.475 without a flag; the 95% group-bootstrap difference interval was [-0.070, 0.100]. Error-risk separation was not demonstrated. No flag threshold was tuned from these findings. The model settings/features had previously been selected using development data, so this is exploratory evidence, not an independent test.

See `../reports/REVIEW_FLAG_AUDIT.md` for subgroup counts, errors, uncertainty, limitations, and reproduction. The analytics screen includes the same findings and a downloadable audit. Reference rows now show explicit reason labels and filters; comparisons use a pinned reference and non-causal measurement-difference bars.
