import { prisma } from '../infra/prisma';
import { redis } from '../infra/redis';
import { decryptSecret } from '../security/secret';

export async function notifyRateLimit(userId: string, sender: string, resumeAt: Date) {
  const connection = await prisma.slackConnection.findUnique({ where: { userId } });
  if (!connection) return;
  const oncePerHour = await redis.set(`slack-rate-notice:${sender.toLowerCase()}:${Math.floor(Date.now() / 3600000)}`, '1', 'EX', 3600, 'NX');
  if (oncePerHour !== 'OK') return;
  const text = `Email sender ${sender} reached its hourly sending limit. Queued emails will resume at ${resumeAt.toISOString()}.`;
  if (connection.webhookUrl) {
    const response = await fetch(decryptSecret(connection.webhookUrl), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Slack webhook returned HTTP ${response.status}`);
    return;
  }
  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { authorization: `Bearer ${decryptSecret(connection.accessToken)}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: connection.channelId, text }),
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json() as { ok?: boolean; error?: string };
  if (!result.ok) throw new Error(`Slack notification failed: ${result.error ?? response.statusText}`);
}