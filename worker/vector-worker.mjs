#!/usr/bin/env node
/**
 * The other half of the vectorizer tool.
 *
 * Stockflow holds the queue, the tokens and the bucket. It does NOT vectorize
 * anything: the web backend is a real Chromium signed in to vectorizer.ai plus
 * a CAPTCHA solver, and none of that fits in a 768 MB unit sharing two cores
 * with MySQL and a dozen vhosts. So this script runs on the machine that
 * already has the `vectorizer` repo working, and pulls work down instead.
 *
 * It is deliberately thin. Every decision about HOW to vectorize — the login
 * chain, the rate limiting, the CAPTCHA, the 4000 px output options — stays in
 * `vectorize.js`, which this only shells out to. If tracing changes, nothing
 * here does.
 *
 * Copy this file into the vectorizer repo (or point --repo at it) and run:
 *
 *   STOCKFLOW_URL=https://tools.example.com \
 *   STOCKFLOW_WORKER_SECRET=… \
 *   node vector-worker.mjs --repo D:/microstock/vector/vectorizer
 *
 * Flags: --repo DIR  --name NAME  --poll SECONDS  --once
 */

import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'

const args = process.argv.slice(2)
const opt = (flag, fallback) => {
  const at = args.indexOf(flag)
  return at === -1 ? fallback : args[at + 1]
}

const BASE = (process.env.STOCKFLOW_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const SECRET = process.env.STOCKFLOW_WORKER_SECRET ?? ''
const REPO = path.resolve(opt('--repo', process.cwd()))
const NAME = opt('--name', `${os.hostname()}/${process.pid}`)
const POLL_MS = Number(opt('--poll', '15')) * 1000
const ONCE = args.includes('--once')

if (!SECRET) {
  console.error('STOCKFLOW_WORKER_SECRET is not set. It has to match VECTOR_WORKER_SECRET on the server.')
  process.exit(1)
}

const api = (route, body) =>
  fetch(`${BASE}/api/v1/vector/${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${SECRET}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const ts = () => new Date().toISOString().slice(11, 19)
const log = (...parts) => console.log(ts(), ...parts)

/**
 * `vectorize.js` names its outputs after the input's basename, so the input is
 * named after the file ID rather than the contributor's filename. Two people
 * uploading `flower.png` in the same hour would otherwise collide in
 * `output/`, and the second would silently be skipped as already done.
 */
function extensionFor(filename) {
  const ext = path.extname(filename).toLowerCase()
  return /^\.(png|jpe?g|gif|bmp|webp)$/.test(ext) ? ext : '.png'
}

async function download(url, destination) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`download failed: ${response.status}`)
  await fs.writeFile(destination, Readable.fromWeb(response.body))
}

async function upload(url, source, contentType) {
  const { size } = await fs.stat(source)

  const response = await fetch(url, {
    method: 'PUT',
    // Streamed rather than read into memory: a 4000 px EPS is routinely tens of
    // megabytes, and this process may be running next to a headless Chromium.
    body: Readable.toWeb(createReadStream(source)),
    duplex: 'half',
    headers: { 'Content-Type': contentType, 'Content-Length': String(size) },
  })

  if (!response.ok) throw new Error(`upload failed: ${response.status}`)
}

/**
 * One image through the real tool.
 *
 * `--no-move` keeps the original where we put it so cleanup is ours to do, and
 * `--no-skip` stops a leftover `output/` from a previous attempt being mistaken
 * for a finished one. The exit code is read but not trusted alone: what
 * actually decides is whether the files exist.
 */
function vectorize(inputPath) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['vectorize.js', '--no-move', '--no-skip', '--limit', '1', inputPath],
      { cwd: REPO, stdio: ['ignore', 'inherit', 'inherit'] },
    )

    child.on('error', (error) => resolve({ code: 1, error: error.message }))
    child.on('close', (code) => resolve({ code, error: null }))
  })
}

async function handle(job) {
  const base = job.fileId
  const input = path.join(REPO, 'input', `${base}${extensionFor(job.filename)}`)
  const outputDir = path.join(REPO, 'output')

  await fs.mkdir(path.dirname(input), { recursive: true })

  const cleanup = async () => {
    for (const file of [input, path.join(outputDir, `${base}.svg`), path.join(outputDir, `${base}.eps`)]) {
      await fs.rm(file, { force: true })
    }
  }

  try {
    log(`claim ${job.filename} (attempt ${job.attempt})`)
    await download(job.source, input)

    const run = await vectorize(input)

    const produced = {}
    for (const format of ['svg', 'eps']) {
      const candidate = path.join(outputDir, `${base}.${format}`)
      const stat = await fs.stat(candidate).catch(() => null)
      if (stat?.size > 0) produced[format] = candidate
    }

    if (!produced.svg && !produced.eps) {
      // Nothing came back. Retryable by default — a rate limit, a dead session
      // and an unsolvable CAPTCHA all look like this, and all of them are worth
      // another go later. The server decides when to stop trying and refund.
      await api('fail', {
        fileId: job.fileId,
        reason: run.error ?? `vectorize.js exited ${run.code} with no output`,
        retryable: true,
      })
      log(`fail ${job.filename}`)
      return
    }

    if (produced.svg) await upload(job.upload.svg, produced.svg, 'image/svg+xml')
    if (produced.eps) await upload(job.upload.eps, produced.eps, 'application/postscript')

    await api('complete', {
      fileId: job.fileId,
      formats: { svg: Boolean(produced.svg), eps: Boolean(produced.eps) },
    })

    log(`done ${job.filename} (${Object.keys(produced).join(', ')})`)
  } catch (error) {
    // A failure between "vectorizer.ai charged the credit" and "the bytes are
    // in the bucket" is reported as retryable: re-running costs another credit,
    // but a token silently kept for a file nobody can download is worse.
    await api('fail', {
      fileId: job.fileId,
      reason: error instanceof Error ? error.message : String(error),
      retryable: true,
    }).catch(() => {})
    log(`error ${job.filename}: ${error instanceof Error ? error.message : error}`)
  } finally {
    await cleanup()
  }
}

async function main() {
  const health = await api('health')
  if (!health.ok) {
    console.error(`Cannot reach ${BASE}: ${health.status} ${await health.text()}`)
    process.exit(1)
  }

  log(`worker ${NAME} -> ${BASE}, repo ${REPO}`)

  for (;;) {
    const response = await api('claim', { worker: NAME })

    if (response.status === 204) {
      if (ONCE) return
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      continue
    }

    if (!response.ok) {
      console.error(`claim failed: ${response.status} ${await response.text()}`)
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
      continue
    }

    await handle(await response.json())

    if (ONCE) return
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
