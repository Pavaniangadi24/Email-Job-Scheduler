import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { ExpressAdapter } from '@bull-board/express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { config, isProduction } from './config';
import passport from './auth/passport';
import { emailQueue } from './queue/email-queue';
import { authRouter } from './routes/auth';
import { emailsRouter } from './routes/emails';
import { slackRouter } from './routes/slack';
import { requireAuth } from './middleware/auth';

const app = express();
const PgSession = connectPgSimple(session);
const sessionPool = new Pool({ connectionString: config.DATABASE_URL });
const sessionMiddleware = session({
  store: new PgSession({ pool: sessionPool, createTableIfMissing: true, tableName: 'user_sessions' }),
  name: 'reachinbox.sid', secret: config.SESSION_SECRET, resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: 7 * 24 * 3600 * 1000 },
});

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/emails', emailsRouter);
app.use('/api/integrations/slack', slackRouter);

const boardAdapter = new ExpressAdapter();
boardAdapter.setBasePath('/admin/queues');
createBullBoard({ queues: [new BullMQAdapter(emailQueue)], serverAdapter: boardAdapter });
app.use('/admin/queues', requireAuth, boardAdapter.getRouter());

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

export { app, sessionPool };