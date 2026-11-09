FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*
COPY requirements.lock.txt pyproject.toml ./
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY src ./src
COPY artifacts ./artifacts
ENV PYTHONPATH=/app/src OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
EXPOSE 8000
CMD ["uvicorn", "wine_lab.api:app", "--host", "0.0.0.0", "--port", "8000"]
