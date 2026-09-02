/**
 * Script de inicialización de base de datos.
 * - Aplica el schema (CREATE TABLE IF NOT EXISTS, idempotente).
 * - Si la DB está vacía, carga los datos de demo.
 * - Crea los usuarios de demo con contraseñas hasheadas con bcrypt.
 *
 * Se ejecuta antes del arranque del servidor (ver start.sh).
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

function getDbConfig() {
  return {
    // Soporta tanto las variables propias (DB_HOST) como las de Railway (MYSQLHOST).
    host:     process.env.DB_HOST     || process.env.MYSQLHOST     || 'localhost',
    port:     Number(process.env.DB_PORT     || process.env.MYSQLPORT)     || 3306,
    user:     process.env.DB_USER     || process.env.MYSQLUSER     || 'turnos_user',
    password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || 'turnos_pass_dev',
    database: process.env.DB_NAME     || process.env.MYSQLDATABASE || 'turnos',
    multipleStatements: true,
  };
}

async function migrate() {
  let conn;
  try {
    conn = await mysql.createConnection(getDbConfig());
    console.log('✓ Conexión a MySQL OK');

    // Aplicar schema (idempotente por los IF NOT EXISTS).
    let schema = readFileSync(join(__dirname, '../schema.sql'), 'utf8');
    // Eliminar CREATE DATABASE / USE si quedan del entorno de desarrollo local.
    schema = schema
      .replace(/CREATE\s+DATABASE[^;]+;/gi, '')
      .replace(/USE\s+\w+\s*;/gi, '');
    await conn.query(schema);
    console.log('✓ Schema aplicado');

    // Verificar si ya hay datos de demo.
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM profesionales');
    if (n > 0) {
      console.log('✓ Datos ya existentes, omitiendo seed');
      return;
    }

    // Cargar datos de demo (profesionales, servicios, turnos, etc.).
    const seed = readFileSync(join(__dirname, '../seed.sql'), 'utf8');
    await conn.query(seed);
    console.log('✓ Datos de demo cargados');

    // Crear usuarios de demo (requieren bcrypt, no pueden ir en SQL puro).
    const ROUNDS = 10;
    const hash = (p) => bcrypt.hash(p, ROUNDS);

    const duenoHash   = await hash('Demo1234!');
    const clienteHash = await hash('Demo1234!');

    await conn.query(
      `INSERT INTO usuarios (nombre, apellido, email, telefono, password_hash, rol) VALUES
       ('Admin', 'Demo', 'admin@studiobelle.com', '+54 11 9999-0000', ?, 'dueño'),
       ('Cliente', 'Demo', 'cliente@studiobelle.com', '+54 11 9999-0001', ?, 'cliente')`,
      [duenoHash, clienteHash]
    );

    // Vincular el usuario cliente con su registro en clientes
    // (así puede ver sus turnos desde el panel de cliente).
    const [[clienteUser]] = await conn.query(
      "SELECT id FROM usuarios WHERE email = 'cliente@studiobelle.com'"
    );
    await conn.query(
      'UPDATE clientes SET usuario_id = ? WHERE email = ?',
      [clienteUser.id, 'laura@email.com']
    );

    console.log('✓ Usuarios de demo creados:');
    console.log('  admin@studiobelle.com  / Demo1234!  (dueño - acceso al panel)');
    console.log('  cliente@studiobelle.com / Demo1234!  (cliente - ve sus turnos)');

  } catch (err) {
    console.error('✗ Error en migración:', err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

migrate();
