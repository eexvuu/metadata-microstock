import { serve } from '@hono/node-server'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { api } from '#/api/index'
import { runNightly } from '#/cron'

/**
 * The single entry point, on one box.
 *
 * The routing is the same split it always was — `/api/*` to Hono for anything
 * with an external caller, everything else to TanStack Start. What changed is
 * what surrounds it: there is no queue consumer and no `scheduled()`, because
 * a Worker's runtime handed you those and a Linux box does not. Background
 * work runs detached (`src/lib/runtime/jobs.ts`) and the nightly job is the
 * `--cron` branch below, fired by `stockflow-cron.timer`.
 */
const entry = createServerEntry({
  fetch(request) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      return api.fetch(request)
    }

    return handler.fetch(request)
  },
})

/**
 * The nightly job rides in this bundle behind a flag rather than being a
 * second build to keep in step with the schema. One artifact to ship, and
 * systemd's timer is what makes it a schedule.
 */
if (process.argv.includes('--cron')) {
  runNightly().then(
    () => process.exit(0),
    (error) => {
      console.error('[cron] failed', error)
      process.exit(1)
    },
  )
} else {
  const port = Number(process.env.PORT ?? 3000)

  /**
   * Loopback, never 0.0.0.0: nginx terminates TLS and proxies to it, and the
   * box already has a dozen other things listening. A process that does not
   * need to be reachable from the internet should not be.
   *
   * Wrapped rather than passed through, because node-server calls its handler
   * with (request, nodeBindings) and Start's second parameter is its own
   * options object — handing one to the other typechecks as nonsense.
   */
  serve(
    { fetch: (request: Request) => entry.fetch(request), port, hostname: '127.0.0.1' },
    (info) => {
      console.log(`[stockflow] listening on http://127.0.0.1:${info.port}`)
    },
  )
}

export default entry
