import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({build:{rollupOptions:{input:{landing:resolve(import.meta.dirname,'index.html'),marketplace:resolve(import.meta.dirname,'app.html'),create:resolve(import.meta.dirname,'create.html'),rentals:resolve(import.meta.dirname,'rentals.html'),dashboard:resolve(import.meta.dirname,'dashboard.html')}}}});
