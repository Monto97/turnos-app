import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './tests/global-setup.js',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    env: {
      DB_HOST: 'localhost',
      DB_PORT: '3306',
      DB_USER: 'turnos_user',
      DB_PASSWORD: 'turnos_pass_dev',
      DB_NAME: 'turnos_test',
      JWT_SECRET: 'test-secret-32chars-1234567890ab',
      CODIGO_DUENO: 'TEST-DUENO',
    },
  },
});
