import { sendEmail } from '#/lib/email/index'

/**
 * The one thing a new paid account gets. Kept apart from whatever schedules it
 * so the message is not tangled up with the queue, the workflow or the cron
 * that happens to be in fashion.
 */
export async function sendWelcomeEmail(account: {
  name: string
  email: string
}): Promise<void> {
  await sendEmail({
    to: account.email,
    subject: 'Welcome to Stockflow',
    html: `<p>Hi ${account.name}, your Stockflow account is ready.</p><p>Add a Gemini key and the metadata tool will write your next upload batch for you.</p>`,
    text: `Hi ${account.name}, your Stockflow account is ready. Add a Gemini key and the metadata tool will write your next upload batch for you.`,
  })
}
