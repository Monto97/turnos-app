import { app } from './app.js';

const PORT = process.env.PORT || 3000;

// En local levanta el servidor normalmente.
// En Vercel, la función serverless importa este módulo y usa el export default.
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✓ API escuchando en http://0.0.0.0:${PORT}`);
  });
}

export default app;
