FROM python:3.11-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY pyproject.toml /app/
COPY services /app/services
COPY data/seed /app/data/seed
RUN pip install --no-cache-dir '.[deployment]' && useradd --uid 10001 --create-home owl
USER owl
EXPOSE 8017
CMD ["python", "-m", "uvicorn", "services.api.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8017", "--workers", "1", "--no-access-log"]
