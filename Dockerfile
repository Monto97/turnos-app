# ============================================================
#  Multi-stage build: Angular + Node.js Express
#  Stage 1: compila el frontend Angular
#  Stage 2: imagen de producción con el backend + los estáticos
# ============================================================

# --- Stage 1: build Angular ---
FROM node:20-alpine AS frontend-builder
WORKDIR /frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build -- --configuration production

# --- Stage 2: imagen de producción ---
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
# Express buscará los estáticos de Angular en /app/public
ENV STATIC_PATH=/app/public

# Instalar solo dependencias de producción del backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copiar código del backend
COPY backend/ ./

# Copiar el build de Angular (browser bundle)
# Angular 17+ con @angular/build:application genera: dist/[project]/browser/
COPY --from=frontend-builder /frontend/dist/frontend/browser ./public

EXPOSE 3000

CMD ["sh", "start.sh"]
