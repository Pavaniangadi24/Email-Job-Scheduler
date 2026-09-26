import { Client } from '@elastic/elasticsearch';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { redis } from './redis';

const client = new Client({ node: config.ELASTICSEARCH_URL });
const index = 'scheduled-emails';
export const SEARCH_QUEUE = 'email-search-index';
export const searchQueue = new Queue(SEARCH_QUEUE, { connection: redis, defaultJobOptions: { attempts: 10, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: { age: 7 * 24 * 3600, count: 10000 }, removeOnFail: false } });

export async function indexEmail(email: {
  id: string; userId: string; recipient: string; sender: string; subject: string;
  status: string; scheduledAt: Date; sentAt: Date | null; batchId: string; updatedAt?: Date;
}) {
  await indexEmails([email]);
}

export async function indexEmails(emails: Array<{
  id: string; userId: string; recipient: string; sender: string; subject: string;
  status: string; scheduledAt: Date; sentAt: Date | null; batchId: string; updatedAt?: Date;
}>, force = false) {
  for (let offset = 0; offset < emails.length; offset += 500) {
    await searchQueue.addBulk(emails.slice(offset, offset + 500).map(email => {
  const version = email.updatedAt?.getTime() ?? email.scheduledAt.getTime();
      return {
        name: 'index',
        data: {
          id: email.id, userId: email.userId, recipient: email.recipient,
          sender: email.sender, subject: email.subject, status: email.status,
          scheduledAt: email.scheduledAt.toISOString(), sentAt: email.sentAt?.toISOString() ?? null,
          batchId: email.batchId, updatedAt: version,
        },
        opts: { jobId: `email-${email.id}-${version}${force ? `-${randomUUID()}` : ''}` },
      };
    }));
  }
}

export async function writeEmailIndex(document: Record<string, unknown>) {
  const { id, updatedAt, ...fields } = document;
  const version = Number(updatedAt);
  const documentWithVersion = { ...fields, id: String(id), updatedAt: version };
  await client.update({
    index,
    id: String(id),
    script: {
      source: "def oldRank = ctx._source.status == 'SENT' || ctx._source.status == 'FAILED' ? 2 : 1; def newRank = params.document.status == 'SENT' || params.document.status == 'FAILED' ? 2 : 1; if (ctx._source.updatedAt == null || params.version > ctx._source.updatedAt || (params.version == ctx._source.updatedAt && newRank >= oldRank)) { ctx._source = params.document } else { ctx.op = 'noop' }",
      params: { version, document: documentWithVersion },
    },
    upsert: documentWithVersion,
    refresh: 'wait_for',
  });
}

export async function searchEmails(userId: string, query: string) {
  const result = await client.search({
    index,
    query: {
      bool: {
        filter: [{ term: { 'userId.keyword': userId } }],
        must: query.trim() ? [{ multi_match: { query, fields: ['recipient', 'sender', 'subject', 'batchId'], fuzziness: 'AUTO' } }] : [{ match_all: {} }],
      },
    },
    sort: [{ scheduledAt: 'desc' }],
    size: 100,
  });
  return result.hits.hits.map(hit => hit._source);
}