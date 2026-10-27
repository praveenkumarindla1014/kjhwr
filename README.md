# Wind Intelligence: UK Renewable Forecast Analytics

A full-stack web app that helps a UK electricity supplier's **day-ahead trading desk**:

1. **See the latest wind generation forecast that was actually available when the purchasing decision had to be made**, and
2. **Quantify how accurate those forecasts are** against actual national wind generation.

Scope (from the brief): national-level wind **actuals** (Elexon `FUELHH`, `fuelType = WIND`) and **forecasts** (Elexon `WINDFOR`) for purchase decisions for delivery dates in **January 2026**. No other data sources, and no new forecasting model.

| | |
|---|---|
| **Live app** | **https://kjhwr-livid.vercel.app** (Vercel: FastAPI backend + React frontend; API health: [/api/health](https://kjhwr-livid.vercel.app/api/health), API docs: [/docs](https://kjhwr-livid.vercel.app/docs)) |
| **Demo video** | _Add the unlisted YouTube link here._ |

---

## Quick start (run on localhost)

Clone the repo first:

```bash
git clone https://github.com/praveenkumarindla1014/kjhwr.git
cd kjhwr
```

### Easiest: Docker (needs Docker Desktop running)

```bash
docker compose up --build
```
Then open **http://localhost:8080** (UI) and **http://localhost:8000/docs** (API docs).
If port 8080 is already used on your machine: `FRONTEND_PORT=8088 docker compose up --build` (PowerShell: `$env:FRONTEND_PORT=8088; docker compose up --build`) and open http://localhost:8088.
Stop with `Ctrl+C`, then `docker compose down`.

### Without Docker: two terminals

**Terminal 1: backend** (Python 3.11+)

Windows (PowerShell):
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```
macOS / Linux:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

**Terminal 2: frontend** (Node.js 20+)
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**. The dev server forwards `/api` calls to the backend on port 8000, so start the backend first.

Check it works: http://localhost:8000/api/health should return `"status":"ok"`, and the dashboard should show January 2026 data. The repo includes a snapshot of real Elexon data, so no API key or setup is needed. Click **Refresh data** in the app to fetch fresh data from Elexon.

### Run the tests
```bash
cd backend  && pytest         # 39 tests (venv active)
cd frontend && npm test       # 15 tests
```

---

## Table of contents
1. [Business problem](#business-problem) · 2. [Features](#features) · 3. [Tech stack](#technology) · 4. [Architecture](#architecture)
5. [Elexon data](#elexon-data-sources-verified-against-the-live-api) · 6. [Forecast selection](#forecast-selection-logic-point-in-time-no-hindsight) · 7. [Metrics](#metrics)
8. [Folder structure](#folder-structure) · 9. [Run locally](#running-locally) · 10. [Configuration](#configuration) · 11. [API](#api)
12. [Tests](#tests) · 13. [Deployment](#deployment) · 14. [Publishing to GitHub](#publishing-to-github) · 15. [Limitations](#known-limitations) · 16. [AI disclosure](#ai-tools-disclosure)

---

## Business problem

Day-ahead power is bought the day before delivery. To decide how much non-renewable power to procure, the desk relies on the wind forecast available *at that moment*. Two questions matter:

- *What did the forecast say when we had to decide?* Later forecast runs, published after the decision, must not be used. That would be hindsight.
- *How wrong is that forecast typically, and in which direction?* This lets the desk size the risk around the wind volume.

### How this maps to the brief

| Brief requirement | Where it is met |
|---|---|
| Latest forecast available at decision time | Cutoff-aware forecast selection (`analytics/processing.py`); Overview and Forecast Analysis pages |
| Quantitative accuracy evaluation | MAE, RMSE, bias, MAPE, coverage (`analytics/metrics.py`); Accuracy Analysis page |
| National wind actuals from Elexon `FUELHH` (WIND) | `services/elexon_client.py` |
| Forecasts from Elexon `WINDFOR` (`startTime`, `publishTime`, `generation`) | `services/elexon_client.py` |
| Decisions in January 2026 only | Date range locked to Jan 2026 in backend and UI |
| React frontend, Python backend | React + Vite, FastAPI |
| Docker | `docker-compose.yml` and root `Dockerfile` |
| Deploy to Vercel or Heroku | `heroku.yml` + `Dockerfile` (Heroku), `vercel.json` Services config (Vercel) |
| README with files, how to start, link to deployed app | This file |

## Features

| View | What it shows |
|---|---|
| **Overview** | KPI cards for a selected target interval (forecast, actual, error, publication time, lead time) next to period aggregates (MAE, RMSE, bias, coverage), plus a forecast-vs-actual chart. Interval values and period aggregates are labelled separately. |
| **Forecast Analysis** | Zoomable forecast-vs-actual time series (actuals half-hourly, forecasts hourly) with tooltips (target time, forecast publish time, forecast, actual, error), and a per-day table of the forecast runs used. |
| **Accuracy Analysis** | MAE, RMSE, bias and MAPE with explanations; signed error over time (over-forecast red, under-forecast blue); absolute error over time; daily MAE/bias; error by hour of day; daily summary table; observation counts. |
| **Data Explorer** | Searchable, sortable, paginated interval table with availability status, date and status filters, and CSV export of the currently filtered rows. |
| **Data Sources** | Endpoints, links to the official docs, record counts, refresh timestamp, cutoff assumption, methodology and missing-data handling. |

Global controls: a delivery date range (limited to January 2026, validated), a decision-cutoff rule (D-1 at any half-hour UK time, or a fixed minimum lead time of 1–72 h), and a **Refresh data** button. Refresh re-fetches from Elexon through the backend and reports success only when the backend confirms it. The header shows the last successful refresh time. Every view has loading skeletons, empty states and retryable error states.

## Technology

- **Frontend:** React 18 + Vite, Tailwind CSS, Recharts, Lucide icons; Vitest + React Testing Library
- **Backend:** Python 3.12, FastAPI, Pandas, NumPy, HTTPX, Pydantic; Pytest
- **Containers / hosting:** Docker, Docker Compose; Heroku (container stack) or Vercel

## Architecture

```
Browser ──> React SPA ──/api──> FastAPI
                                  ├─ api/routes.py              request validation and response shaping only
                                  ├─ services/forecast_service.py
                                  │    DataRepository: Elexon fetch + JSON snapshot cache (atomic writes)
                                  │    ForecastService: memoised analysis per (data version, dates, cutoff)
                                  ├─ services/elexon_client.py  HTTPX client: chunking, retries, validation
                                  └─ analytics/
                                       processing.py  normalise, dedupe, cutoff, forecast selection, matching
                                       metrics.py     MAE/RMSE/bias/MAPE, coverage, daily and hourly summaries
