import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

/**
 * Tier is a BUILD-TIME switch, not a runtime one: `spa.enabled` changes what
 * gets compiled, so "free" and "paid" are two different builds.
 *
 *   free -> SPA. The Worker only serves static assets + JSON. React never
 *           renders on the server, so requests stay far under the Workers
 *           Free plan's 10ms CPU-per-invocation limit.
 *   paid -> SSR. React renders on the server. Needs Workers Paid ($5/mo),
 *           which raises the CPU limit to 30s.
 *
 * Vite's `--mode` is used instead of an env-var prefix so the scripts work
 * identically in PowerShell, cmd and POSIX shells.
 */
export default defineConfig(({ mode }) => {
  const tier = mode === 'paid' ? 'paid' : 'free'

  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      devtools(),
      cloudflare({ viteEnvironment: { name: 'ssr' } }),
      tailwindcss(),
      tanstackStart({
        spa: { enabled: tier === 'free' },
      }),
      viteReact(),
    ],
  }
})
