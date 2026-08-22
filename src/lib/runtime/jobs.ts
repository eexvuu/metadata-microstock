import { eq } from 'drizzle-orm'

import { getDb } from '#/db/index'
import { user } from '#/db/schema'
import type { Job } from '#/lib/runtime/job-types'
import { sendWelcomeEmail } from '#/lib/server/onboarding'

/**
 * Background work, on one box.
 *
 * On Cloudflare this went onto a Queue and came back to a consumer, because a
 * request there has a hard CPU budget and provisioning does not belong on it.
 * Here the process is long-lived and the only job is one email, so it runs
 * detached from the response instead: the caller does not wait, and a failure
 * is logged rather than turned into a webhook retry.
 *
 * If this list ever grows past "send a message", it wants a jobs table and a
 * worker loop — not a bigger version of this function.
 */
export async function enqueue(job: Job): Promise<void> {
  void run(job).catch((error) => {
    console.error('[jobs] failed', job, error)
  })
}

async function run(job: Job): Promise<void> {
  switch (job.kind) {
    case 'provision-account': {
      const [account] = await getDb()
        .select({ id: user.id, name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, job.userId))
        .limit(1)

      if (account) await sendWelcomeEmail(account)
      break
    }
  }
}
