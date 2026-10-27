# Testing guide and demo-video script

App: http://localhost:8088 (Docker) or http://localhost:5173 (dev). API docs: http://localhost:8000/docs

---

## Part 1: Test the app against the PDF requirements

### A. The two things the client must be able to do

| PDF requirement | How to test it in the app | What you should see |
|---|---|---|
| **1. "Clearly understand the latest forecasts available when they need to make decisions"** | Overview, "Target interval" panel. Pick 15 Jan 2026 and 18:00. | "Decision cutoff" is 14 Jan 11:00 UK. "Forecast published" is 14 Jan 09:30 UK, which is before the cutoff. The forecast KPI shows that run's value. |
| | Header: change the cutoff time from 11:00 to 16:00. | The published time moves to the 15:30 UTC run, and the forecast value changes. This shows the cutoff controls which forecast is used. |
| | Forecast Analysis, "Forecast runs used per delivery day" table. | One publish time per day, always before that day's cutoff. |
| **2. "Evaluate accuracy quantitatively"** | Accuracy Analysis page. | MAE, RMSE, bias and MAPE, with the number of observations (744 for the full month). Each metric has an (i) tooltip. |

### B. Data requirements

| Requirement | How to verify |
|---|---|
| National wind only, from Elexon only | Data Sources page: only FUELHH and WINDFOR, with links to the official docs. |
| Actuals use `startTime`, `generation`, `fuelType = WIND` | http://localhost:8000/docs, run `GET /api/actuals`. Or compare `backend/data/fuelhh_wind.json` with the live Elexon API (below). |
| Forecasts use `startTime`, `publishTime`, `generation` | `GET /api/forecasts` returns `start_time`, `publish_time` and `generation`. |
| Only decisions for January 2026 | Date pickers only accept 1 to 31 Jan. Typing 2 Feb gives an error message. |
| Real data, not made-up data | Click **Refresh data**. A green message appears with the new timestamp and record counts. The "Last successful refresh" time in the header changes. |

Cross-check against Elexon yourself. This command should return `15538` for the last half-hour of 1 Jan:

```bash
curl "https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream?settlementDateFrom=2026-01-01&settlementDateTo=2026-01-01&fuelType=WIND"
```

In the app, Data Explorer set to "All half-hour intervals" and 1 Jan, row 23:30 UK, should show the same number.

### C. The "no hindsight" check (the most important logic)

1. Data Explorer, pick any day. For every row, "Forecast published" must be earlier than that day's cutoff. Open the CSV export and compare `forecast_publish_time_utc` with `decision_cutoff_utc`. Publish should never be later than the cutoff.
2. Change the cutoff from 11:00 to 16:00 and back. Results should change in both directions, and returning to 11:00 should restore the original numbers.

### D. Product behaviour

| Check | Steps |
|---|---|
| Charts come from the backend | Open DevTools > Network and reload. You'll see `/api/analysis` returning the chart rows. |
| Tooltips | Hover the chart. It shows target time, forecast publish time, forecast, actual and error. |
| Date filter | Set 10 Jan to 12 Jan. Every page recalculates, and observations drop to 72 (3 days × 24 hourly intervals). |
| Sorting, search, paging, CSV | Data Explorer: click column headers, type "missing", change rows per page, click **Export CSV**. Open the file and confirm it has only the filtered rows. |
| Error state | Run `docker compose stop backend`, then reload. You get a red error with **Try again**. Run `docker compose start backend` and click Try again. |
| Responsive | Resize the browser narrow. The sidebar collapses to a top bar and the tables scroll. |

### E. Automated tests (what to run and what they prove)

```bash
cd backend  && .venv\Scripts\python -m pytest -q     # 37 passed
cd frontend && npm test                               # 15 passed
cd frontend && npm run build                          # production build
docker compose up --build                             # starts the full stack
```

### F. Still to do from the PDF (not tested yet, because they aren't done)

- [ ] Deploy to Vercel or Heroku, and add the link to the README
- [ ] Public GitHub repo with an anonymous name (e.g. `kjhwr`) and a README listing files, how to start, and the live link
- [ ] Unlisted YouTube video, 10 minutes maximum
- [ ] Open every submitted URL in an incognito window and confirm access
- [ ] Submit the Microsoft form

---

## Part 2: Understanding and explaining the demo video

