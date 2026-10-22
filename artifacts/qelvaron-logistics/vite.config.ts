import path from 'path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const staticExportPages: Plugin = {
  name: 'qelvaron-static-export-pages',
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      const [pathname, query] = (request.url ?? '/').split('?', 2);
      const page =
        /^\/(about|services|contact|how-it-works|blog|career|tracking|privacy-policy|terms-and-conditions)\/?$/.exec(
          pathname,
        )?.[1];

      if (page) {
        request.url = `/${page}/index.html${query ? `?${query}` : ''}`;
      }
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((request, _response, next) => {
      const [pathname, query] = (request.url ?? '/').split('?', 2);
      const page =
        /^\/(about|services|contact|how-it-works|blog|career|tracking|privacy-policy|terms-and-conditions)\/?$/.exec(
          pathname,
        )?.[1];

      if (page) {
        request.url = `/${page}/index.html${query ? `?${query}` : ''}`;
      }
      next();
    });
  },
};

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    'PORT environment variable is required but was not provided.',
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    'BASE_PATH environment variable is required but was not provided.',
  );
}

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: basePath,
  plugins: [
    staticExportPages,
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        public: path.resolve(projectRoot, 'index.html'),
        admin: path.resolve(projectRoot, 'admin/index.html'),
        tracking: path.resolve(projectRoot, 'tracking/index.html'),
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
