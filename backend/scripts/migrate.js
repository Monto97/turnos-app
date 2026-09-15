/**
 * Inicialización de base de datos PostgreSQL.
 * - Aplica el schema (CREATE TABLE IF NOT EXISTS, idempotente).
 * - Si la DB está vacía, carga los datos de demo.
 * - Crea los usuarios de demo con contraseñas hasheadas con bcrypt.
 *
 * Ejecutar una vez antes del primer deploy:
 *   DATABASE_URL=<neon-url> node scripts/migrate.js
 */

import pg from 'pg';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

async function migrate() {
  // Limpiar parámetros que pg no soporta (channel_binding viene en algunas URLs de Neon)
  const dbUrl = (process.env.DATABASE_URL || '').replace(/[&?]channel_binding=[^&]*/g, '');
  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log('✓ Conexión a PostgreSQL OK');

    const schema = readFileSync(join(__dirname, '../schema.sql'), 'utf8');
    await client.query(schema);
    console.log('✓ Schema aplicado');

    const { rows: [{ n }] } = await client.query('SELECT COUNT(*) AS n FROM profesionales');
    if (Number(n) > 0) {
      console.log('✓ Datos ya existentes, omitiendo seed');
      return;
    }

    const seed = readFileSync(join(__dirname, '../seed.sql'), 'utf8');
    await client.query(seed);
    console.log('✓ Datos de demo cargados');

    const ROUNDS = 10;
    const duenoHash   = await bcrypt.hash('Demo1234!', ROUNDS);
    const clienteHash = await bcrypt.hash('Demo1234!', ROUNDS);

    await client.query(
      `INSERT INTO usuarios (nombre, apellido, email, telefono, password_hash, rol) VALUES
       ($1, $2, $3, $4, $5, $6),
       ($7, $8, $9, $10, $11, $12)`,
      [
        'Admin',   'Demo', 'admin@studiobelle.com',   '+54 11 9999-0000', duenoHash,   'dueno',
        'Cliente', 'Demo', 'cliente@studiobelle.com', '+54 11 9999-0001', clienteHash, 'cliente',
      ]
    );

    const { rows: [clienteUser] } = await client.query(
      "SELECT id FROM usuarios WHERE email = 'cliente@studiobelle.com'"
    );
    await client.query(
      'UPDATE clientes SET usuario_id = $1 WHERE email = $2',
      [clienteUser.id, 'laura@email.com']
    );

    console.log('✓ Usuarios de demo creados:');
    console.log('  admin@studiobelle.com   / Demo1234!  (dueño - acceso al panel)');
    console.log('  cliente@studiobelle.com / Demo1234!  (cliente - ve sus turnos)');

  } catch (err) {
    console.error('✗ Error en migración:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
