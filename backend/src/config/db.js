import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Devuelve TIMESTAMP como strings 'YYYY-MM-DD HH:mm:ss' en vez de Date objects.
// Mantiene el mismo comportamiento que mysql2 con dateStrings: true.
pg.types.setTypeParser(1114, val => val); // TIMESTAMP WITHOUT TIME ZONE
pg.types.setTypeParser(1184, val => val); // TIMESTAMP WITH TIME ZONE

// Limpiar parámetros que pg no soporta (channel_binding viene en algunas URLs de Neon)
const dbUrl = (process.env.DATABASE_URL || '').replace(/[&?]channel_binding=[^&]*/g, '');

export const pool = new Pool({
  connectionString: dbUrl,
  // Siempre SSL cuando hay DATABASE_URL (Neon lo requiere en local y en prod)
  ssl: dbUrl ? { rejectUnauthorized: false } : false,
  max: 5,
});

export async function verificarConexion() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✓ Conexión a PostgreSQL OK');
  } catch (err) {
    console.error('✗ Error conectando a PostgreSQL:', err.message || err);
    throw err;
  }
}