Elexon Insights API (data.elexon.co.uk/bmrs/api/v1)
```

The frontend fetches a single `/api/analysis` payload per filter combination, so every view uses exactly the same selected forecasts and metrics.

## Elexon data sources (verified against the live API)

| Data | Endpoint | Query |
|---|---|---|
| Actuals | `GET /datasets/FUELHH/stream` ([docs](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream)) | `settlementDateFrom`, `settlementDateTo` (YYYY-MM-DD), `fuelType=WIND` |
| Forecasts | `GET /datasets/WINDFOR/stream` ([docs](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream)) | `publishDateTimeFrom`, `publishDateTimeTo` (ISO-8601) |

What I observed from the API:
- The `/stream` endpoints return one JSON array per request, with **no pagination**. The client still splits requests into 7-day windows, so one bad response only needs that window retried. Retries use exponential backoff on timeouts, 429 and 5xx. Other 4xx responses fail immediately with a clear error. Elexon returns validation errors as RFC 9110 JSON.
- `FUELHH` WIND is half-hourly. January 2026 (padded to 31 Dec – 1 Feb) returned **1,584** records with no duplicates.
- `WINDFOR` is **hourly**, with runs published 8 times a day (≈02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC). Each run covers about 3 days. The analysis window holds **20,440** forecast values from **280** runs.
- Each run also includes `startTime`s *before* its `publishTime`. These are never eligible (see below).

A snapshot of this real data is committed in `backend/data/` (`fuelhh_wind.json`, `windfor.json`, `snapshot_meta.json` with the fetch timestamp). The app serves from it, so it works immediately and even if Elexon is down. **Refresh data** replaces it, and the previous snapshot is kept if the fetch fails. If no snapshot exists, the backend fetches from Elexon on the first request. When the data folder is read-only (serverless hosting), refreshed data is written to the system temp directory instead.

## Forecast selection logic (point-in-time, no hindsight)

For each target interval `startTime`:

1. Compute the **decision cutoff**:
   - **Day-ahead (default):** `delivery date − 1 day` at `HH:MM` **UK local time**, default **11:00**. The delivery date is the UK-local calendar date of `startTime`.
   - **Fixed lead time:** `startTime − H hours`.
2. Eligible forecasts are those for that `startTime` with `publishTime ≤ cutoff` **and** `publishTime ≤ startTime`.
3. Select the eligible forecast with the **latest `publishTime`**.
4. Match it to the `FUELHH` actual with the identical `startTime` (UTC).

**Cutoff assumption.** The brief does not specify the client's exact cutoff. The default of 11:00 UK on D-1 reflects the GB day-ahead hourly auction gate closure. It is an assumption, not an official rule for this client, and can be changed in the UI and via `DEFAULT_CUTOFF_TIME`. Under the default, the 09:30 UTC run on D-1 is selected, giving lead times of about 14.5–38.5 h.

**Resolution.** Actuals are half-hourly and forecasts are hourly, so accuracy is evaluated on the **hourly intervals**, with exact timestamp matches and no interpolation. Half-past intervals are labelled *No forecast (hourly product)*. They are not counted as missing. The chart draws the forecast line through the hourly points only for readability. Tooltips and the table show the real values.

**Data quality rules.** All timestamps are UTC internally. Delivery days and cutoffs use `Europe/London`, so days when the clocks change (46/50 half-hours) are handled correctly; tests cover this. Duplicate actuals keep the latest-published revision. Exact duplicate forecast rows are removed. Invalid or non-numeric records are dropped and counted. **Missing values are never converted to zero.** Intervals missing a forecast or an actual are labelled, counted in coverage, and excluded from the metrics.

## Metrics

Computed only on matched intervals:

| Metric | Formula |
|---|---|
| Signed error | `forecast − actual` (positive = over-forecast) |
| Absolute error | `abs(forecast − actual)` |
| MAE | `mean(abs(forecast − actual))` |
| RMSE | `sqrt(mean((forecast − actual)²))` |
| Bias | `mean(forecast − actual)` |
| MAPE | `mean(abs(forecast − actual) / actual) × 100`, **only where actual ≠ 0**. The number excluded is reported. |

The backend also reports MAE as a percentage of mean actual generation, median, P90 and maximum absolute error, over- and under-forecast counts, mean lead time, expected/matched/missing interval counts, and coverage %. MAPE becomes unstable when generation is low (small denominators), so read it together with MAE.

**Observed result (real data, January 2026, default cutoff):** 744 of 744 hourly intervals matched (100% coverage). MAE ≈ 2,107 MW, RMSE ≈ 2,611 MW, bias ≈ +1,840 MW (forecasts were too high in 628 of 744 hours), MAPE ≈ 21.9%, mean lead time 26 h. These figures come from the app's own computation.

## Folder structure

```
.
├── backend/                         Python / FastAPI service
│   ├── app/
│   │   ├── main.py                  App factory, CORS, optional static frontend
│   │   ├── config.py                Settings from environment variables
│   │   ├── schemas.py               Pydantic response models
│   │   ├── api/routes.py            HTTP endpoints
│   │   ├── services/elexon_client.py     Elexon HTTP client (chunking, retries)
│   │   ├── services/forecast_service.py  Snapshot cache + analysis orchestration
│   │   └── analytics/{processing.py, metrics.py}
│   ├── data/                        Snapshot of real Elexon data (JSON)
│   ├── tests/                       Pytest suite; tests/fixtures = SYNTHETIC data only
│   ├── requirements.txt, requirements-dev.txt, pytest.ini
│   └── Dockerfile                   Backend-only image (used by docker-compose.yml)
├── frontend/                        React + Vite single-page app
│   ├── src/
│   │   ├── App.jsx, main.jsx, index.css
│   │   ├── components/              Sidebar, FilterBar, KpiCard, Panel, InfoTip, States, StatusBadge, charts/
│   │   ├── pages/                   Overview, ForecastAnalysis, Accuracy, DataExplorer, DataSources
│   │   ├── hooks/                   useAsync, useHashRoute
│   │   ├── services/api.js          Backend API client
│   │   ├── utils/                   format, csv, table helpers
│   │   └── test/                    Vitest + RTL tests (SYNTHETIC fixtures)
│   ├── nginx.conf, Dockerfile       Frontend image for docker-compose (nginx, proxies /api)
│   └── vite.config.js, tailwind.config.js
├── vercel.json, .vercelignore       Vercel configuration (backend + frontend as two services)
├── Dockerfile, heroku.yml           Single-container build for Heroku / any Docker host
├── docker-compose.yml               Local two-container stack (nginx + FastAPI)
├── .env.example                     All configuration variables
├── TESTING_AND_DEMO_GUIDE.md        How to test against the brief and script the demo video
└── README.md
```

## Running locally

### Prerequisites
- Python 3.11+ (tested with 3.14 locally and 3.12 in Docker)
- Node.js 20+ (tested with 24)
- Docker Desktop (optional)

### Option A: Docker Compose (two containers)

```bash
cp .env.example .env        # optional
docker compose up --build
```
- App: http://localhost:8080 (if 8080 is taken, run `FRONTEND_PORT=8088 docker compose up --build`, or set it in `.env`)
- API: http://localhost:8000/api/health · interactive docs: http://localhost:8000/docs
- Stop: `docker compose down`

### Option B: single production container (same image as Heroku)

```bash
docker build -t wind-intelligence .
docker run --rm -p 8000:8000 wind-intelligence
```
Open http://localhost:8000 (the UI and API are served from the same origin).

### Option C: run the services separately (development)

Backend:
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Frontend (new terminal):
```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173 (proxies /api to 127.0.0.1:8000)
```

## Configuration

All settings come from environment variables; see `.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `ELEXON_BASE_URL` | `https://data.elexon.co.uk/bmrs/api/v1` | Elexon Insights API |
| `HTTP_TIMEOUT_SECONDS` / `HTTP_MAX_RETRIES` / `HTTP_BACKOFF_SECONDS` | 30 / 3 / 1.0 | HTTP behaviour |
| `FETCH_CHUNK_DAYS` | 7 | Request window size |
| `DATA_DIR` | `backend/data` | Snapshot cache location |
| `AUTO_FETCH_ON_EMPTY_CACHE` | `true` | Fetch from Elexon if no snapshot exists |
| `ANALYSIS_START` / `ANALYSIS_END` | 2026-01-01 / 2026-01-31 | Delivery dates analysed |
| `DEFAULT_CUTOFF_TIME` | `11:00` | Default D-1 cutoff (UK local) |
| `CORS_ORIGINS` | localhost dev origins | Allowed browser origins (needed only if the frontend is on a different origin) |
| `STATIC_DIR` | `backend/static` | Built frontend to serve from FastAPI (set automatically in the root Dockerfile) |
| `FRONTEND_PORT` | `8080` | Host port for the UI in docker-compose |
| `VITE_API_BASE_URL` | empty (same origin) | Backend URL, only if the frontend is hosted separately |

