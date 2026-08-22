import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

import { migrate } from 'drizzle-orm/libsql/migrator'

import { api } from '#/api/index'
import { runNightly } from '#/cron'
import { getDb } from '#/db/index'

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
/**
 * Migrations run from this bundle too, for the same reason: the server has no
 * build toolchain and drizzle-kit is a dev dependency, so `npx drizzle-kit` on
 * the box would have to install one. `drizzle/` is rsynced next to `dist/`.
 *
 * Still forward-only, still no rollback. `deploy/deploy.sh` copies the
 * database aside first, and that copy is the rollback.
 */
if (process.argv.includes('--migrate')) {
  migrate(getDb(), { migrationsFolder: 'drizzle' }).then(
    () => {
      console.log('[migrate] applied')
      process.exit(0)
    },
    (error) => {
      console.error('[migrate] failed', error)
      process.exit(1)
    },
  )
} else if (process.argv.includes('--cron')) {
  runNightly().then(
    () => process.exit(0),
    (error) => {
      console.error('[cron] failed', error)
      process.exit(1)
    },
  )
} else if (import.meta.env.PROD) {
  /**
   * Only the built bundle listens. Under `vite dev` this module is imported
   * for its handler while Vite owns the port — calling serve() there took 3000
   * out from under the dev server and pushed it to 3001, where every request
   * 500s because nothing is behind it.
   */
  /**
   * Somebody has to hand out `dist/client`, and on this runtime it is us.
   *
   * On Cloudflare the assets binding served the build output and the Worker
   * never saw those requests; there is no such thing here, so the page came
   * back correct and completely unstyled — every /assets/* a 404. Static first,
   * app second, and `serveStatic` falls through when there is no such file so
   * a real route is never shadowed by a missing one.
   */
  const files = new Hono()
  files.use('*', serveStatic({ root: './dist/client' }))

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
  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url)

    // /api/* belongs to Hono and never to a file, so it skips the disk.
    if (!url.pathname.startsWith('/api/')) {
      const hit = await files.fetch(request)
      if (hit.status !== 404) return hit
    }

    return entry.fetch(request)
  }

  serve(
    { fetch: handle, port, hostname: '127.0.0.1' },
    (info) => {
      console.log(`[stockflow] listening on http://127.0.0.1:${info.port}`)
    },
  )
}

export default entry
