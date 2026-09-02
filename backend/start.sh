#!/bin/sh
# Script de arranque para producción.
# Ejecuta migraciones y luego inicia el servidor.
set -e

echo "--- Aplicando migraciones ---"
node scripts/migrate.js

echo "--- Iniciando servidor ---"
exec node src/index.js
