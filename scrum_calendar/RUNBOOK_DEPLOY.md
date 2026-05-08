# RUNBOOK_DEPLOY

## Objetivo

Definir un proceso repetible y seguro para desplegar SCRUM MASTER a PRD sin tocar la base de datos de produccion.

Este documento debe leerse antes de cualquier deploy.

## Regla Critica

No ejecutar:

```bash
docker compose down -v
docker volume rm
rm -rf /var/lib/postgresql
```

No reemplazar:

```text
.env de PRD
volumen db_data
base de datos PostgreSQL de PRD
```

## Flujo Oficial

1. Trabajar en local.
2. Validar local.
3. Commit.
4. Push a GitHub.
5. Deploy a EC2.
6. Validar PRD.

## Datos De PRD

```text
Host: 107.23.137.161
Usuario: ec2-user
Key: ~/.ssh/RCastroPY-3.pem
Ruta: /home/ec2-user/SCRUM_IA/scrum_calendar
URL: http://107.23.137.161:8000
```

## Precheck Local

Desde:

```bash
cd "/Users/rafaelcastro/Library/CloudStorage/OneDrive-Personal/Desarrollos/SCRUM IA/scrum_calendar"
```

Ver estado:

```bash
git status --short
git branch --show-current
```

Validar JS:

```bash
node --check ScrumV2/dist/app.js
node --check ScrumV2/dist/js/compras.js
node --check frontend/app.js
node --check frontend/js/compras.js
```

Validar Docker local:

```bash
docker compose ps
curl -s -I http://localhost:8000/ui/login.html | head
```

## Archivos Que No Deben Subirse

No subir:

```text
.env
db_backups/
*.dump
*.backup
backups/
__pycache__/
.pytest_cache/
```

Si aparecen cambios inesperados o eliminaciones masivas, detener y revisar.

## GitHub

Commit:

```bash
git add -A .
git commit -m "Mensaje claro"
git push origin main
```

Si GitHub rechaza por remoto adelantado:

```bash
git pull --rebase origin main
git push origin main
```

Solo usar force push si el usuario indica explicitamente que GitHub debe quedar exactamente igual que local:

```bash
git push --force origin main
```

## Conexion A PRD

```bash
ssh -i ~/.ssh/RCastroPY-3.pem ec2-user@107.23.137.161
```

Ver contenedores:

```bash
cd /home/ec2-user/SCRUM_IA/scrum_calendar
docker compose ps
```

## Backup Minimo Antes De Deploy

Respaldar `.env`:

```bash
ssh -i ~/.ssh/RCastroPY-3.pem ec2-user@107.23.137.161 '
cd /home/ec2-user/SCRUM_IA/scrum_calendar
cp .env .env.backup-before-deploy-$(date +%Y%m%d%H%M%S)
'
```

Opcional: backup DB si el cambio toca modelos o migraciones.

```bash
ssh -i ~/.ssh/RCastroPY-3.pem ec2-user@107.23.137.161 '
cd /home/ec2-user/SCRUM_IA/scrum_calendar
mkdir -p /home/ec2-user/db_backups
docker compose exec -T db pg_dump -U "$DB_USER" "$DB_NAME" > /home/ec2-user/db_backups/scrum_calendar_$(date +%Y%m%d%H%M%S).sql
'
```

## Deploy Recomendado Por Git

Usar cuando PRD tenga repo Git sincronizado:

```bash
ssh -i ~/.ssh/RCastroPY-3.pem ec2-user@107.23.137.161 '
set -e
cd /home/ec2-user/SCRUM_IA/scrum_calendar
cp .env .env.backup-before-deploy-$(date +%Y%m%d%H%M%S)
git pull origin main
docker compose up -d --build
docker compose ps
'
```

## Deploy Alternativo Por Paquete

Usar si Git falla o OneDrive/Git se bloquea.

Crear paquete runtime local:

