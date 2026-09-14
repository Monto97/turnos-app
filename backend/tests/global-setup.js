import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ROOT = { host: 'localhost', port: 3306, user: 'root', password: 'root_password_dev' };
const APP  = { host: 'localhost', port: 3306, user: 'turnos_user', password: 'turnos_pass_dev' };

export async function setup() {
  // Crear la base de test y darle permisos al usuario de la app.
  const root = await mysql.createConnection(ROOT);
  await root.query('CREATE DATABASE IF NOT EXISTS turnos_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await root.query("GRANT ALL PRIVILEGES ON `turnos_test`.* TO 'turnos_user'@'%'");
  await root.query('FLUSH PRIVILEGES');
  await root.end();

  // Correr el schema sobre la base de test (multipleStatements para ejecutarlo de una).
  const conn = await mysql.createConnection({ ...APP, database: 'turnos_test', multipleStatements: true });
  const raw = readFileSync(join(__dirname, '../schema.sql'), 'utf8');
  const schema = raw.replace(/^\s*USE\s+\w+\s*;?\s*$/gm, '');
  await conn.query(schema);
  await conn.end();
}

export async function teardown() {
  const root = await mysql.createConnection(ROOT);
  await root.query('DROP DATABASE IF EXISTS turnos_test');
  await root.end();
}
