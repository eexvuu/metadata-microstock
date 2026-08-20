/**
 * The local helper.
 *
 * This is NOT the app — the app is the signed-in page, in dev on :3000 or
 * wherever it is deployed. This process is a bridge that gives that page two
 * things a browser tab cannot have: any folder on any drive without a picker
 * prompt, and a real ffmpeg for the video containers mp4box cannot remux.
 *
 * The page CORS-fetches these routes directly. Chrome exempts http://localhost
 * from mixed-content blocking, so an https deployment can talk to it.
 *
 * No auth, and it takes an absolute path straight from the caller. That is
 * acceptable for a localhost tool the user starts themselves; it must never be
 * bound to a public interface.
 *
 * Run with: bun run local
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { serve } from '@hono/node-server'
import ffmpegPath from 'ffmpeg-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'

import { kindOf, SUPPORTED_EXTENSIONS, extname } from '../src/lib/engine/media'

const execFileAsync = promisify(execFile)
const PORT = Number(process.env.PORT ?? 4321)

const app = new Hono()

// The SPA is same-origin when served from dist/, but `bun run dev` runs Vite on
// :3000 and talks to this process on :4321.
app.use('/api/*', cors({ origin: (origin) => origin ?? '*' }))

function fail(message: string, status: 400 | 404 | 500 = 400) {
  return Response.json({ error: message }, { status })
}

/** Windows drive letters, so the browser has somewhere to start. */
async function listRoots(): Promise<string[]> {
  if (process.platform !== 'win32') return [os.homedir(), '/']
  const roots: string[] = []
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const root = `${letter}:\\`
    try {
      await fs.access(root)
      roots.push(root)
    } catch {
      // Drive letter not mounted.
    }
  }
  return roots
}

app.get('/api/fs/roots', async (c) => c.json({ roots: await listRoots(), home: os.homedir() }))

/** Directory listing for the folder browser: subfolders plus a media count. */
app.get('/api/fs/browse', async (c) => {
  const target = c.req.query('path')
  if (!target) return fail('path is required')

  try {
    const entries = await fs.readdir(target, { withFileTypes: true })
    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({ name: entry.name, path: path.join(target, entry.name) }))
    const mediaCount = entries.filter(
      (entry) => entry.isFile() && SUPPORTED_EXTENSIONS.includes(extname(entry.name)),
    ).length

    return c.json({
      path: path.resolve(target),
      parent: path.dirname(path.resolve(target)),
      directories,
      mediaCount,
    })
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 404)
  }
})

app.get('/api/fs/media', async (c) => {
  const target = c.req.query('path')
  if (!target) return fail('path is required')

  const names = await fs.readdir(target)
  const media = []
  for (const name of names) {
    const kind = kindOf(name)
    if (!kind) continue
    const stat = await fs.stat(path.join(target, name))
    if (!stat.isFile()) continue
    media.push({ name, size: stat.size, kind })
  }
  return c.json({ names, media: media.sort((a, b) => a.name.localeCompare(b.name)) })
})

/**
 * Remux a video without its audio track — `-an -c:v copy`, a stream copy, so
 * there is no re-encode. Gemma rejects any media carrying audio, and unlike the
 * browser's mp4box path this handles avi/mkv/webm/wmv too.
 */
async function stripAudio(filePath: string): Promise<string> {
  if (!ffmpegPath) throw new Error('ffmpeg-static did not resolve a binary')
  const temporary = path.join(
    os.tmpdir(),
    `gemma-noaudio-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,
  )
  await execFileAsync(ffmpegPath, [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    filePath,
    '-an',
    '-c:v',
    'copy',
    temporary,
  ])
  return temporary
}

/**
 * Raw bytes for one file. Videos come back already stripped of audio, which is
 * why local mode hands the engine a passthrough preprocessor.
 */
app.get('/api/fs/read', async (c) => {
  const folder = c.req.query('path')
  const name = c.req.query('name')
  if (!folder || !name) return fail('path and name are required')

  const filePath = path.join(folder, name)
  const isVideo = kindOf(name) === 'video'

  try {
    if (!isVideo) {
      const bytes = await fs.readFile(filePath)
      return new Response(new Uint8Array(bytes), {
        headers: { 'content-type': 'application/octet-stream' },
      })
    }

    const stripped = await stripAudio(filePath)
    try {
      const bytes = await fs.readFile(stripped)
      return new Response(new Uint8Array(bytes), {
        headers: {
          'content-type': 'application/octet-stream',
          // The browser needs to know what it is actually sending to Gemini.
          'x-media-type': 'video/mp4',
        },
      })
    } finally {
      await fs.unlink(stripped).catch(() => {})
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error), 500)
  }
})

app.post('/api/fs/write', async (c) => {
  const { path: folder, name, content } = await c.req.json<{
    path: string
    name: string
    content: string
  }>()
  if (!folder || !name) return fail('path and name are required')
  await fs.writeFile(path.join(folder, name), content, 'utf8')
  return c.json({ ok: true })
})

app.post('/api/fs/rename', async (c) => {
  const { path: folder, from, to } = await c.req.json<{
    path: string
    from: string
    to: string
  }>()
  if (!folder || !from || !to) return fail('path, from and to are required')
  await fs.rename(path.join(folder, from), path.join(folder, to))
  return c.json({ ok: true })
})

app.delete('/api/fs/file', async (c) => {
  const folder = c.req.query('path')
  const name = c.req.query('name')
  if (!folder || !name) return fail('path and name are required')
  await fs.unlink(path.join(folder, name)).catch(() => {})
  return c.json({ ok: true })
})

app.get('/api/fs/json', async (c) => {
  const folder = c.req.query('path')
  const name = c.req.query('name')
  if (!folder || !name) return fail('path and name are required')
  try {
    return c.json(JSON.parse(await fs.readFile(path.join(folder, name), 'utf8')))
  } catch {
    // Missing progress file is the normal case, not an error.
    return c.body(null, 204)
  }
})

/** Someone who opens the port in a browser should learn what it is. */
app.get('/', (c) =>
  c.text(
    [
      'metadata-microstock local helper.',
      '',
      'This is not the app. Open the app, sign in, choose "Local helper" as the',
      'folder source, and point it at this address.',
    ].join('\n'),
  ),
)

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`Local helper listening on http://localhost:${info.port}`)
  console.log('Open the app, sign in, and pick "Local helper" as the folder source.')
})
