import { randomUUID } from 'node:crypto';
import { EmailStatus } from '@prisma/client';
import { prisma } from '../infra/prisma';
import { indexEmail } from '../infra/search';
import { enqueueEmails } from '../queue/email-queue';
import { indexEmails } from '../infra/search';
import { normalizeRecipients, scheduledTime } from './scheduler-helpers';
export { normalizeRecipients, scheduledTime } from './scheduler-helpers';

export interface ScheduleInput {
  sender: string; subject: string; body: string; recipients: string[];
  startAt: Date; delayMs: number; hourlyLimit: number;
}

export async function scheduleEmails(userId: string, input: ScheduleInput, requestKey?: string) {
  const batchId = requestKey ?? randomUUID();
  const recipients = normalizeRecipients(input.recipients);
  const jobs = await prisma.$transaction(async transaction => {
    if (requestKey) {
      const existingBatch = await transaction.email.findMany({ where: { userId, batchId }, orderBy: { scheduledAt: 'asc' } });
      if (existingBatch.length) return existingBatch;
    }
    await transaction.email.createMany({
      data: recipients.map((recipient, index) => ({
        id: randomUUID(), userId, recipient, sender: input.sender,
        subject: input.subject, body: input.body,
        scheduledAt: scheduledTime(input.startAt, index, input.delayMs),
        sendDelayMs: input.delayMs, hourlyLimit: input.hourlyLimit,
        batchId, idempotencyKey: `${batchId}:${recipient}`,
      })),
      skipDuplicates: true,
    });
    return transaction.email.findMany({ where: { userId, batchId }, orderBy: { scheduledAt: 'asc' } });
  });
  await enqueueEmails(jobs);
  await indexEmails(jobs);
  return { batchId, count: jobs.length, emails: jobs };
}

export async function recoverScheduledJobs() {
  const abandoned = await prisma.email.updateMany({
    where: { status: EmailStatus.PROCESSING, processingStartedAt: { lt: new Date(Date.now() - 2 * 60 * 1000) } },
    data: { status: EmailStatus.FAILED, error: 'Delivery was interrupted and may have reached SMTP; it was not retried to prevent a duplicate.' },
  });
  let pendingCount = 0;
  let indexedCount = 0;
  let cursor: string | undefined;
  while (true) {
    const pending = await prisma.email.findMany({
      where: { status: EmailStatus.SCHEDULED }, orderBy: { id: 'asc' }, take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!pending.length) break;
    await enqueueEmails(pending);
    pendingCount += pending.length;
    cursor = pending[pending.length - 1].id;
  }
  cursor = undefined;
  while (true) {
    const records: Array<{ id: string; userId: string; recipient: string; sender: string; subject: string; status: EmailStatus; scheduledAt: Date; sentAt: Date | null; batchId: string; updatedAt: Date }> = await prisma.email.findMany({
      select: { id: true, userId: true, recipient: true, sender: true, subject: true, status: true, scheduledAt: true, sentAt: true, batchId: true, updatedAt: true },
      orderBy: { id: 'asc' }, take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!records.length) break;
    await indexEmails(records, true);
    indexedCount += records.length;
    cursor = records[records.length - 1].id;
  }
  console.info(`Recovered ${pendingCount} scheduled email jobs, classified ${abandoned.count} interrupted deliveries, and re-indexed ${indexedCount} records`);
}