## API

All analysis endpoints accept `start_date`, `end_date` (YYYY-MM-DD, within the analysis period), `cutoff_mode` (`day_ahead` | `horizon`), `cutoff_time` (`HH:MM`, UK local) and `horizon_hours` (0–72). Invalid input returns **422**. If no data is available, the response is **503**. A failed Elexon refresh returns **502** and keeps the previous data.

| Method & path | Description |
|---|---|
| `GET /api/health` | Service status, whether data is loaded, last refresh time and error |
| `GET /api/meta` | Analysis period, default cutoff, sources and doc links, record counts |
| `POST /api/refresh` | Re-fetch from Elexon and replace the snapshot |
| `GET /api/actuals` | Wind actuals for the date range |
| `GET /api/forecasts` | Selected (latest eligible) forecast per interval, with publish time, cutoff and lead time |
| `GET /api/accuracy` | Metrics, coverage, daily summary, hour-of-day profile |
| `GET /api/analysis` | Everything in `/accuracy` plus interval rows (used by the UI) |

Interactive OpenAPI docs: `/docs`.

## Tests

```bash
cd backend && pytest            # 39 tests
cd frontend && npm test         # 15 tests
cd frontend && npm run build    # production build
```

Backend tests cover MAE, RMSE, bias and MAPE (including zero actuals), missing observations, duplicates, multiple forecasts per interval, selecting the latest eligible forecast, excluding forecasts published after the cutoff or after the interval starts, timestamp alignment, BST and clock-change days, date filtering, Elexon client chunking, retries and error handling, payload validation, API validation (422), failure modes (502/503), the read-only-filesystem fallback, and static frontend serving.
Frontend tests cover data loading into KPIs, navigation, retryable errors, cutoff changes being sent to the API, refresh success and failure messages, date-range validation, and Data Explorer filter, sort and CSV export.
All test fixtures are **synthetic**, clearly labelled, and kept separate from the real snapshot.

