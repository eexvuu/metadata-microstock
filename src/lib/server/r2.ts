import { AwsClient } from 'aws4fetch'

import { env } from '#/lib/runtime/env'

/**
 * R2, and nothing but presigned URLs.
 *
 * The rule this file exists to keep: **media bytes never pass through this
 * process.** The browser PUTs an original straight to R2, the worker GETs it
 * straight from R2 and PUTs its vectors back the same way, and the only thing
 * Node ever handles is a signature. That is not tidiness — the unit is capped
 * at 768 MB on a box with two shared cores, and a batch of 4000 px artwork
 * streamed through it would be the whole memory budget for one upload.
 *
 * It is also the closest this tool gets to the engine's "media never touches a
 * disk we own" rule. It cannot keep it: the vectorizer.ai account is ours and
 * the worker is not the user's browser, so the file has to land somewhere both
 * can reach. R2 is that somewhere, for a month, and this module is the only
 * door to it.
 *
 * aws4fetch rather than the AWS SDK: SigV4 is the only thing needed here, it
 * is 6 KB with no dependencies, and hand-rolling a signer is how you end up
 * debugging canonical request formatting instead of shipping.
 */

/**
 * Two hours, and the number is load-bearing in both directions.
 *
 * It has to outlive a LEASE (45 minutes, `vector-queue.ts`): the worker is
 * handed its upload URLs when it claims the file, and a file that sat behind a
 * CAPTCHA for half an hour would otherwise finish, PUT to an expired URL, and
 * report a failure — burning a second vectorizer.ai credit on the retry, in
 * exactly the slow case the lease exists for.
 *
 * It also has to outlive a BATCH upload: the browser is handed all of a job's
 * URLs at once and uploads four at a time, so a folder of large PNGs on a home
 * connection can be an hour before it reaches the last of them.
 *
 * The leak it is traded against stays small: one URL grants one PUT to one
 * key, and nothing reads what is written there except the worker.
 */
const PUT_TTL_SECONDS = 60 * 120

/** A download link is clicked within seconds of being handed out. */
const GET_TTL_SECONDS = 60 * 15

/**
 * A bulk save is different in kind, not degree. `getVectorJobDownloads` mints
 * every URL for a batch up front — two hundred images times three files — and
 * the browser then works through them four at a time. The last URL is used
 * when the save ends, not when it started, so the short TTL that is right for
 * a click would 403 the tail of a large batch. Same trap as the worker's
 * upload URLs, same answer.
 */
const BULK_GET_TTL_SECONDS = 60 * 120

let cached: { client: AwsClient; bucketUrl: string } | null = null

/**
 * Throws at use rather than at import, so a deploy without R2 configured still
 * boots and still serves the metadata tool. The vectorizer is the only screen
 * that finds out.
 */
function r2(): { client: AwsClient; bucketUrl: string } {
  if (cached) return cached

  const accountId = env.R2_ACCOUNT_ID
  const accessKeyId = env.R2_ACCESS_KEY_ID
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY
  const bucket = env.R2_BUCKET

  if (!accessKeyId || !secretAccessKey || !bucket || !(accountId || env.R2_ENDPOINT)) {
    throw new Error(
      'R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET — see .env.example.',
    )
  }

  const endpoint = env.R2_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com`

  cached = {
    client: new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: 's3',
      // R2 has one region and it is called auto. Signing against anything else
      // is a SignatureDoesNotMatch that reads like a credentials problem.
      region: 'auto',
    }),
    bucketUrl: `${endpoint.replace(/\/+$/, '')}/${bucket}`,
  }

  return cached
}

export function isR2Configured(): boolean {
  try {
    r2()
    return true
  } catch {
    return false
  }
}

function objectUrl(key: string): string {
  const { bucketUrl } = r2()
  // Encode each segment, not the separators: keys here are `<user>/<job>/<file>`
  // and a percent-encoded slash is a different object.
  return `${bucketUrl}/${key.split('/').map(encodeURIComponent).join('/')}`
}

async function presign(key: string, method: 'GET' | 'PUT', ttl: number): Promise<string> {
  const { client } = r2()

  const signed = await client.sign(
    new Request(`${objectUrl(key)}?X-Amz-Expires=${ttl}`, { method }),
    { aws: { signQuery: true } },
  )

  return signed.url
}

/** A URL the browser or the worker can PUT one object to, once, soon. */
export function presignPut(key: string): Promise<string> {
  return presign(key, 'PUT', PUT_TTL_SECONDS)
}

/**
 * A URL that hands the bytes back. Short-lived, so it is never stored.
 *
 * `bulk` is for a save that will still be running long after it was signed —
 * see `BULK_GET_TTL_SECONDS`. Anything a person clicks takes the default.
 */
export function presignGet(key: string, bulk = false): Promise<string> {
  return presign(key, 'GET', bulk ? BULK_GET_TTL_SECONDS : GET_TTL_SECONDS)
}

/**
 * Deletes one object, and treats "it was not there" as success.
 *
 * The pruner calls this for every expired file and then deletes the row. If a
 * missing object were an error, one interrupted upload would block the prune
 * for that row forever.
 */
export async function deleteObject(key: string): Promise<void> {
  const { client } = r2()
  const response = await client.fetch(objectUrl(key), { method: 'DELETE' })

  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 DELETE ${key} failed: ${response.status}`)
  }
}

/**
 * Where one file's three objects live.
 *
 * The user id leads, so a bucket lifecycle rule or a manual clean-up can be
 * scoped to one account without reading the database. The stored extension is
 * `bin` for the original because the contributor's filename is the only name
 * that matters and it is carried in the row, not in the key.
 */
export function objectKeys(userId: string, jobId: string, fileId: string) {
  const base = `vector/${userId}/${jobId}/${fileId}`
  return { source: `${base}/source`, svg: `${base}/out.svg`, eps: `${base}/out.eps` }
}
