import { app } from './app.js';
import { verificarConexion } from './config/db.js';

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
