# Plan de Trabajo de Seguridad (Checklist Ejecutable)

Objetivo: elevar la seguridad de Scrum IA con una secuencia de tareas priorizadas y verificables.

## 1) Critico - Autenticacion y Autorizacion

- [x] Validar sesion real en rutas `/ui` (no solo presencia de cookie).
  - Criterio: si token no existe en BD o expiro, redirige a login y elimina cookie.
- [x] Eliminar bypass global de middleware para metodos y rutas privilegiadas.
  - Criterio: no existe excepcion general por `GET/HEAD` ni por prefijo `/tasks` en `main.py`.
- [x] Mover autorizacion por rol a dependencias explicitas por endpoint.
  - Criterio: endpoints con mutacion requieren `admin` o politica definida (`member` acotado).
- [ ] Revisar endpoints de tareas para politica minima de permisos.
  - Criterio: `member` no puede editar/eliminar fuera de su alcance definido.

## 2) Alta - Sesiones y Cookies

- [x] Endurecer cookie de sesion con `secure=True` en produccion.
  - Criterio: cookie solo via HTTPS en PRD.
- [x] Mantener `httponly=True` y `samesite=lax` o `strict` segun flujo.
  - Criterio: no hay lectura JS de cookie de sesion.
- [x] Invalidar sesiones expiradas en cada acceso.
  - Criterio: limpieza automatica de tokens vencidos.

## 3) Alta - CORS y Superficie Expuesta

- [x] Reemplazar `allow_origins=["*"]` por lista desde entorno.
  - Criterio: solo dominios permitidos (local y PRD).
- [x] Restringir `/docs`, `/openapi`, `/redoc` en produccion.
  - Criterio: accesibles solo en desarrollo o para admin autenticado.

## 4) Alta - Secretos y Configuracion

- [x] Eliminar credenciales por defecto reales de `settings.py`.
  - Criterio: `database_url` viene desde `.env`/secret manager.
- [x] Preparar toolkit y runbook de rotacion (local + PRD).
  - Criterio: script de rotacion + guia operativa + actualizacion segura de `.env`.
- [ ] Rotar credenciales actuales de BD y sesiones.
  - Criterio: claves antiguas dejan de funcionar en PRD.

## 5) Media - Criptografia y Credenciales

- [x] Subir `PBKDF2_ROUNDS` (objetivo recomendado: 600_000).
  - Criterio: nuevas contrasenas usan costo fuerte.
- [x] Definir estrategia de migracion de hashes sin cortar login.
  - Criterio: rehash transparente al autenticar usuarios antiguos.

## 6) Media - Proteccion Operativa

- [x] Implementar rate limiting en login.
  - Criterio: bloqueo temporal por intentos fallidos repetidos.
- [x] Agregar auditoria de eventos de seguridad.
  - Criterio: logs para login, logout, 401, 403, cambios admin.
- [x] Estandarizar cabeceras de seguridad HTTP.
  - Criterio: al menos `X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy` base.

## 7) QA de Seguridad (obligatorio antes de cerrar)

- [ ] Tests automatizados de auth/authz (unit + integracion).
  - Criterio: casos de acceso no autenticado, rol invalido, token vencido.
- [ ] Test de regresion para UI protegida.
  - Criterio: no carga vistas privadas con cookie forjada.
- [ ] Checklist de despliegue seguro en PRD.
  - Criterio: HTTPS activo, cookies seguras, CORS restringido, docs protegidos.

## 8) Orden de Ejecucion Recomendado

1. Auth middleware + autorizacion por endpoint.
2. Cookies seguras + validacion UI real.
3. CORS + cierre de docs.
4. Secretos + rotacion de credenciales.
5. PBKDF2 + migracion de hashes.
6. Rate limiting + auditoria + hardening final.

## 9) Definicion de Terminado (DoD) de Seguridad

- [ ] Ninguna ruta sensible responde sin sesion valida.
- [ ] Ninguna mutacion sensible se ejecuta sin permiso de rol correcto.
- [ ] No existen secretos hardcodeados en repositorio.
- [ ] Seguridad verificada en local y PRD con evidencia de pruebas.
