# Plan de Pruebas (Retro Realtime) – 20 Usuarios

**Objetivo:** validar que la Retrospectiva funciona en tiempo real (WebSocket), con latencia baja, sin “Enviando…” largos, y con presencia online/offline al bloquear/desbloquear el telefono.

## Alcance
- Retro (SM): preparar link, iniciar fase, ver aportes en tiempo real, cambiar a “mejoras”, cerrar retro.
- Retro (Usuarios): seleccionar nombre, enviar aportes, ver cierre en tiempo real.
- Presencia: indicador verde/rojo segun actividad (lock/unlock).

## Ambientes
- **Local:** `http://localhost:8000/ui/login.html`
- **PRD:** ejecutar este mismo plan en PRD solo despues de subir a GitHub y desplegar.

## Datos Previos
- 1 Celula activa con **20 personas** activas (o mas).
- 1 Sprint creado y asignado a esa Celula.

## Instrumentacion / Como Medir
- En navegador (SM y usuarios):
  - Chrome DevTools:
    - `Network`: ver Duracion total de requests HTTP.
    - `Console`: no deben aparecer errores repetidos de WS.
- En servidor:
  - Para endpoints clave se retornan headers: `Server-Timing` / `X-App-Duration-Ms` (cuando aplica).
  - Logs: `docker compose logs -f api` (desde `scrum_calendar/`).

## Metricas Objetivo (SLA sugerido)
- SM “Iniciar (bien/mal)”: UI responsive (sin freeze) y usuarios actualizan en **< 1s** via WS.
- Usuario “Enviar”: confirmacion en pantalla en **< 1s** (ack via WS); en SM aparece el item en **< 1s**.
- Cambio de fase (bien -> mal): usuarios y SM actualizan en **< 1s**.
- Cierre: usuarios reciben mensaje de cierre en **< 1s**; inputs deshabilitados.
- Presencia:
  - Al bloquear telefono: pasa a rojo en **<= 15s** (depende de heartbeat).
  - Al desbloquear: vuelve a verde en **<= 5s**.

## Flujo de Prueba (20 usuarios)

### 1) Preparacion (SM)
1. Loguear como admin.
2. Ir a Retrospectiva.
3. Seleccionar Celula + Sprint.
4. Click en “Preparar link”.
5. Abrir el link en 20 clientes:
   - Opcion A: 20 tabs en modo incognito (rapido).
   - Opcion B: varios telefonos + laptop.

**Validacion:** en dashboard del SM, “Conectados” debe subir a 20 (o cercano) y cada persona debe poder seleccionar nombre sin duplicados.

### 2) Medicion: Boton Iniciar
1. En SM, click “Iniciar (bien)”.
2. Medir:
   - Tiempo hasta que el boton deja de decir “Iniciando…”.
   - Tiempo hasta que en clientes aparece “Activo: Que hicimos bien”.

**Esperado:** < 1s; sin “Fetch is abort” en clientes.

### 3) Medicion: Envio de Respuestas (Usuarios)
1. En 10 usuarios, enviar 1 aporte cada uno (texto corto).
2. En otros 10 usuarios, enviar 2 aportes cada uno (texto distinto).
3. Medir:
   - Tiempo de “Enviando…” hasta “Gracias, tu aporte fue registrado”.
   - Tiempo hasta aparecer en tablero del SM (sin refrescar manual).

**Esperado:** < 1s.

### 4) Tiempo Real en Dashboard (SM)
1. Mientras usuarios envian, el SM debe ver:
   - Aportes agregandose automaticamente.
   - “check/enviado” por persona (si aplica en UI).

**Esperado:** todo sin refresh; cada `item_added` llega por WS.

### 5) Medicion: Boton Mejoras (fase “mal”)
1. SM click “Mejoras”.
2. Usuarios deben cambiar de fase en tiempo real.

**Esperado:** < 1s.

### 6) Cierre de Retro (SM)
1. SM click “Cerrar”.
2. Medir:
   - Tiempo hasta confirmar cierre en SM.
   - Tiempo hasta que los 20 usuarios reciben el mensaje de cierre.

**Esperado:** < 1s para ver el mensaje de cierre (WS). Inputs deshabilitados.

### 7) Presencia: Lock/Unlock (Conectado/Desconectado)
1. Seleccionar 3 usuarios.
2. Bloquear el telefono (pantalla off) por 20s.
3. Validar en SM que esos usuarios pasan a rojo.
4. Desbloquear y volver a la pagina.
5. Validar que vuelven a verde.

**Esperado:** rojo <= 15s; verde <= 5s.

## Registro de Resultados (tabla sugerida)
- Corrida # / Fecha / Ambiente / Dispositivo / Navegador
- `t_iniciar_ms`, `t_envio_ms_prom`, `t_envio_ms_p95`, `t_aparicion_SM_ms`
- Incidencias (captura de consola + request lento)

