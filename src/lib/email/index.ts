import { env } from 'cloudflare:workers'

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
}

/**
 * Email is the one place where the $0 and $5 paths genuinely diverge.
 *
 *   console    — logs to the Worker console. Zero API keys, zero accounts.
 *                This is the default so the kit runs immediately after clone.
 *   resend     — the $0 production path. Cloudflare Email Service cannot send
 *                to arbitrary recipients on the Free plan, so signup
 *                verification and invites need a third party. Resend's free
 *                tier is 3,000/month with a hard 100/day cap.
 *   cloudflare — the $5 path. Needs Workers Paid, plus a domain onboarded via
 *                `wrangler email sending enable yourdomain.com`, plus the
 *                `send_email` binding uncommented in wrangler.jsonc.
 */
export type EmailProvider = 'console' | 'resend' | 'cloudflare'

export async function sendEmail(message: EmailMessage): Promise<void> {
  const provider = (env.EMAIL_PROVIDER ?? 'console') as EmailProvider

  switch (provider) {
    case 'resend':
      return sendViaResend(message)
    case 'cloudflare':
      return sendViaCloudflare(message)
    default:
      return sendViaConsole(message)
  }
}

async function sendViaConsole(message: EmailMessage): Promise<void> {
  console.log(
    `[email:console] to=${message.to} subject=${message.subject}\n${message.text}`,
  )
}

async function sendViaResend(message: EmailMessage): Promise<void> {
  if (!env.RESEND_API_KEY) {
    throw new Error('EMAIL_PROVIDER=resend but RESEND_API_KEY is not set')
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${env.EMAIL_FROM_NAME} <${env.EMAIL_FROM}>`,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  })

  if (!response.ok) {
    throw new Error(
      `Resend rejected the message (${response.status}): ${await response.text()}`,
    )
  }
}

async function sendViaCloudflare(message: EmailMessage): Promise<void> {
  const binding = (env as unknown as { EMAIL?: EmailSendBinding }).EMAIL

  if (!binding) {
    throw new Error(
      'EMAIL_PROVIDER=cloudflare but the `send_email` binding is missing. ' +
        'Uncomment it in wrangler.jsonc (requires Workers Paid).',
    )
  }

  await binding.send({
    to: message.to,
    from: { email: env.EMAIL_FROM, name: env.EMAIL_FROM_NAME },
    subject: message.subject,
    html: message.html,
    text: message.text,
  })
}

type EmailSendBinding = {
  send(input: {
    to: string
    from: { email: string; name?: string }
    subject: string
    html: string
    text: string
  }): Promise<unknown>
}
