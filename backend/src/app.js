import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes/index.js';
import authRoutes from './routes/auth.routes.js';
import publicoRoutes from './routes/publico.routes.js';

dotenv.config();

export const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:4200').split(',');
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

// Permite que el sitio de la pelu embeba esta app en un <iframe>.
// FRAME_ANCESTORS: lista de orígenes separados por espacio.
const frameAncestors = process.env.FRAME_ANCESTORS || 'http://localhost:3000 http://localhost:4200';
app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${frameAncestors}`);
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/publico', publicoRoutes);
app.use('/api', routes);

app.use((err, _req, res, _next) => {
  const esServidor = !!err.code || !(err instanceof Error);
  const status = esServidor ? 500 : 400;
  if (status === 500) console.error('Error:', err.message || err);
  res.status(status).json({ error: err.message || 'Error interno del servidor' });
});
