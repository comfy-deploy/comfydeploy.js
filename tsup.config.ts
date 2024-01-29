// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'], // Generates ESM output
  outDir: 'dist',
  splitting: false, // Adjust based on your needs
});

