import { redis } from '../infra/redis';

const reserveScript = `
local key = KEYS[1]
local campaignKey = KEYS[2]
local member = ARGV[1]
local now = tonumber(ARGV[2])
local spacing = tonumber(ARGV[3])
local globalLimit = tonumber(ARGV[4])
local campaignLimit = tonumber(ARGV[5])
local existing = redis.call('ZSCORE', key, member)
if existing then return {tonumber(existing), 0} end
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - 3600000)
redis.call('ZREMRANGEBYSCORE', campaignKey, '-inf', now - 3600000)
local last = redis.call('ZREVRANGE', key, 0, 0, 'WITHSCORES')
local candidate = now
local limited = 0
if #last > 0 then candidate = math.max(candidate, tonumber(last[2]) + spacing) end
while true do
  local globalCount = redis.call('ZCOUNT', key, candidate - 3600000, candidate)
  local campaignCount = redis.call('ZCOUNT', campaignKey, candidate - 3600000, candidate)
  if globalCount < globalLimit and campaignCount < campaignLimit then break end
  limited = 1
  local limitingKey = globalCount >= globalLimit and key or campaignKey
  local oldest = redis.call('ZRANGEBYSCORE', limitingKey, candidate - 3600000, candidate, 'WITHSCORES', 'LIMIT', 0, 1)
  candidate = tonumber(oldest[2]) + 3600001
end
redis.call('ZADD', key, candidate, member)
redis.call('ZADD', campaignKey, candidate, member)
local ttl = math.max(7200000, candidate - now + 3600000)
redis.call('PEXPIRE', key, ttl)
redis.call('PEXPIRE', campaignKey, ttl)
return {candidate, limited}
`;

export async function reserveSenderSlot(sender: string, batchId: string, emailId: string, spacingMs: number, globalLimit: number, campaignLimit: number) {
  const normalizedSender = sender.toLowerCase();
  const result = await redis.eval(reserveScript, 2, `sender-slots:${normalizedSender}`, `campaign-slots:${normalizedSender}:${batchId}`, emailId, Date.now(), spacingMs, globalLimit, campaignLimit);
  const [scheduledAt, hourlyLimitHit] = result as [number, number];
  return { scheduledAt: Number(scheduledAt), hourlyLimitHit: Number(hourlyLimitHit) === 1 };
}