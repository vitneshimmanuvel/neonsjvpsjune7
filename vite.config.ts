import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-ignore
import handler from './api/index.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'api-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api')) {
            try {
              await handler(req, res);
            } catch (err) {
              console.error('API Error in dev server:', err);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: (err as any).message }));
            }
          } else {
            next();
          }
        });
      }
    }
  ],
})
