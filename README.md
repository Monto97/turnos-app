# Turnos App

Sistema completo de gestión de turnos online para centros de estética y salud. Permite a los dueños administrar profesionales, servicios y agenda, mientras que los clientes pueden reservar turnos de forma autónoma desde el navegador.

> Demo data: "Studio Belle" — spa/estética ficticio con datos precargados para probar todas las funcionalidades.

---

## Stack tecnológico

| Capa | Tecnologías |
|---|---|
| **Frontend** | Angular 21 (Standalone Components, Signals, Lazy Loading) |
| **Backend** | Node.js 20 + Express 4 (ES Modules) |
| **Base de datos** | MySQL 8.0 |
| **Auth** | JWT + bcryptjs + password reset por email |
| **Pagos** | Mercado Pago SDK (flujo de seña/depósito) |
| **Email** | Resend SDK |
| **Deploy** | Docker (multi-stage build) + Railway |
| **Dev local** | Docker Compose (MySQL + phpMyAdmin) |

---

## Funcionalidades principales

### Panel de administración (rol: dueño)
- **Agenda** — vista de calendario con todos los turnos del día/semana, filtro por profesional, cambio de estado (confirmado, cancelado, completado, ausente)
- **Configuración** — ABM de profesionales, servicios con duración y precio, horarios laborales por día de la semana, bloqueos/vacaciones
- **Clientes** — búsqueda y gestión del directorio de clientes con historial de turnos

### Flujo de reserva (público, sin login requerido)
1. Selección de servicio
2. Selección de profesional
3. Elección de fecha y horario disponible
4. Confirmación y pago opcional de seña vía Mercado Pago

### Cuentas de cliente
- Registro, login y recuperación de contraseña por email
- Vista de turnos propios con opción de cancelación

---

## Arquitectura

```
turnos-app/
├── frontend/          # Angular 21 SPA
│   └── src/
│       ├── core/      # AuthService (signals), guards, API service
│       └── pages/     # login, registro, reserva (4 pasos), panel (agenda, config, clientes)
│
├── backend/           # Express REST API
│   └── src/
│       ├── routes/    # /api/auth  |  /api/publico  |  /api (admin)
│       └── services/  # auth, crud, disponibilidad, turnos, reserva, email, mercadopago
│
├── Dockerfile         # Multi-stage: compila Angular → sirve con Node
├── docker-compose.yml # Dev: MySQL 8 + phpMyAdmin
└── railway.json       # Config de deploy en Railway
```

### Decisiones de diseño destacadas

**Motor de disponibilidad transaccional** — Los slots disponibles se calculan dinámicamente (no se persisten) considerando duración del servicio, horarios laborales del profesional, turnos existentes y bloqueos. La inserción de un nuevo turno ocurre dentro de una transacción que recalcula disponibilidad justo antes de confirmar, previniendo doble-booking bajo carga concurrente.

**State management con Angular Signals** — `AuthService` usa `signal<Usuario>` y `computed()` nativos de Angular 17+, sin librerías externas (NgRx/Akita). El estado reactivo se propaga a los guards y componentes vía observables derivados.

**Imagen Docker optimizada** — Build en dos etapas: Stage 1 compila el frontend con Node 20 Alpine, Stage 2 copia solo el output estático junto al backend. El resultado es una imagen liviana (~150MB) que sirve frontend y API desde el mismo proceso.

**Snapshot de precio** — El campo `precio_snapshot` en `turnos` guarda el precio al momento de la reserva, preservando el historial aunque el servicio cambie de valor.

**Modo simulación** — Si `RESEND_API_KEY` o `MP_ACCESS_TOKEN` no están configurados, el sistema opera en modo de desarrollo: los emails se loggean en consola y los pagos se confirman con un endpoint simulado, sin necesidad de cuentas externas.

---

## Correr localmente

**Requisitos:** Docker, Node.js 18+

```bash
# 1. Clonar y levantar la base de datos
git clone <repo-url>
cd turnos-app
docker compose up -d

# 2. Backend
cd backend
npm install
cp .env.example .env    # ajustar variables si hace falta
npm run dev             # http://localhost:3000

# 3. Frontend (en otra terminal)
cd frontend
npm install
npm start               # http://localhost:4200
```

phpMyAdmin disponible en `http://localhost:8080` (usuario: `turnos_user`, contraseña: `turnos_pass_dev`).

### Variables de entorno requeridas

```env
JWT_SECRET=          # cualquier string largo y aleatorio
CODIGO_DUENO=        # código para registrar un usuario con rol "dueño"

# Opcionales — si no se configuran, el sistema usa modo simulación
RESEND_API_KEY=      # para envío real de emails
MP_ACCESS_TOKEN=     # para pagos reales con Mercado Pago
```

Ver `.env.example` para la lista completa.

---

## Esquema de base de datos (resumen)

```
usuarios ──< password_resets
    │
    └──< clientes ──< turnos >── profesionales >──< servicios
                                      │                  │
                               bloqueos (global      horarios_laborales
                               o por profesional)    profesional_servicio
```

11 tablas. Las migraciones están en `backend/migrations/` y el schema inicial en `backend/schema.sql`.

---

## API — endpoints principales

```
POST /api/auth/registro           Crear cuenta (cliente o dueño con código)
POST /api/auth/login              Login → JWT
POST /api/auth/recuperar          Solicitar reset de contraseña
POST /api/auth/reset              Confirmar nueva contraseña con token

GET  /api/publico/servicios       Listar servicios (público)
GET  /api/publico/disponibilidad  Slots disponibles por fecha y profesional
POST /api/publico/reservar        Crear turno

GET  /api/turnos                  Listar turnos (admin)
POST /api/turnos                  Crear turno (admin)
PATCH /api/turnos/:id/estado      Cambiar estado
GET  /api/disponibilidad          Disponibilidad (admin)

POST /api/publico/pagar-sena/:id  Crear preferencia de Mercado Pago
POST /api/publico/mp-webhook      Webhook de confirmación de pago
```

La documentación completa de la API está en `backend/README.md`.

---

## Deploy

El proyecto está configurado para Railway con un solo comando:

```bash
railway up
```

Railway detecta el `Dockerfile` y el `railway.json`. El plugin de MySQL de Railway inyecta automáticamente las variables de conexión (`MYSQLHOST`, `MYSQLPORT`, etc.). Solo hace falta agregar las variables del dominio (JWT_SECRET, email, pagos) desde el dashboard.

---

## Tecnologías utilizadas

**Frontend:** Angular 21 · TypeScript 5.9 · RxJS 7 · Angular Router (lazy loading) · Reactive Forms · CSS custom properties

**Backend:** Node.js 20 · Express 4 · MySQL2 (promise pool) · JSON Web Tokens · bcryptjs · Resend · Mercado Pago SDK · Vitest + Supertest

**Infraestructura:** Docker · Docker Compose · Railway · GitHub
