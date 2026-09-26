import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { requireAuth, getUserId } from '../middleware/auth';
import { config } from '../config';
import { prisma } from '../infra/prisma';
import { redis } from '../infra/redis';
import { decryptSecret, encryptSecret } from '../security/secret';
import { asyncRoute } from '../middleware/async-route';

export const slackRouter = Router();
slackRouter.use(requireAuth);

slackRouter.get('/connect', asyncRoute(async (req, res) => {
  if (!config.SLACK_CLIENT_ID || !config.SLACK_CLIENT_SECRET) return res.status(503).json({ error: 'Slack OAuth is not configured' });
  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.set('client_id', config.SLACK_CLIENT_ID);
  url.searchParams.set('scope', 'chat:write, incoming-webhook');
  url.searchParams.set('redirect_uri', config.SLACK_CALLBACK_URL);
  const state = randomBytes(32).toString('hex');
  await redis.set(`slack-oauth-state:${state}`, getUserId(req), 'EX', 600);
  url.searchParams.set('state', state);
  res.redirect(url.toString());
}));

slackRouter.get('/callback', asyncRoute(async (req, res) => {
  const state = String(req.query.state ?? '');
  const userId = state ? await redis.getdel(`slack-oauth-state:${state}`) : null;
  if (!userId || !req.isAuthenticated?.() || getUserId(req) !== userId || req.query.error) return res.redirect(config.WEB_ORIGIN);
  const code = String(req.query.code ?? '');
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: config.SLACK_CLIENT_ID, client_secret: config.SLACK_CLIENT_SECRET, redirect_uri: config.SLACK_CALLBACK_URL }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json() as { ok: boolean; access_token?: string; team?: { id: string; name: string }; incoming_webhook?: { url: string; channel_id: string } };
  if (data.ok && data.access_token && data.team) {
    await prisma.slackConnection.upsert({
      where: { userId },
      create: { userId, teamId: data.team.id, teamName: data.team.name, accessToken: encryptSecret(data.access_token), webhookUrl: data.incoming_webhook?.url ? encryptSecret(data.incoming_webhook.url) : null, channelId: data.incoming_webhook?.channel_id ?? config.SLACK_NOTIFICATION_CHANNEL },
      update: { teamId: data.team.id, teamName: data.team.name, accessToken: encryptSecret(data.access_token), webhookUrl: data.incoming_webhook?.url ? encryptSecret(data.incoming_webhook.url) : null, channelId: data.incoming_webhook?.channel_id ?? config.SLACK_NOTIFICATION_CHANNEL },
    });
  }
  res.redirect(`${config.WEB_ORIGIN}/?slack=${data.ok ? 'connected' : 'failed'}`);
}));

slackRouter.delete('/', asyncRoute(async (req, res) => {
  const connection = await prisma.slackConnection.findUnique({ where: { userId: getUserId(req) } });
  if (connection) {
    await fetch('https://slack.com/api/auth.revoke', { method: 'POST', headers: { authorization: `Bearer ${decryptSecret(connection.accessToken)}` }, signal: AbortSignal.timeout(5000) }).catch(error => console.error('Slack token revocation failed', error));
  }
  await prisma.slackConnection.deleteMany({ where: { userId: getUserId(req) } });
  res.status(204).end();
}));