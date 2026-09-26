import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(__dirname, '../../../../.env') });

const result = spawnSync('prisma', process.argv.slice(2), {
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error('Could not run Prisma CLI', result.error);
  process.exit(1);
}
process.exit(result.status ?? 1);