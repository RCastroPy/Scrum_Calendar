FROM python:3.11-slim

WORKDIR /app

ENV TZ=America/Asuncion

RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata \
    && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
    && echo $TZ > /etc/timezone \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app

EXPOSE 10000

CMD ["/bin/sh", "-c", "python scripts/prepare_database.py && exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
