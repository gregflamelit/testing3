# Wine Lab web app

A responsive React/Vinext app with a same-origin Cloudflare Worker model API.

## Run locally

Use Node 22.13+ and pnpm 11.25.0. From this directory:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:5173. The preview uses the Sites starter’s local sign-in mock; production access is enforced by Sites. No connector or database is needed.

## Check and build

```bash
node --experimental-strip-types --test tests/*.test.ts
node node_modules/typescript/bin/tsc --noEmit
pnpm build
node node_modules/@playwright/test/cli.js install chromium
pnpm test:e2e
```

The checked-in generated model is exported from the locked Python artifact. To regenerate it from the repository root, activate the Python ML environment and run `python scripts/export_web_model.py`. No training occurs. The parity fixtures are used by tests and are never imported into the browser bundle.

The training-support index is generated separately with `python scripts/export_reliability.py`.
Read [the reliability method](RELIABILITY.md) for how training-only neighborhood checks, comparable samples,
review flags, and reference comparisons work. The original champion remains frozen.

Browser CI tests the built production Worker on desktop and mobile Chromium. It covers prediction,
training examples, units, stale results, malformed and full-dataset uploads, four-chunk inference,
reference differences/exports, filters, pagination, server failures, keyboard access, chart alternatives,
and axe WCAG 2 A/AA, 2.1 AA, and 2.2 AA checks across the three views.
Reports, traces, videos, and failure screenshots are retained as GitHub Actions artifacts.
Locally, set `E2E_PRODUCTION=1` to use the production build; otherwise the runner starts the dev server.
Automated scans do not establish complete WCAG compliance and complement manual checks.

## Architecture

- `app/page.tsx`: app entry.
- `components/`: prediction, batch comparison, and evidence screens.
- `lib/predictor.ts`: exact fitted scaler and symmetric-tree evaluator, including float32 quantization.
- `lib/generated/model.json`: 300 fitted trees exported from the champion.
- `lib/generated/analytics.json`: recorded model-release evidence.
- `lib/csv.ts`: CSV contracts and safe result exports.
- `lib/client.ts`: validated API response handling.
- `app/api/predict`: validates and predicts 1–1,000 samples per request.
- `app/api/model`, `app/api/health`: champion metadata and readiness.

Batch files support up to 5,000 samples / 2 MB. The browser calls the API in 500-sample chunks, shows results only when the whole batch succeeds, and keeps labels and optional observed scores out of model requests. There is no upload storage.

## Hosting

The Sites project identity is persisted in `.openai/hosting.json`. The Sites source helper packages `dist/server/index.js` and the client assets from the exact pushed source. A mirrored complete source copy is checked into `gregflamelit/testing3` under `web/`. New Sites are owner-private; publication does not imply public sharing.

The original Python/FastAPI service remains in the repository for alternative hosting. This web deployment uses the same trained model in a numeric Worker runtime, not a replacement or approximation. See `APP_QA.md` for tests and verification.

## Attribution

Web scaffolding: OpenAI Sites Vinext starter. React/Vinext, Tailwind CSS and Lucide icons are upstream dependencies, pinned by `pnpm-lock.yaml`. Application logic and interface were generated with OpenAI Codex from user prompts. Wine data provenance and license are in `../data/README.md`.
