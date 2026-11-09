# Dataset provenance

`winequality-red.csv` is the exact comma-separated CSV supplied by the user.
It contains 1,599 red wine samples, 11 physicochemical predictors, and the sensory `quality` target.
The original UCI download uses semicolon separators; this supplied copy uses commas.
No rows, values, or duplicates were removed. Duplicate identity groups remain together in every split.
The SHA-256 checksum is recorded in `reports/protocol.json` and `artifacts/metadata.json`.

Attribution: Cortez, P., Cerdeira, A., Almeida, F., Matos, T., and Reis, J. (2009).
[Wine Quality, UCI Machine Learning Repository](https://doi.org/10.24432/C56S3T).
Dataset license: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).

Background paper: Cortez et al., *Modeling wine preferences by data mining from physicochemical properties*,
Decision Support Systems 47(4), 547-553 (2009).

Quality is the prediction target and must never be included in inference measurements.
