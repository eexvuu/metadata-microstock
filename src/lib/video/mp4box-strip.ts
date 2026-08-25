import { extname, UnsendableMediaError, UPLOAD_MAX_BYTES } from '#/lib/engine/media'
import type { StripResult, VideoPreprocessor } from './types'

/**
 * Browser equivalent of the CLI's `ffmpeg -an -c:v copy`: parse the MP4, copy
 * every video sample into a fresh file and never mention the audio track. It is
 * a stream copy, so there is no re-encode — a 10 MB 4K clip takes well under a
 * second.
 *
 * MP4/MOV only. Everything else (avi, mkv, webm, wmv, flv) has no ISOBMFF
 * structure to walk, and there is no companion ffmpeg any more — so the file
 * sources drop those containers at scan time rather than letting Gemma refuse
 * them one upload at a time.
 *
 * Parsing is also how a file earns the Files API route: what mp4box cannot
 * rewrite, it can at least identify.
 */

export const MP4BOX_CONTAINERS = ['.mp4', '.m4v', '.mov']

export function canStrip(name: string): boolean {
  return MP4BOX_CONTAINERS.includes(extname(name))
}

/**
 * The video codecs this tab can rewrite.
 *
 * An allowlist, not a list of things to reject, and deliberately the same set
 * `decoderConfig` below knows how to describe: a track we cannot write a
 * configuration record for remuxes into a file nobody can play, so "supported"
 * and "remuxable" have to mean the same thing.
 *
 * What it keeps out is the mastering formats. ProRes and DNxHD are edit-suite
 * intermediates — ten to a thousand times the size of the finished file, which
 * is why a seven-second 4K clip is 68 MB — and Chrome ships no decoder for
 * either, so there is nothing a tab can do with one: not remux it, not shrink
 * it, not even draw a thumbnail of it. Measured 2026-08-25 on a 68 MB ProRes
 * .mov: `canPlayType` empty, `MediaSource.isTypeSupported` false, WebCodecs
 * `VideoDecoder.isConfigSupported` false, and a `<video>` element that never
 * reached readyState 1.
 *
 * It is no longer a list of what can be *sent*, though. Google decodes these
 * server-side, so a file off this list goes up through the Files API untouched
 * instead of being refused — see `StripResult.upload`.
 */
const SENDABLE_CODECS = ['avc1', 'avc3', 'hvc1', 'hev1', 'av01', 'vp08', 'vp09']

/**
 * What is left of the old refusal, now that a mastering codec is uploaded
 * rather than rejected: the file is so large that uploading it costs more than
 * exporting it again would. The one thing a contributor can do about it, said
 * in one line — nothing is lost, the model looks at the picture, and the
 * master stays on their disk for the platform to receive.
 */
function tooBigToUpload(name: string, codec: string, size: number): UnsendableMediaError {
  return new UnsendableMediaError(
    `${name} is ${codecName(codec)} at ${(size / 1048576).toFixed(0)} MB, a mastering format this browser cannot open — too big to upload as it is. Export an H.264 MP4 of the same clip and run that: the model sees the same picture.`,
  )
}

/** So the message says "ProRes" rather than "apcn" at somebody. */
function codecName(type: string): string {
  if (type.startsWith('ap')) return `ProRes (${type})`
  if (type.startsWith('AVd')) return `DNxHD/DNxHR (${type})`
  if (type === 'mjpa' || type === 'mjpb' || type === 'jpeg') return `Motion JPEG (${type})`
  if (type === 'raw ' || type === '2vuy' || type === 'v210') return `uncompressed video (${type})`
  return type
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
  /** The fourcc, and the only thing an unclassified track tells us about itself. */
  codec: string
  timescale: number
  duration: number
  track_width: number
  track_height: number
  language: string
  nb_samples: number
}

interface Mp4boxFile {
  onReady: (info: {
    videoTracks: Mp4boxTrackInfo[]
    audioTracks: unknown[]
    /** Anything mp4box could not place, which is where a ProRes track lands. */
    otherTracks?: Mp4boxTrackInfo[]
  }) => void
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
      throw new UnsendableMediaError(
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
          /*
           * A codec this tab cannot rewrite still travels — as itself, through
           * the Files API. `hasAudio` travels with it because nothing here can
           * strip that audio, and the bottom rung refuses media that has any.
           */
          const byReference = (codec: string): StripResult => {
            if (bytes.length > UPLOAD_MAX_BYTES) throw tooBigToUpload(name, codec, bytes.length)
            return {
              bytes,
              mimeType,
              changed: false,
              upload: true,
              hasAudio: info.audioTracks.length > 0,
            }
          }

          const track = info.videoTracks[0]

          /*
           * A missing video track is usually not a broken file — it is a
           * codec mp4box does not classify. Measured on a 68 MB ProRes .mov:
           * `videoTracks` is empty and the picture is in `otherTracks` as
           * `codec: "apcn"`, 3840x2160, typed "metadata". So look there before
           * calling the file unreadable, and say which codec it actually is.
           */
          if (!track) {
            const unclassified = (info.otherTracks ?? []).find(
              (other) => other.track_width > 0 && other.track_height > 0,
            )
            if (unclassified) {
              resolve(byReference(unclassified.codec))
              return
            }
            throw new Error('no video track found')
          }

          // Checked before the audio question, because there is no answering it
          // for these: the audio sits in a file this tab cannot rewrite, so it
          // travels along and the runner keeps the file on the fast rung.
          const entry = input.getTrackById(track.id).mdia.minf.stbl.stsd.entries[0]
          if (!SENDABLE_CODECS.includes(entry.type)) {
            resolve(byReference(entry.type))
            return
          }

          // Nothing to strip — send the original bytes, exactly like the CLI
          // would have after a no-op remux.
          if (info.audioTracks.length === 0) {
            resolve({ bytes, mimeType, changed: false })
            return
          }

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
