export interface User { id: string; name: string; email: string; avatarUrl?: string | null; slackConnection?: { teamName?: string | null } | null; }
export interface EmailRecord {
  id: string; recipient: string; sender: string; subject: string; scheduledAt: string;
  sentAt: string | null; status: 'SCHEDULED' | 'PROCESSING' | 'SENT' | 'FAILED'; error?: string | null;
}