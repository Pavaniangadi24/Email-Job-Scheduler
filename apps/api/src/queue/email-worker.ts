import { DelayedError, Job, Worker } from 'bullmq';
import { config } from '../config';
import { prisma } from '../infra/prisma';
import { redis } from '../infra/redis';
import { indexEmail } from '../infra/search';
import { EmailJobData, EMAIL_QUEUE } from './email-queue';
import { sendEmail } from '../services/mailer';
import { reserveSenderSlot } from '../services/sender-slot';
import { notifyRateLimit } from '../services/slack';

export const emailWorker = new Worker<EmailJobData>(EMAIL_QUEUE, async (job: Job<EmailJobData>, token?: string) => {
  const email = await prisma.email.findUnique({ where: { id: job.data.emailId } });
  if (!email || ['SENT', 'FAILED'].includes(email.status)) return;
  if (email.status === 'PROCESSING') {
    const abandoned = await prisma.email.update({
      where: { id: email.id },
      data: { status: 'FAILED', error: 'Delivery was interrupted and may have reached SMTP; it was not retried to prevent a duplicate.' },
    });
    await indexEmail(abandoned);
    return;
  }
  const previousStatus = email.status;
  const { scheduledAt: reservedAt, hourlyLimitHit } = await reserveSenderSlot(email.sender, email.batchId, email.id, Math.max(config.MIN_SEND_DELAY_MS, email.sendDelayMs), config.MAX_EMAILS_PER_HOUR_PER_SENDER, email.hourlyLimit || config.MAX_EMAILS_PER_HOUR_PER_SENDER);
  if (reservedAt > Date.now()) {
    if (hourlyLimitHit) await notifyRateLimit(email.userId, email.sender, new Date(reservedAt)).catch(error => console.error('Slack rate-limit notification failed', error));
    await job.moveToDelayed(reservedAt, token);
    throw new DelayedError();
  }
  const claimed = await prisma.email.updateMany({ where: { id: email.id, status: 'SCHEDULED' }, data: { status: 'PROCESSING', processingStartedAt: new Date() } });
  if (!claimed.count) return;
  try {
    const info = await sendEmail({ from: email.sender, to: email.recipient, subject: email.subject, text: email.body });
    const updated = await prisma.email.update({ where: { id: email.id }, data: { status: 'SENT', sentAt: new Date(), error: null } });
    await indexEmail(updated);
    console.info(`Delivered email ${email.id}; preview: ${nodemailerPreview(info)}`);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown SMTP failure';
    const updated = await prisma.email.update({ where: { id: email.id }, data: { status: 'FAILED', error: reason } });
    await indexEmail(updated);
    throw error;
  }
}, { connection: redis, concurrency: config.WORKER_CONCURRENCY });

function nodemailerPreview(info: { messageId: string }) { return info.messageId; }

emailWorker.on('failed', (job, error) => console.error(`Email job ${job?.id} failed`, error));