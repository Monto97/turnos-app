import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Usamos un POOL de conexiones en vez de una conexión única.
// El pool reutiliza conexiones y maneja concurrencia: si llegan
// varias requests a la vez, cada una toma una conexión libre.
// Es la práctica estándar para APIs.
export const pool = mysql.createPool({
  // Soporta variables propias (DB_*) y las del plugin MySQL de Railway (MYSQL*).
  host:     process.env.DB_HOST     || process.env.MYSQLHOST     || 'localhost',
  port:     Number(process.env.DB_PORT     || process.env.MYSQLPORT)     || 3306,
  user:     process.env.DB_USER     || process.env.MYSQLUSER     || 'turnos_user',
  password: process.env.DB_PASSWORD || process.env.MYSQLPASSWORD || 'turnos_pass_dev',
  database: process.env.DB_NAME     || process.env.MYSQLDATABASE || 'turnos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Devuelve fechas como strings 'YYYY-MM-DD HH:mm:ss' en vez de
  // objetos Date de JS. Nos simplifica el manejo de horarios y
  // evita sorpresas por zona horaria en desarrollo.
  dateStrings: true,
});

// Pequeño helper para verificar la conexión al arrancar.
export async function verificarConexion() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('✓ Conexión a MySQL OK');
  } catch (err) {
    console.error('✗ Error conectando a MySQL:', err.message);
    throw err;
  }
}
