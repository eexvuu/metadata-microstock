import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * One target now: Node on a VPS, behind nginx.
 *
 * The free/paid split went away with the Worker. It existed because the
 * Cloudflare Free plan gives an invocation 10 ms of CPU, which server-side
 * React does not fit into — so "free" compiled to an SPA and "paid" compiled
 * to SSR. A box with two cores and no per-request budget has no such fork, so
 * this always builds SSR.
 *
 * `@cloudflare/vite-plugin` is gone with it. What used to be its `env` is now
 * `src/lib/runtime/env.ts` reading `process.env`, and what used to be the D1
 * binding is `src/db/client.ts` over libsql.
 */
export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [devtools(), tailwindcss(), tanstackStart(), viteReact()],
  /**
   * Bundle the server's dependencies instead of leaving them for Node to
   * resolve. Vite externalises them by default, and Better Auth's package
   * exports do not survive that under plain Node ESM — the process dies at
   * startup on an import Vite would have resolved perfectly well.
   *
   * It also makes the artifact honest: dist/ is the app, rather than the app
   * plus whatever `npm install` happened to produce on the server that night.
   *
   * libsql stays out because it ships a native binary per platform, which has
   * to be installed on the target rather than bundled from a Windows laptop.
   */
  ssr: {
    noExternal: true,
    external: ['@libsql/client'],
  },
  build: {
    // The 3 MiB gzipped Worker limit does not apply here; nothing is uploaded.
    // Left generous so pdf.js and mp4box stop producing warnings that mean
    // nothing on this target.
    chunkSizeWarningLimit: 2000,
  },
})
