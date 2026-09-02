# Backend - Sistema de Turnos

API REST en Node/Express + MySQL para gestión de turnos multi-profesional
con reserva online y motor de cálculo de disponibilidad.

## Requisitos
- Node 18+
- MySQL corriendo (via el docker-compose de la raíz del proyecto)

## Puesta en marcha

1. Asegurate de tener la base levantada (desde la raíz `turnos-app/`):
   ```
   docker compose up -d
   ```

2. Instalá dependencias:
   ```
   cd backend
   npm install
   ```

3. Copiá `.env.example` a `.env` (ya viene con los valores del docker-compose):
   ```
   cp .env.example .env
   ```

4. Levantá la API:
   ```
   npm run dev
   ```

   Deberías ver:
   ```
   ✓ Conexión a MySQL OK
   ✓ API escuchando en http://localhost:3000
   ```

## Endpoints principales

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET  | `/health` | Chequeo de vida |
| GET  | `/api/profesionales` | Lista profesionales |
| POST | `/api/profesionales` | Crea profesional |
| PUT  | `/api/profesionales/:id/servicios` | Asigna servicios a un profesional |
| PUT  | `/api/profesionales/:id/horarios` | Define horarios laborales |
| GET  | `/api/servicios` | Lista servicios |
| POST | `/api/servicios` | Crea servicio |
| GET  | `/api/clientes?q=texto` | Lista/busca clientes |
| POST | `/api/clientes` | Crea cliente |
| GET  | `/api/disponibilidad?profesionalId=1&servicioId=2&fecha=2026-08-05` | Slots libres |
| GET  | `/api/turnos?desde=...&hasta=...` | Lista turnos (para la agenda) |
| POST | `/api/turnos` | Crea turno (revalida disponibilidad) |
| PATCH| `/api/turnos/:id/estado` | Cambia estado (confirmar/cancelar/ausente) |

## Estructura

```
backend/
├── schema.sql              # esquema de la base
├── src/
│   ├── index.js            # entrada de la app Express
│   ├── config/db.js        # pool de conexión MySQL
│   ├── routes/index.js     # definición de rutas
│   └── services/
│       ├── disponibilidad.service.js  # MOTOR de slots libres
│       ├── turnos.service.js          # crear/listar/cambiar estado
│       └── crud.service.js            # profesionales, servicios, clientes
```
