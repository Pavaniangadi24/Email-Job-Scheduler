import { Queue } from 'bullmq';
import { redis } from '../infra/redis';

export const EMAIL_QUEUE = 'scheduled-emails';
export interface EmailJobData { emailId: string; }

export const emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 7 * 24 * 3600, count: 10000 },
    removeOnFail: false,
  },
});

export async function enqueueEmail(emailId: string, scheduledAt: Date) {
  const delay = Math.max(0, scheduledAt.getTime() - Date.now());
  return emailQueue.add('deliver', { emailId }, { jobId: emailId, delay });
}

export async function enqueueEmails(emails: Array<{ id: string; scheduledAt: Date }>) {
  for (let offset = 0; offset < emails.length; offset += 500) {
    await emailQueue.addBulk(emails.slice(offset, offset + 500).map(email => ({
      name: 'deliver', data: { emailId: email.id },
      opts: { jobId: email.id, delay: Math.max(0, email.scheduledAt.getTime() - Date.now()) },
    })));
  }
}