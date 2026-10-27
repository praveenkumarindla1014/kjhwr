# Single-container build used for Heroku (container stack) or any Docker host:
# FastAPI serves the API and the built React app from one origin.

# ---- 1. Build the React frontend ----
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ .
ENV VITE_API_BASE_URL=""
RUN npm run build

# ---- 2. Python runtime ----
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    STATIC_DIR=/app/static

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/app ./app
# Snapshot of real Elexon data so the app works immediately (and if Elexon is down).
COPY backend/data ./data
COPY --from=frontend-build /app/dist ./static

RUN useradd --create-home appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
# Heroku injects $PORT; default to 8000 elsewhere. Allow all origins' proxy headers.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
