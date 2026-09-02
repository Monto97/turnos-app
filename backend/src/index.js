import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import routes from './routes/index.js';
import authRoutes from './routes/auth.routes.js';
import publicoRoutes from './routes/publico.routes.js';
import { verificarConexion } from './config/db.js';

dotenv.config();

const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));

// CORS: en desarrollo permite el servidor de Angular. En producción el
// frontend está en el mismo origen (Express lo sirve), así que CORS
// no aplica para el browser pero lo dejamos configurado igual.
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4200').split(',');
app.use(cors({ origin: allowedOrigins, credentials: true }));

app.use(express.json());

// Ruta de salud para health checks (Railway y docker-compose).
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/publico', publicoRoutes);
app.use('/api', routes);

// Servir el frontend Angular compilado en producción.
// En desarrollo no existe esta carpeta; las requests llegan al backend vía proxy.
const staticPath = process.env.STATIC_PATH || join(__dirname, '../../public');
if (existsSync(staticPath)) {
  app.use(express.static(staticPath));
  // SPA fallback: cualquier ruta no-API devuelve index.html
  // para que Angular Router maneje la navegación client-side.
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/health')) {
      return res.sendFile(join(staticPath, 'index.html'));
    }
    next();
  });
}

// Manejador de errores centralizado.
app.use((err, req, res, next) => {
  const esValidacion = /no encontrado|inactivo|no está disponible|inválido|Faltan/i.test(err.message);
  const status = esValidacion ? 400 : 500;
  if (status === 500) console.error('Error:', err.message);
  res.status(status).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;

async function iniciar() {
  await verificarConexion();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ API escuchando en http://0.0.0.0:${PORT}`);
  });
}

iniciar().catch((err) => {
  console.error('No se pudo iniciar la app:', err.message);
  process.exit(1);
});
