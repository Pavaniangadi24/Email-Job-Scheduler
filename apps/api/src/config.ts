import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

let envDirectory = process.cwd();
for (let depth = 0; depth < 4; depth += 1) {
  const envPath = resolve(envDirectory, '.env');
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
  const parent = dirname(envDirectory);
  if (parent === envDirectory) break;
  envDirectory = parent;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().url(),
  ELASTICSEARCH_URL: z.string().url(),
  SESSION_SECRET: z.string().min(16),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_CALLBACK_URL: z.string().url(),
  SLACK_CLIENT_ID: z.string().default(''),
  SLACK_CLIENT_SECRET: z.string().default(''),
  SLACK_CALLBACK_URL: z.string().url(),
  SLACK_NOTIFICATION_CHANNEL: z.string().optional(),
  ETHEREAL_HOST: z.string().default('smtp.ethereal.email'),
  ETHEREAL_PORT: z.coerce.number().default(587),
  ETHEREAL_USER: z.string().default(''),
  ETHEREAL_PASS: z.string().default(''),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  MIN_SEND_DELAY_MS: z.coerce.number().int().positive().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
});

export const config = envSchema.parse(process.env);
export const isProduction = config.NODE_ENV === 'production';