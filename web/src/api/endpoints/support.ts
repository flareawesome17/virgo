import { api } from '../client';

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  subject: string;
  status: TicketStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  messages?: number;
  /** 1–5, once the customer has rated a resolved ticket. Absent on old payloads. */
  rating?: number | null;
  rating_comment?: string | null;
  rated_at?: string | null;
}

/** A file sent with a message, by the customer or by support. */
export interface SupportAttachment {
  id: string;
  name: string;
  content_type: string;
  size_bytes: number;
  /** Signed for an hour: draws an image, opens a PDF. Null when storage is off. */
  url: string | null;
  /** The same file, saved under its own name. */
  download_url?: string | null;
}

export interface SupportMessage {
  id: string;
  author_type: 'user' | 'admin';
  author_name: string;
  body: string;
  created_at: string;
  /** Absent on payloads from before attachments, so read it with `?? []`. */
  attachments?: SupportAttachment[];
}

/**
 * What can be attached. Mirrors SUPPORT_FILE_TYPES in
 * api/src/storage/support-files.service.ts — change both together.
 */
export const SUPPORT_FILE_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];
export const MAX_SUPPORT_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SUPPORT_FILES = 5;

/** A signed upload for one file. `id` is what the message sends. */
export interface SupportUploadTicket {
  id: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

/** "2.4 MB", "830 KB" — a file's size as it reads beside its name. */
export function fileSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Why a file cannot be attached, or null when it can. */
export function supportFileProblem(file: { type: string; size: number }): string | null {
  if (!SUPPORT_FILE_TYPES.includes(file.type)) {
    return 'Attach a photo (JPEG, PNG, WebP or GIF) or a PDF.';
  }
  if (file.size > MAX_SUPPORT_FILE_BYTES) return 'Each file has to be under 10 MB.';
  if (file.size <= 0) return 'That file appears to be empty.';
  return null;
}

/**
 * Customer support, from the customer's side.
 *
 * Every route is scoped server-side by the authenticated account — a ticket id
 * alone is never enough to read a thread, or one leaked number would expose
 * somebody else's conversation with support.
 *
 * Internal notes written by staff are filtered out in SQL before they reach
 * this client, so nothing here can accidentally render one — nor their files.
 */
export const supportApi = {
  /** Opens a ticket. Rate limited server-side to 5 an hour. */
  open(subject: string, body: string, attachments?: string[]): Promise<{ id: string }> {
    return api.post('/support/tickets', {
      body: { subject, body, ...(attachments?.length ? { attachments } : {}) },
    });
  },

  list(): Promise<SupportTicket[]> {
    return api.get('/support/tickets');
  },

  thread(id: string): Promise<{
    ticket: SupportTicket;
    messages: SupportMessage[];
  }> {
    return api.get(`/support/tickets/${id}`);
  },

  reply(id: string, body: string, attachments?: string[]): Promise<{ ok: true }> {
    return api.post(`/support/tickets/${id}/reply`, {
      body: { body, ...(attachments?.length ? { attachments } : {}) },
    });
  },

  /**
   * Signs one file's upload. Put the bytes to `uploadUrl` with
   * `requiredHeaders`, then send `id` with the message. Unsent, it is gone a
   * day later.
   */
  signAttachment(input: {
    contentType: string;
    contentLength: number;
    name?: string;
  }): Promise<SupportUploadTicket> {
    return api.post('/support/attachments', { body: input });
  },

  /** How it went, 1–5, once the ticket is resolved or closed. */
  rate(
    id: string,
    rating: number,
    comment?: string,
  ): Promise<{ rating: number; comment: string | null }> {
    return api.post(`/support/tickets/${id}/rating`, {
      body: { rating, ...(comment?.trim() ? { comment: comment.trim() } : {}) },
    });
  },
};
