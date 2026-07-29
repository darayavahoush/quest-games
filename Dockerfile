# ---- Stage 1: build the React frontend ----
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY breathquest/frontend/package*.json ./
RUN npm install
COPY breathquest/frontend/ ./
RUN npm run build

# ---- Stage 2: Python backend, serving the built frontend ----
FROM python:3.11-slim
WORKDIR /app

# libsndfile for soundfile/librosa, ffmpeg for librosa's audioread
# fallback (webm decoding) and faster-whisper.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 ffmpeg build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY breathquest/backend/requirements-hf.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY breathquest/backend/ ./
COPY --from=frontend-build /frontend/dist ./static

# Demo-only settings — ephemeral SQLite (fine for a feedback demo,
# resets on redeploy/restart), fixed secret (no real patient data
# will live here). Not for production use.
ENV DATABASE_URL=sqlite+aiosqlite:///./data.db
ENV SECRET_KEY=demo-only-render-space-not-for-production
# Smaller whisper model to stay comfortably under Render's free 512MB RAM
ENV DEBUG=false
ENV CHIME_WHISPER_MODEL=tiny
ENV PORT=7860

EXPOSE 7860
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]
