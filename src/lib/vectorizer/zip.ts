/**
 * A zip writer small enough to keep: stored entries, no compression, no
 * dependency.
 *
 * The batch screen needs one file out of many, in every browser. Compression is
 * the part a library would buy, and it is the part that is worth nothing here —
 * two of the three files per image are JPEG or PNG, which are already deflated,
 * and paying for a deflate implementation to shave a few percent off the SVG is
 * a bad trade. Stored entries make the whole format arithmetic: a header, the
 * bytes, and a table at the end saying where each one started.
 *
 * The bytes never enter the JS heap. `ZipEntry.body` is a `Blob` — usually one
 * straight from `fetch`, which the browser keeps in its own blob storage and
 * pages to disk when it is large — and `new Blob([...])` references its parts
 * rather than copying them. So a two-hundred-file archive costs headers, not
 * gigabytes. The one thing that does need the real bytes is the CRC, and the
 * caller does that one file at a time.
 */

/** Reflected CRC-32 (poly 0xEDB88320), the one every zip reader expects. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  /** Forward slashes only — a backslash is a literal character in a zip name. */
  name: string
  crc: number
  size: number
  body: Blob
}

/**
 * Offsets and counts in the classic format are 32-bit and 16-bit. Past either
 * limit the archive needs zip64, and writing one anyway produces a file that
 * opens and is quietly missing entries — so refuse instead. A tab would run out
 * of blob storage long before a real batch reached 4 GiB.
 */
const MAX_OFFSET = 0xffffffff
const MAX_ENTRIES = 0xffff

export function zipBlob(entries: ZipEntry[]): Blob {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`A zip holds ${MAX_ENTRIES} files; this batch has ${entries.length}.`)
  }

  const encoder = new TextEncoder()
  const stamp = dosStamp(new Date())

  const parts: BlobPart[] = []
  const central: BlobPart[] = []
  let centralSize = 0
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)

    if (offset + 30 + name.length + entry.size > MAX_OFFSET) {
      throw new Error('This batch is larger than 4 GB — save it in two halves.')
    }

    const header = new Uint8Array(30 + name.length)
    const view = new DataView(header.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true) // version needed: 2.0
    view.setUint16(6, 0x0800, true) // bit 11: names are UTF-8
    view.setUint16(8, 0, true) // stored
    view.setUint16(10, stamp.time, true)
    view.setUint16(12, stamp.date, true)
    view.setUint32(14, entry.crc, true)
    view.setUint32(18, entry.size, true)
    view.setUint32(22, entry.size, true)
    view.setUint16(26, name.length, true)
    view.setUint16(28, 0, true) // no extra field
    header.set(name, 30)

    const record = new Uint8Array(46 + name.length)
    const cd = new DataView(record.buffer)
    cd.setUint32(0, 0x02014b50, true)
    cd.setUint16(4, 20, true) // made by 2.0, MS-DOS
    cd.setUint16(6, 20, true)
    cd.setUint16(8, 0x0800, true)
    cd.setUint16(10, 0, true)
    cd.setUint16(12, stamp.time, true)
    cd.setUint16(14, stamp.date, true)
    cd.setUint32(16, entry.crc, true)
    cd.setUint32(20, entry.size, true)
    cd.setUint32(24, entry.size, true)
    cd.setUint16(28, name.length, true)
    // extra, comment, disk, internal attrs and external attrs are all zero,
    // which is what a reader treats as "an ordinary file with no permissions".
    cd.setUint32(42, offset, true)
    record.set(name, 46)

    parts.push(header, entry.body)
    central.push(record)
    centralSize += record.length
    offset += header.length + entry.size
  }

  const centralOffset = offset

  const end = new Uint8Array(22)
  const eocd = new DataView(end.buffer)
  eocd.setUint32(0, 0x06054b50, true)
  eocd.setUint16(8, entries.length, true)
  eocd.setUint16(10, entries.length, true)
  eocd.setUint32(12, centralSize, true)
  eocd.setUint32(16, centralOffset, true)

  parts.push(...central, end)

  return new Blob(parts, { type: 'application/zip' })
}

/** MS-DOS packed time and date, which is what the format stores. */
function dosStamp(when: Date): { time: number; date: number } {
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
    date: ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  }
}
