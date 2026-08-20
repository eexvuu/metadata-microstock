import { DurableObject } from 'cloudflare:workers'

/**
 * One instance per organization — realtime fan-out for a single tenant.
 *
 * Why a Durable Object and not a Worker: Workers are stateless and each
 * request may land in a different isolate, so there is no shared place to
 * hold "who is currently connected". A DO is the one Cloudflare primitive
 * with a stable identity, so every member of an org routes to the same
 * instance and a broadcast actually reaches everyone.
 *
 * Uses the SQLite backend, which is what the Workers Free plan supports (the
 * key-value backend is paid-only) — see `new_sqlite_classes` in wrangler.jsonc.
 *
 * This is a working example, deliberately minimal. Extend it, or delete it if
 * your product has no realtime surface.
 */
export class OrgRoom extends DurableObject<Env> {
  private sessions = new Set<WebSocket>()

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 426 })
    }

    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)

    server.accept()
    this.sessions.add(server)

    server.addEventListener('close', () => this.sessions.delete(server))
    server.addEventListener('error', () => this.sessions.delete(server))

    return new Response(null, { status: 101, webSocket: client })
  }

  /** Callable over RPC from the Worker: env.ORG_ROOM.get(id).broadcast(...) */
  broadcast(payload: unknown): number {
    const message = JSON.stringify(payload)

    for (const socket of this.sessions) {
      try {
        socket.send(message)
      } catch {
        this.sessions.delete(socket)
      }
    }

    return this.sessions.size
  }
}
