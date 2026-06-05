import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
// @ts-ignore
import handler from './api/index.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env sources without VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  // Assign to process.env so they are available in backend API handlers
  process.env = { ...process.env, ...env };

  return {
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
  };
})
