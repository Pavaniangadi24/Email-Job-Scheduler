import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import passport from '../auth/passport';
import { config } from '../config';
import { requireAuth, getUserId } from '../middleware/auth';
import { prisma } from '../infra/prisma';
import { redis } from '../infra/redis';
import { asyncRoute } from '../middleware/async-route';

export const authRouter = Router();
authRouter.get('/google', (req, res, next) => {
  if (!config.GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'Google OAuth is not configured' });
  const state = randomBytes(32).toString('hex');
  void redis.set(`google-oauth-state:${state}`, 'valid', 'EX', 600).then(() => {
    passport.authenticate('google', { scope: ['profile', 'email'], state })(req, res, next);
  }).catch(next);
});
authRouter.get('/google/callback', asyncRoute(async (req, res, next) => {
  const state = String(req.query.state ?? '');
  const validState = state ? await redis.getdel(`google-oauth-state:${state}`) : null;
  if (!validState) return res.redirect(`${config.WEB_ORIGIN}/?login=failed`);
  passport.authenticate('google', { failureRedirect: `${config.WEB_ORIGIN}/?login=failed` })(req, res, next);
}), (_req, res) => res.redirect(config.WEB_ORIGIN));
authRouter.get('/me', requireAuth, asyncRoute(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: getUserId(req) }, include: { slackConnection: { select: { teamName: true } } } });
  res.json({ user });
}));
authRouter.post('/logout', requireAuth, (req, res, next) => req.logout(error => {
  if (error) return next(error);
  req.session.destroy(sessionError => {
    if (sessionError) return next(sessionError);
    res.clearCookie('reachinbox.sid');
    res.status(204).end();
  });
}));