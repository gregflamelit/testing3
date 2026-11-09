# App verification

## Automated checks

- 40 Node tests covering the web model, CSV parser, API contracts, and client response/error handling.
- 6,388 prediction parity cases: all 1,599 dataset rows, 4,000 randomized inputs, and 789 probes around model split boundaries.
- Maximum permitted difference from the locked Python champion: 1e-10.
- TypeScript strict type check and production Vinext/Cloudflare Worker build.
- The original 93 Python ML/API tests and locked-model rebuild remain part of repository CI.

## Browser checks

- Single prediction connected to the same-origin service; default sample predicts approximately 5.001365.
- Edited inputs mark results stale and disable their download until recalculated.
- Out-of-range inputs display warnings before and after prediction.
- Demo batch: six rows, predictions and one range warning; side-by-side selection and range filter work.
- Full 1,599-row source CSV: four sequential inference chunks; eight unused inputs explicitly ignored.
- Full-file observed-score MAE appears separately from independent test evidence; pagination shows 80 pages.
- CSV export was downloaded and its contents checked against displayed results.
- Invalid CSV with a blank required measurement is rejected with a row/column error and clears prior results.
- Model analytics metric selector and removed-input disclosure work.
- Responsive layouts checked at mobile and desktop widths; charts/tables have semantic labels.
- A development hydration error in SVG chart titles was found and corrected before release.

## Boundaries

No retraining, feature reselection, or use of test labels to tune the model occurred during app development.
The server evaluates the existing ensemble with float32 input quantization and the original fitted scaler.
Batch sample labels and observed scores stay in browser memory; only the three model inputs reach the API.
The application does not persist uploaded files or samples, and requires no prediction API secret.
Sites hosting starts owner-private. Source is checked into the requested public GitHub repository.
