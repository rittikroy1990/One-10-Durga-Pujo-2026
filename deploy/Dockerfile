FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libzbar0 && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt /tmp/requirements.txt
COPY deploy/requirements.lock /tmp/requirements.lock
RUN pip install --no-cache-dir -r /tmp/requirements.txt -c /tmp/requirements.lock
CMD ["uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8010"]
