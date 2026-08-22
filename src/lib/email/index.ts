import { env } from '#/lib/runtime/env'

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
}

/**
 * Two ways out, and the default needs no account at all.
 *
 *   console — logs to stdout, which systemd puts in the journal. Zero API
 *             keys, zero accounts, and the default so a fresh clone runs.
 *   resend  — the production path. The free tier is 3,000 a month with a hard
 *             100/day cap, which is the ceiling to check before signup
 *             verification gets switched on.
 *
 * The Cloudflare provider left with the Worker: it was a binding, and a
 * binding is not something a VPS has.
 */
export type EmailProvider = 'console' | 'resend'

export async function sendEmail(message: EmailMessage): Promise<void> {
  const provider = (env.EMAIL_PROVIDER ?? 'console') as EmailProvider

  switch (provider) {
    case 'resend':
      return sendViaResend(message)
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
