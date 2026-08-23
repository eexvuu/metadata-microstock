import { createServerFn } from '@tanstack/react-start'

import { readSession } from '#/lib/server/session'

/**
 * "Is anyone signed in?" — for the two routes that only make sense signed out.
 *
 * It lives in its own file rather than next to `requireSession`, and that is
 * not tidiness. `/login` is a client route, so importing anything from
 * `session.ts` directly drags that module into the browser bundle, and the
 * import-protection plugin refuses it: `session.ts` reads request headers.
 * Here, stripping this handler's body leaves the `session.ts` import
 * unreferenced and the whole module falls out of the client graph.
 *
 * It answers rather than redirecting, because `beforeLoad` also runs in the
 * browser on a client-side navigation — the router is what knows how to get
 * anywhere from there. The server states the fact; the route decides.
 */
export const hasSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<boolean> => Boolean(await readSession()),
)
