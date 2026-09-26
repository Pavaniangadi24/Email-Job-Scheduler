import type { EmailRecord, User } from '../types';

const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, credentials: 'include', headers: { 'content-type': 'application/json', ...init?.headers } });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ user: User }>('/api/auth/me'),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  emails: (status: 'scheduled' | 'sent') => request<{ emails: EmailRecord[] }>(`/api/emails?status=${status}`),
  search: (query: string) => request<{ emails: EmailRecord[] }>(`/api/emails/search?q=${encodeURIComponent(query)}`),
  schedule: (payload: { sender: string; subject: string; body: string; recipients: string[]; startAt: string; delayMs: number; hourlyLimit: number }, key: string) => request('/api/emails', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(payload) }),
  disconnectSlack: () => request<void>('/api/integrations/slack', { method: 'DELETE' }),
};

export const googleLoginUrl = `${baseUrl}/api/auth/google`;
export const slackConnectUrl = `${baseUrl}/api/integrations/slack/connect`;