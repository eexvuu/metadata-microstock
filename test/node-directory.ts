import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { kindOf, SUPPORTED_EXTENSIONS, extname } from '#/lib/engine/media'
import type { MediaEntry } from '#/lib/engine/types'
import type { FileSource } from '#/lib/sources/types'

/**
 * A folder on disk, for the end-to-end script only.
 *
 * Lives under `test/` rather than `src/lib/sources/` on purpose: `node:fs` has
 * no business inside the app, whose sources are the browser's directory handle
 * and a list of dropped files. This one exists so a prompt or parser change can
 * be tried against real media from one terminal.
 */
export class NodeDirectorySource implements FileSource {
  readonly writable = true

  constructor(private directory: string) {}

  get folderName(): string {
    return basename(this.directory)
  }

  async listAllNames(): Promise<string[]> {
    return readdir(this.directory)
  }

  async listMedia(): Promise<MediaEntry[]> {
    const names = await this.listAllNames()
    const entries: MediaEntry[] = []

    for (const name of names.sort()) {
      if (!SUPPORTED_EXTENSIONS.includes(extname(name))) continue
      const kind = kindOf(name)
      if (!kind) continue
      const bytes = await readFile(join(this.directory, name))
      entries.push({ name, ref: name, size: bytes.byteLength, kind })
    }

    return entries
  }

  async readBytes(entry: MediaEntry): Promise<Uint8Array> {
    return new Uint8Array(await readFile(join(this.directory, entry.name)))
  }

  async writeText(name: string, text: string): Promise<void> {
    await writeFile(join(this.directory, name), text, 'utf8')
  }

  async rename(entry: MediaEntry, newName: string): Promise<void> {
    await rename(join(this.directory, entry.name), join(this.directory, newName))
  }

  async readJson<T>(name: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(join(this.directory, name), 'utf8')) as T
    } catch {
      return null
    }
  }

  async writeJson(name: string, data: unknown): Promise<void> {
    await this.writeText(name, JSON.stringify(data, null, 2))
  }

  async remove(name: string): Promise<void> {
    await rm(join(this.directory, name), { force: true })
  }
}
