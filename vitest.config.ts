import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.{test,spec}.ts'],
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
    environment: 'node',
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['json-summary', 'text'],
      reportsDirectory: 'artifacts/coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/lib/errors.ts',
        'src/**/*.{d,types}.ts',
        'src/**/types.ts',
        'src/**/index.ts',
        'src/setup.ts',
        'vitest.config.ts'
      ]
    },
  },
});
