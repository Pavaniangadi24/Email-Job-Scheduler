import { Router } from 'express';
import { z } from 'zod';
import { EmailStatus } from '@prisma/client';
import { requireAuth, getUserId } from '../middleware/auth';
import { prisma } from '../infra/prisma';
import { searchEmails } from '../infra/search';
import { scheduleEmails } from '../services/scheduler';
import { asyncRoute } from '../middleware/async-route';

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

const scheduleSchema = z.object({
  sender: z.string().email(),
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(100000),
  recipients: z.array(z.string().email()).min(1).max(10000),
  startAt: z.string().datetime().refine(value => new Date(value).getTime() >= Date.now() - 60000, 'Start time must be in the future'),
  delayMs: z.number().int().min(0).max(3600000),
  hourlyLimit: z.number().int().positive().max(100000).optional(),
});

emailsRouter.post('/', asyncRoute(async (req, res) => {
  const parsed = scheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid schedule request', details: parsed.error.flatten() });
  const requestKey = req.header('Idempotency-Key');
  if (requestKey && requestKey.length > 200) return res.status(400).json({ error: 'Idempotency-Key must be at most 200 characters' });
  const result = await scheduleEmails(getUserId(req), { ...parsed.data, startAt: new Date(parsed.data.startAt), hourlyLimit: parsed.data.hourlyLimit ?? Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER ?? 200) }, requestKey);
  res.status(201).json(result);
}));

emailsRouter.get('/', asyncRoute(async (req, res) => {
  const status = req.query.status === 'sent' ? { in: [EmailStatus.SENT, EmailStatus.FAILED] } : req.query.status === 'failed' ? EmailStatus.FAILED : { in: [EmailStatus.SCHEDULED, EmailStatus.PROCESSING] };
  const emails = await prisma.email.findMany({ where: { userId: getUserId(req), status }, orderBy: req.query.status === 'sent' ? { sentAt: 'desc' } : { scheduledAt: 'asc' }, take: 500, select: { id: true, recipient: true, sender: true, subject: true, scheduledAt: true, sentAt: true, status: true, error: true, batchId: true } });
  res.json({ emails });
}));

emailsRouter.get('/search', asyncRoute(async (req, res) => {
  try { res.json({ emails: await searchEmails(getUserId(req), String(req.query.q ?? '')) }); }
  catch { res.status(503).json({ error: 'Search is temporarily unavailable' }); }
}));