See [`TESTING_AND_DEMO_GUIDE.md`](TESTING_AND_DEMO_GUIDE.md) for a manual test checklist mapped to the brief and a script for the demo video.

## Deployment

The brief asks for a deployment on **Vercel or Heroku**. Both are configured. Pick one. After deploying, put the URL at the top of this README and in the submission form.

### Option 1: Heroku (recommended: the exact image is tested locally)

The root `Dockerfile` builds the React app and serves it together with the API from one FastAPI container. `heroku.yml` tells Heroku to build it. Heroku's cheapest plan is paid (no free tier).

```bash
# one-time: install the Heroku CLI and log in
heroku login

heroku create <your-app-name>         # use an anonymous name if you like
heroku stack:set container
git push heroku main                  # run from the repo root (the folder with heroku.yml)
heroku open
heroku logs --tail                    # if something looks wrong
```

Notes:
- Heroku sets `PORT`; the container reads it automatically. No other variables are required.
- The committed snapshot in `backend/data/` is loaded on boot, so the dashboard has real data immediately.
- Heroku's filesystem is ephemeral: **Refresh data** works but is lost when the dyno restarts (about once a day), after which the bundled snapshot is used again.

### Option 2: Vercel (backend and frontend as two services in one project)

`vercel.json` uses [Vercel Services](https://vercel.com/docs/services): the FastAPI backend (`backend/`) and the Vite frontend (`frontend/`) are built separately but deployed as one project on one domain. Requests to `/api/*` (and `/docs`) go to the backend; everything else goes to the frontend. A service receives the original request path, so the backend routes (`/api/health`, ...) work unchanged, and the frontend calls `/api` on the same origin (no CORS or environment variables needed).

**Dashboard (recommended)**
1. Sign in at https://vercel.com with GitHub.
2. **Add New > Project**, import this repository.
3. Vercel detects the two services from `vercel.json`. Keep the defaults and click **Deploy**.
4. Open `https://<your-url>/api/health`, then the dashboard.

**CLI**
```bash
npx vercel login
npx vercel --prod          # run from the repo root
```

Notes:
- The bundled snapshot in `backend/data/` is read on boot, so the dashboard has real data immediately.
- The function's filesystem is read-only; **Refresh data** writes to a temp directory that is per-instance and short-lived. The bundled snapshot is always the baseline.
- If Vercel shows a login page on the deployment URL, turn off **Deployment Protection > Vercel Authentication** in the project settings.
- Services is a Vercel beta feature. If it is unavailable for your account, use Option 1 (Heroku).

### Pre-deployment checklist

- [ ] `cd backend && pytest` and `cd frontend && npm test` pass
- [ ] `docker build -t wind-intelligence . && docker run -p 8000:8000 wind-intelligence` works at http://localhost:8000
- [ ] `backend/data/` contains the three snapshot files (so the first load is instant)
- [ ] No secrets in the repo (this app needs none; `.env` is git-ignored)
- [ ] After deploying: open `/api/health`, then the dashboard, and click **Refresh data**

## Publishing to GitHub

The brief asks for a **public repo with an anonymous name** (for example a random string like `kjhwr`).

```bash
cd full_stack_pro                 # this folder must be its own repository root
git init
git add .
git status                        # check: no .env, no node_modules, no .venv, no PDF
git commit -m "Wind Intelligence: initial version"
git branch -M main

# create an EMPTY public repo on github.com with the anonymous name, then:
git remote add origin https://github.com/<your-username>/<anonymous-name>.git
git push -u origin main
```

If you use the GitHub CLI: `gh repo create <anonymous-name> --public --source . --push`.

## Known limitations

- `WINDFOR` is hourly, so half-past intervals are not evaluated. The app does not interpolate forecasts.
- The decision cutoff is a documented, configurable assumption. The client's real cutoff should be confirmed.
- Only national wind is in scope: no regional breakdown, other renewables, or embedded/solar generation.
- The analysis period is fixed by configuration (January 2026). Other months need `ANALYSIS_START`/`ANALYSIS_END` and a refresh.
- The snapshot cache is a local JSON file. That is fine for a single instance but would need shared storage to scale out; on serverless or ephemeral hosts a refresh does not survive restarts.
- The Heroku/Docker image has been built and run locally; the Vercel Services configuration depends on a Vercel beta feature.
- No authentication (it is an internal pilot tool).

## AI tools disclosure

This project was built with the help of an AI coding assistant (Anthropic's Claude, via Claude Code). It was used to inspect the Elexon API, write the backend, frontend, tests, deployment configuration and documentation, and run the verification steps. All API behaviour described here was checked against live Elexon responses, and all reported test results come from actual test runs.
