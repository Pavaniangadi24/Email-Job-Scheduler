export function normalizeRecipients(recipients: string[]) {
  return [...new Set(recipients.map(recipient => recipient.trim().toLowerCase()))];
}

export function scheduledTime(startAt: Date, index: number, delayMs: number) {
  return new Date(startAt.getTime() + index * delayMs);
}