```bash
rm -rf /tmp/scrum_runtime_deploy /tmp/scrum_calendar_deploy.tgz
mkdir -p /tmp/scrum_runtime_deploy

cp Dockerfile README.md requirements.txt docker-compose.yml main.py .env.example /tmp/scrum_runtime_deploy/
cp -f Reportes_Celulas.md PROJECT_CONTEXT.md RUNBOOK_DEPLOY.md MODULE_MAP.md /tmp/scrum_runtime_deploy/ 2>/dev/null || true

mkdir -p /tmp/scrum_runtime_deploy/api /tmp/scrum_runtime_deploy/config /tmp/scrum_runtime_deploy/core /tmp/scrum_runtime_deploy/data /tmp/scrum_runtime_deploy/scripts /tmp/scrum_runtime_deploy/tests /tmp/scrum_runtime_deploy/ScrumV2

cp api/*.py /tmp/scrum_runtime_deploy/api/ 2>/dev/null || true
cp config/*.py /tmp/scrum_runtime_deploy/config/ 2>/dev/null || true
cp core/*.py /tmp/scrum_runtime_deploy/core/ 2>/dev/null || true
cp data/*.py /tmp/scrum_runtime_deploy/data/ 2>/dev/null || true
cp scripts/*.py scripts/*.sql /tmp/scrum_runtime_deploy/scripts/ 2>/dev/null || true
cp tests/*.py /tmp/scrum_runtime_deploy/tests/ 2>/dev/null || true
cp -R frontend /tmp/scrum_runtime_deploy/frontend
cp -R ScrumV2/dist /tmp/scrum_runtime_deploy/ScrumV2/dist

find /tmp/scrum_runtime_deploy -name "__pycache__" -type d -prune -exec rm -rf {} +
tar -czf /tmp/scrum_calendar_deploy.tgz -C /tmp/scrum_runtime_deploy .
```

Copiar a EC2:

```bash
scp -i ~/.ssh/RCastroPY-3.pem /tmp/scrum_calendar_deploy.tgz ec2-user@107.23.137.161:/home/ec2-user/scrum_calendar_deploy.tgz
```

Instalar sin tocar DB:

```bash
ssh -i ~/.ssh/RCastroPY-3.pem ec2-user@107.23.137.161 '
set -e
cd /home/ec2-user/SCRUM_IA
STAMP=$(date +%Y%m%d%H%M%S)
rm -rf scrum_calendar_new
mkdir -p scrum_calendar_new
tar -xzf /home/ec2-user/scrum_calendar_deploy.tgz -C scrum_calendar_new
cp scrum_calendar/.env scrum_calendar_new/.env
cd scrum_calendar
docker compose stop api
cd ..
mv scrum_calendar "scrum_calendar_backup_${STAMP}"
mv scrum_calendar_new scrum_calendar
cd scrum_calendar
docker compose up -d --build
docker compose ps
'
```

## Validacion PRD

Login redirect:

```bash
curl -s -o /tmp/prd_login.html -w "%{http_code} %{redirect_url}\n" http://107.23.137.161:8000/ui/daily.html
```

Login API:

```bash
curl -s -c /tmp/prd_cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"1234"}' \
  http://107.23.137.161:8000/auth/login
```

Validar paginas:

```bash
curl -s -o /tmp/prd_daily.html -w "%{http_code}\n" -b /tmp/prd_cookies.txt http://107.23.137.161:8000/ui/daily.html
curl -s -o /tmp/prd_tasks.html -w "%{http_code}\n" -b /tmp/prd_cookies.txt http://107.23.137.161:8000/ui/tasks.html
curl -s -o /tmp/prd_releases.html -w "%{http_code}\n" -b /tmp/prd_cookies.txt http://107.23.137.161:8000/ui/releases-table.html
```

Logs:

```bash
ssh -i ~/.ssh/RCastroPY-3.pem ec2-user@107.23.137.161 '
cd /home/ec2-user/SCRUM_IA/scrum_calendar
docker compose logs --tail=80 api
docker compose ps
'
```

## Rollback

Si el deploy falla:

```bash
ssh -i ~/.ssh/RCastroPY-3.pem ec2-user@107.23.137.161 '
set -e
cd /home/ec2-user/SCRUM_IA
ls -dt scrum_calendar_backup_* | head -1
'
```

Restaurar ultimo backup:

```bash
ssh -i ~/.ssh/RCastroPY-3.pem ec2-user@107.23.137.161 '
set -e
cd /home/ec2-user/SCRUM_IA
LAST=$(ls -dt scrum_calendar_backup_* | head -1)
cd scrum_calendar
docker compose stop api
cd ..
mv scrum_calendar scrum_calendar_failed_$(date +%Y%m%d%H%M%S)
mv "$LAST" scrum_calendar
cd scrum_calendar
docker compose up -d --build
docker compose ps
'
```

## Problemas Conocidos

- `git fetch` o `git archive` pueden quedar lentos si OneDrive bloquea archivos.
- `rsync` puede colgar en algunas transferencias.
- En esos casos usar deploy por paquete runtime.
- AWS Cost Explorer no siempre muestra creditos restantes, solo creditos aplicados.

## Checklist De Cierre

- GitHub actualizado.
- PRD responde `200`.
- `api` arriba.
- `db` arriba y no recreada.
- Login validado.
- Pagina modificada carga asset con cache-buster nuevo.
- Usuario informado con commit y URL.
