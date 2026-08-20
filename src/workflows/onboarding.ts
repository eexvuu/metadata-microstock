import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from 'cloudflare:workers'

import { sendEmail } from '#/lib/email/index'

export type OnboardingParams = {
  userId: string
  name: string
  email: string
}

/**
 * Multi-step account onboarding that must not half-fail.
 *
 * Workflows, not Queues, because each step is checkpointed: if step 2 fails,
 * it retries from step 2 rather than replaying step 1. Replaying "send the
 * welcome email" would spam the user.
 *
 * The address comes from the account row the queue looked up, not from
 * `EMAIL_FROM` — the starter kit's old placeholder bug, fixed with the tenant
 * model that made it necessary.
 *
 * Free plan: 100 concurrent instances, 1,024 steps, 10ms CPU per step, and
 * state is retained 3 days. Keep each step's CPU work small — waiting on I/O
 * is free, it is compute that counts against the limit.
 */
export class OnboardingWorkflow extends WorkflowEntrypoint<
  Env,
  OnboardingParams
> {
  async run(event: WorkflowEvent<OnboardingParams>, step: WorkflowStep) {
    const { userId, name, email } = event.payload

    await step.do('send welcome email', async () => {
      await sendEmail({
        to: email,
        subject: 'Welcome to Stockflow',
        html: `<p>Hi ${name}, your Stockflow account is ready.</p><p>Add a Gemini key and the metadata tool will write your next upload batch for you.</p>`,
        text: `Hi ${name}, your Stockflow account is ready. Add a Gemini key and the metadata tool will write your next upload batch for you.`,
      })
    })

    return { userId, onboarded: true }
  }
}