The PDF says the video has two parts, 10 minutes in total. Part 1 is a pitch to the customer (up to 5 minutes). Part 2 is a technical walkthrough for the tech lead (up to 5 minutes). Aim for about 4:30 each.

### Part 1: Customer pitch (about 4:30). Speak as the product developer.

| Time | Show | Say |
|---|---|---|
| 0:00 | Overview page | "Your desk buys power a day ahead. Wind is weather-dependent, so you need to know how much wind to expect and how far to trust that forecast." |
| 0:30 | "Target interval" panel: 15 Jan, 18:00 | "Pick any delivery hour. We show the forecast you actually had at your decision cutoff, when it was published, and what really happened." |
| 1:15 | Cutoff selector | "We assume you decide by 11:00 the day before, which is the GB day-ahead auction close. If your cutoff differs, change it here and everything recalculates." |
| 1:45 | Forecast vs actual chart, hover | "Blue is forecast, green is actual. Hover to see the publish time and the error." |
| 2:30 | Accuracy page | "In January, the typical miss was about 2,100 MW. The bias was about +1,840 MW: the forecast was too high in 628 of 744 hours. So for this period, plan for less wind than the forecast says." |
| 3:30 | Daily chart and hour-of-day chart | "Accuracy varies by day. These show which days and hours were worst." |
| 4:00 | Data Explorer + export | "Every number is traceable. Filter and export to CSV for your own analysis." |
| 4:20 | Data Sources | "All from Elexon, nothing added. Refresh at any time." |

Say plainly that these are results for January 2026 only and that the cutoff is an assumption. Don't claim savings figures, because the data doesn't show them.

### Part 2: Technical review (about 4:30). Show code.

| Time | Show | Say |
|---|---|---|
| 0:00 | README architecture diagram | "React frontend, FastAPI backend, Pandas analytics, Docker. The backend fetches from Elexon, caches a snapshot, and serves one `/api/analysis` payload that every page uses." |
| 0:45 | `backend/app/services/elexon_client.py` | "I checked the live API. The stream endpoints aren't paginated, so I fetch in 7-day windows, with timeouts, retries and error handling." |
| 1:30 | `analytics/processing.py`, `select_latest_forecasts` | "This is the key function. For each target interval it keeps forecasts published at or before the cutoff, then picks the latest by `publishTime`. That prevents hindsight bias." |
| 2:15 | `processing.py`, `decision_cutoffs` | "Cutoffs are computed in UK local time, then converted to UTC, so daylight-saving days are correct. Tests cover the 46-hour and 50-hour days." |
| 2:45 | `analytics/metrics.py` | "MAE, RMSE, bias are plain NumPy. MAPE skips zero actuals and reports how many it skipped. Missing data stays missing and is never turned into zero." |
| 3:15 | Run `pytest` and `npm test` live | "37 backend and 15 frontend tests. Test data is synthetic and kept in a separate folder." |
| 3:45 | `frontend/src/services/api.js`, `App.jsx` | "One data hook per filter set. Stale responses are ignored. The refresh message only appears after the backend confirms success." |
| 4:15 | `docker-compose.yml` | "`docker compose up` runs everything. nginx serves the UI and proxies `/api`." |
| 4:30 | Limitations | "WINDFOR is hourly, so I score hourly intervals only and don't interpolate. The cutoff is an assumption to confirm with the client. AI tools were used, and the README says so." |

### Tips for the recording

- Use a screen recorder such as OBS or Loom. Record at 1080p with a zoomed-in browser (about 110%) so text is readable.
- Rehearse once, and keep each part under 5 minutes. The PDF sets a 10-minute total.
- Upload to YouTube as **Unlisted**, then open the link in incognito to confirm it plays.
- The PDF says evaluation starts with the video, so don't submit without it.

### Key terms to be able to explain if asked

- **Hindsight bias**: using a forecast published after the decision was made, which would make accuracy look better than it was.
- **Cutoff**: the last moment a forecast can be used for the decision (assumed 11:00 UK on the day before).
- **Bias vs MAE**: MAE is the typical size of the miss. Bias is the average direction of the miss. A forecast can have a large MAE with zero bias if it is wrong in both directions.
- **RMSE > MAE**: the gap means a few large misses.
- **MAPE caveat**: percentages blow up when actual generation is low, so MAE is the safer headline.
