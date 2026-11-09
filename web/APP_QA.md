# App verification

## Automated release checks

- 97 Python tests: original model/data/API QA plus training-reference integrity and reproducibility.
- 47 Node tests: model parity, CSV contracts, API/client errors, reliability flags, and reference arithmetic.
- 20 Playwright scenarios: ten flows on desktop Chromium and mobile Chromium.
- The browser suite runs against the production Worker build in CI and was run locally against that same runtime.
- 6,388 frozen-model parity cases remain unchanged (all dataset rows, randomized inputs, and tree-boundary probes).
- Strict TypeScript check and production build passed.

## Browser coverage

Prediction and comparable training samples; explicit units; stale results; prediction downloads; unusual in-range combinations; outside-range review flags; malformed/valid CSV upload; full 1,599-row file in four chunks; labels and observed scores excluded from requests; reference selection and reversal of score differences; side-by-side comparisons; review filter; CSV exports; pagination/search; server errors with no partial batch result; keyboard skip link; chart data alternatives; page overflow checks.

Axe scans WCAG 2 A/AA, 2.1 AA, and 2.2 AA rules on prediction (with comparables expanded), batch, and analytics in both viewport projects. The final run found no violations of the scanned rules. Earlier scans detected three contrast failures and a non-focusable scrolling metrics table; these were fixed before release. Automated scans do not establish complete WCAG conformance or replace inclusive user testing.

GitHub CI retains the HTML report, JUnit report, and failure traces/videos/screenshots as artifacts. New browser code is in `e2e/app.spec.ts` and `playwright.config.ts`.

## Data boundaries

The model has not been retrained or reselected. Its SHA-256 remains `82abd3c707275d2de5b9826d39c6035333151cb0237d231d6d7737360d531f10`.

The comparable-sample index contains 1,075 distinct three-input profiles from the development split only. Tests prove all held-out rows are excluded and representative measurements and scores match actual CSV rows. Similarity and review flags are heuristic context, not probabilities of correctness or prediction intervals. See `RELIABILITY.md`.

Uploads remain ephemeral. Labels and optional observed quality stay in browser memory; only the three model inputs reach the API. Existing owner-private access is preserved.

## Decision-workflow and flag-audit release

Prediction review is compact beside the estimate; comparable samples and technical explanations occupy a separate full-width section. Each review reason is visible in batch rows and has its own filter. A pinned reference persists while scrolling and when filters hide that reference row. Visual measurement differences show actual units and explicitly avoid causal or quality-superiority claims.

New desktop/mobile tests verify layout separation, all four reason filters and their sample counts, reference pinning, numeric differences, and the weak-audit disclosure and export. The first run caught an incorrect expected fixture delta (-0.40 instead of the actual -0.42 g/L); the implementation was correct and the test expectation was corrected.

The grouped OOF audit covers 1,279 development rows and excludes all 320 test rows. Every fold rebuilds the model clone, scaler, ranges, reference index, and distance cutoff using fold training rows only. Its results do not demonstrate reliable error-risk separation; this limitation is displayed in the app. Row-level evidence, fold IDs, bootstrap summaries, and reproduction code are checked in. The original deployed model and rule thresholds remain unchanged.
