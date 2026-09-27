import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {execSync} from 'child_process';
import {defineConfig, type Plugin} from 'vite';

/**
 * The commit this bundle was built from: Vercel's system variable on Vercel,
 * git locally. Not secret; it lets a device report, and anyone reading the
 * page source, confirm which build is actually being served.
 */
function buildCommit(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try { return execSync('git rev-parse --short=7 HEAD', {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim(); }
  catch { return 'unknown'; }
}

const BUILD_COMMIT = buildCommit();

const buildMeta = (): Plugin => ({
  name: 'tp-build-meta',
  transformIndexHtml: () => [{tag: 'meta', attrs: {name: 'tp-build', content: BUILD_COMMIT}, injectTo: 'head'}],
});

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), buildMeta()],
    define: {
      __BUILD_COMMIT__: JSON.stringify(BUILD_COMMIT),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
