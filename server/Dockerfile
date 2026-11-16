# Build from repository root: docker build -f server/Dockerfile -t cardioekg-api .
FROM node:20-bookworm-slim AS analysis
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY server/build-runtime.mjs ./server/build-runtime.mjs
RUN node server/build-runtime.mjs

FROM python:3.12-slim-bookworm
COPY --from=analysis /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY server/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt && useradd --uid 10001 --create-home cardioekg
COPY server/app.py server/onnx_manifest.py ./
COPY server/measure/ecg_analisis.py server/measure/run_measure.py ./measure/
COPY --from=analysis /build/server/runtime/analyze.mjs ./runtime/analyze.mjs
USER 10001
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--log-level", "warning"]
