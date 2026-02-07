#!/usr/bin/env bash
set -euo pipefail

echo "==> Actualizando repositorio..."
git pull

echo "==> Reconstruyendo y levantando contenedores..."
cd scrum_calendar
docker compose up -d --build

echo "==> Estado:"
docker compose ps
