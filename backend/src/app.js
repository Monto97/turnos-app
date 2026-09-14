import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import routes from './routes/index.js';
import authRoutes from './routes/auth.routes.js';
import publicoRoutes from './routes/publico.routes.js';

dotenv.config();

export const app = express();
const __dirname = dirname(fileURLToPath(import.meta.url));

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4200').split(',');
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Permite que el sitio externo (Next.js) embeba esta app en un <iframe>.
// FRAME_ANCESTORS acepta una lista separada por espacios de orígenes permitidos.
// Ejemplo prod: FRAME_ANCESTORS=https://studiobyjú.vercel.app
const frameAncestors = process.env.FRAME_ANCESTORS || 'http://localhost:3000 http://localhost:4200';
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${frameAncestors}`);
  next();
});

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/publico', publicoRoutes);
app.use('/api', routes);

const staticPath = process.env.STATIC_PATH || join(__dirname, '../../public');
if (existsSync(staticPath)) {
  app.use(express.static(staticPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/health')) {
      return res.sendFile(join(staticPath, 'index.html'));
    }
    next();
  });
}

app.use((err, req, res, _next) => {
  // Errores con .code son errores de infraestructura (MySQL, Node).
  // Errores sin .code son throws de validación de nuestros handlers → 400.
  const esServidor = !!err.code || !(err instanceof Error);
  const status = esServidor ? 500 : 400;
  if (status === 500) console.error('Error:', err.message || err);
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
});
