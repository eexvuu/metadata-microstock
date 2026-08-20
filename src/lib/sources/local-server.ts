import { kindOf } from '#/lib/engine/media'
import type { MediaEntry } from '#/lib/engine/types'
import type { FileSource } from './types'

/**
 * Local target's FileSource: the same engine, but the folder lives on disk and
 * is reached through the companion Node server (`bun run local`). This is what
 * buys back what the browser cannot do — browsing D:\ without a picker, real
 * renames, and ffmpeg for the video containers mp4box cannot touch.
 *
 * Videos arrive with their audio already stripped by the server, so local mode
 * pairs this with `passthroughPreprocessor`.
 */

export interface BrowseResult {
  path: string
  parent: string
  directories: { name: string; path: string }[]
  mediaCount: number
}

export class LocalServerClient {
  constructor(readonly baseUrl: string) {}

  private url(route: string, params: Record<string, string> = {}): string {
    const url = new URL(`/api/fs/${route}`, this.baseUrl)
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
    return url.toString()
  }

  async roots(): Promise<{ roots: string[]; home: string }> {
    return (await this.get('roots')) as { roots: string[]; home: string }
  }

  async browse(path: string): Promise<BrowseResult> {
    return (await this.get('browse', { path })) as BrowseResult
  }

  private async get(route: string, params?: Record<string, string>): Promise<unknown> {
    const response = await fetch(this.url(route, params))
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `${response.status} on /api/fs/${route}`)
    }
    return response.json()
  }

  fileUrl(folder: string, name: string): string {
    return this.url('read', { path: folder, name })
  }

  async media(path: string): Promise<{ names: string[]; media: Omit<MediaEntry, 'ref'>[] }> {
    return (await this.get('media', { path })) as {
      names: string[]
      media: Omit<MediaEntry, 'ref'>[]
    }
  }

  async post(route: string, body: unknown): Promise<void> {
    const response = await fetch(this.url(route), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`${response.status} on /api/fs/${route}`)
  }
}

export class LocalServerSource implements FileSource {
  private cache: { names: string[]; media: MediaEntry[] } | null = null

  constructor(
    private client: LocalServerClient,
    private folderPath: string,
  ) {}

  get folderName(): string {
    return this.folderPath.split(/[\\/]/).filter(Boolean).pop() ?? this.folderPath
  }

  private async index() {
    if (this.cache) return this.cache
    const { names, media } = await this.client.media(this.folderPath)
    this.cache = {
      names,
      media: media
        .filter((entry) => kindOf(entry.name))
        .map((entry) => ({ ...entry, ref: entry.name })),
    }
    return this.cache
  }

  async listMedia(): Promise<MediaEntry[]> {
    return (await this.index()).media
  }

  async listAllNames(): Promise<string[]> {
    return (await this.index()).names
  }

  async readBytes(entry: MediaEntry): Promise<Uint8Array> {
    const response = await fetch(this.client.fileUrl(this.folderPath, entry.name))
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `${response.status} reading ${entry.name}`)
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  async writeText(name: string, text: string): Promise<void> {
    await this.client.post('write', { path: this.folderPath, name, content: text })
  }

  async rename(entry: MediaEntry, newName: string): Promise<void> {
    await this.client.post('rename', { path: this.folderPath, from: entry.name, to: newName })
    this.cache = null
  }

  async readJson<T>(name: string): Promise<T | null> {
    const url = new URL('/api/fs/json', this.client.baseUrl)
    url.searchParams.set('path', this.folderPath)
    url.searchParams.set('name', name)
    const response = await fetch(url)
    if (response.status === 204 || !response.ok) return null
    return (await response.json()) as T
  }

  async writeJson(name: string, data: unknown): Promise<void> {
    await this.writeText(name, JSON.stringify(data, null, 2))
  }

  async remove(name: string): Promise<void> {
    const url = new URL('/api/fs/file', this.client.baseUrl)
    url.searchParams.set('path', this.folderPath)
    url.searchParams.set('name', name)
    await fetch(url, { method: 'DELETE' })
  }
}
