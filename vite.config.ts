import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Set base to your GitHub Pages repo name, e.g. '/world-cup-gtj/'
// Use '/' if deploying to a custom domain or username.github.io root.
export default defineConfig({
  plugins: [react()],
  base: '/world-cup-gtj/'
});