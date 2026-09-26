import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const integration = process.env.RUN_REDIS_INTEGRATION === '1' ? describe : describe.skip;

integration('Redis sender-slot reservations', () => {
  let reserveSenderSlot: typeof import('./sender-slot').reserveSenderSlot;
  let redis: typeof import('../infra/redis').redis;
  const sender = `integration-${randomUUID()}@example.test`;
  const campaignId = randomUUID();

  beforeAll(async () => {
    ({ reserveSenderSlot } = await import('./sender-slot.js'));
    ({ redis } = await import('../infra/redis.js'));
    await redis.ping();
  });

  afterAll(async () => {
    await redis.del(`sender-slots:${sender}`, `campaign-slots:${sender}:${campaignId}`);
    await redis.quit();
  });

  it('defers a full campaign past the inclusive rolling-hour boundary', async () => {
    const first = await reserveSenderSlot(sender, campaignId, 'email-a', 0, 20, 1);
    const capped = await reserveSenderSlot(sender, campaignId, 'email-b', 0, 20, 1);

    expect(first.hourlyLimitHit).toBe(false);
    expect(capped.hourlyLimitHit).toBe(true);
    expect(capped.scheduledAt).toBeGreaterThanOrEqual(first.scheduledAt + 3600001);
  });

  it('keeps a campaign-specific cap separate while respecting the shared sender bucket', async () => {
    const nextCampaign = await reserveSenderSlot(sender, randomUUID(), 'email-c', 0, 20, 1);
    expect(nextCampaign.hourlyLimitHit).toBe(false);
  });
});