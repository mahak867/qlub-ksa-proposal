import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    fileParallelism: false,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://qlub:qlub@localhost:5432/qlubpay_test' },
    testTimeout: 20000,
  },
});
