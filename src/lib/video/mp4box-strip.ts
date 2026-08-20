import { extname } from '#/lib/engine/media'
import type { StripResult, VideoPreprocessor } from './types'

/**
 * Browser equivalent of the CLI's `ffmpeg -an -c:v copy`: parse the MP4, copy
 * every video sample into a fresh file and never mention the audio track. It is
 * a stream copy, so there is no re-encode — a 10 MB 4K clip takes well under a
 * second.
 *
 * MP4/MOV only. Everything else (avi, mkv, webm, wmv, flv) has no ISOBMFF
 * structure to walk, and those files have to go through local mode, where the
 * real ffmpeg is available.
 */

const MP4BOX_CONTAINERS = ['.mp4', '.m4v', '.mov']

export function canStrip(name: string): boolean {
  return MP4BOX_CONTAINERS.includes(extname(name))
}

interface Mp4boxModule {
  createFile: (...args: unknown[]) => Mp4boxFile
  DataStream: new (
    buffer?: ArrayBuffer,
    byteOffset?: number,
    endianness?: boolean,
  ) => { buffer: ArrayBuffer; BIG_ENDIAN?: boolean }
  MP4BoxBuffer?: { fromArrayBuffer: (buffer: ArrayBuffer, start: number) => ArrayBuffer }
}

interface Mp4boxSample {
  data: Uint8Array<ArrayBuffer>
  duration: number
  dts: number
  cts: number
  is_sync: boolean
}

interface Mp4boxTrackInfo {
  id: number
  timescale: number
  duration: number
  track_width: number
  track_height: number
  language: string
  nb_samples: number
}

interface Mp4boxFile {
  onReady: (info: { videoTracks: Mp4boxTrackInfo[]; audioTracks: unknown[] }) => void
  onError: (error: unknown) => void
  onSamples: (id: number, user: unknown, samples: Mp4boxSample[]) => void
  appendBuffer: (buffer: ArrayBuffer) => void
  flush: () => void
  start: () => void
  getTrackById: (id: number) => {
    mdia: { minf: { stbl: { stsd: { entries: { type: string; [key: string]: unknown }[] } } } }
  }
  setExtractionOptions: (id: number, user: unknown, options: { nbSamples: number }) => void
  addTrack: (options: Record<string, unknown>) => number
  addSample: (
    trackId: number,
    data: Uint8Array<ArrayBuffer>,
    options: { duration: number; dts: number; cts: number; is_sync: boolean },
  ) => void
  getBuffer: () => { buffer: ArrayBuffer }
}

let modulePromise: Promise<Mp4boxModule> | null = null

/** Lazy: an image-only run should never download the parser. */
function loadMp4box(): Promise<Mp4boxModule> {
  modulePromise ??= import('mp4box') as unknown as Promise<Mp4boxModule>
  return modulePromise
}

/**
 * The decoder configuration record (avcC/hvcC/av1C/vpcC) the new track needs,
 * taken straight from the source sample entry with its 8-byte box header cut.
 */
function decoderConfig(
  mp4box: Mp4boxModule,
  entry: Record<string, unknown>,
): ArrayBuffer | null {
  const box = (entry.avcC ?? entry.hvcC ?? entry.av1C ?? entry.vpcC) as
    | { write: (stream: unknown) => void }
    | undefined
  if (!box) return null
  const DataStream = mp4box.DataStream as unknown as {
    new (buffer: undefined, offset: number, endianness: boolean): {
      buffer: ArrayBuffer
    }
    BIG_ENDIAN: boolean
  }
  const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN)
  box.write(stream)
  return stream.buffer.slice(8)
}

export const mp4boxPreprocessor: VideoPreprocessor = {
  async stripAudio(bytes, name, mimeType): Promise<StripResult> {
    if (!canStrip(name)) {
      throw new Error(
        `${extname(name)} cannot be remuxed in the browser — run this folder in local mode, where ffmpeg strips the audio.`,
      )
    }

    const mp4box = await loadMp4box()
    const source = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer

    return await new Promise<StripResult>((resolve, reject) => {
      const input = mp4box.createFile()
      const output = mp4box.createFile()

      input.onError = (error) => reject(new Error(`mp4box: ${String(error)}`))

      input.onReady = (info) => {
        try {
          const track = info.videoTracks[0]
          if (!track) throw new Error('no video track found')
          // Nothing to strip — send the original bytes, exactly like the CLI
          // would have after a no-op remux.
          if (info.audioTracks.length === 0) {
            resolve({ bytes, mimeType, changed: false })
            return
          }

          const entry = input.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0]
          const description = decoderConfig(mp4box, entry)

          const options: Record<string, unknown> = {
            timescale: track.timescale,
            width: track.track_width,
            height: track.track_height,
            duration: track.duration,
            media_duration: track.duration,
            type: entry.type,
            language: track.language,
          }
          if (entry.type === 'avc1' || entry.type === 'avc3') {
            options.avcDecoderConfigRecord = description
          } else if (entry.type === 'hvc1' || entry.type === 'hev1') {
            options.hevcDecoderConfigRecord = description
          } else if (entry.type === 'av01') {
            options.av1DecoderConfigRecord = description
          } else if (entry.type.startsWith('vp0')) {
            options.vpcDecoderConfigRecord = description
          }

          const newTrackId = output.addTrack(options)

          let copied = 0
          input.onSamples = (_id, _user, samples) => {
            for (const sample of samples) {
              output.addSample(newTrackId, sample.data, {
                duration: sample.duration,
                dts: sample.dts,
                cts: sample.cts,
                is_sync: sample.is_sync,
              })
              copied++
            }
            if (copied >= track.nb_samples) {
              const remuxed = new Uint8Array(output.getBuffer().buffer)
              resolve({ bytes: remuxed, mimeType: 'video/mp4', changed: true })
            }
          }

          input.setExtractionOptions(track.id, null, { nbSamples: 500 })
          input.start()
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      }

      const buffer = mp4box.MP4BoxBuffer
        ? mp4box.MP4BoxBuffer.fromArrayBuffer(source, 0)
        : Object.assign(source, { fileStart: 0 })
      input.appendBuffer(buffer)
      input.flush()
    })
  },
}
