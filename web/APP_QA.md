# App verification

## Automated release checks

- 95 Python tests: original model/data/API QA plus training-reference integrity and reproducibility.
- 46 Node tests: model parity, CSV contracts, API/client errors, reliability flags, and reference arithmetic.
- 12 Playwright scenarios: six flows on desktop Chromium and mobile Chromium.
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
