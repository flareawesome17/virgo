import { api } from '../client';
import type { Album, AlbumStatus, ListParams, ListResponse } from '../types';

export interface ListAlbumsParams extends ListParams {
  workspace_id?: string;
  status?: AlbumStatus;
  /** Matches the album's name, description, or its workspace's name. */
  search?: string;
}

export interface CreateAlbumInput {
  id?: string;
  workspace_id: string;
  name: string;
  description?: string | null;
  cover_url?: string | null;
  status?: AlbumStatus;
  /** Days after each upload. Null, with no date, keeps the files. */
  retention_days?: number | null;
  /** Or the last day the files are kept, YYYY-MM-DD. */
  retention_until?: string | null;
}

export type UpdateAlbumInput = Partial<Omit<CreateAlbumInput, 'id'>> & {
  /** A photograph already in the album, or null for the newest image. */
  cover_key?: string | null;
};

/**
 * How long an album keeps its files.
 *
 * `days` removes each file that many days after it was uploaded. `until`
 * keeps everything through `date` (YYYY-MM-DD, the last day, counted in
 * Manila) and removes it all after. The server stores one or the other.
 */
export type Retention =
  | { mode: 'forever' }
  | { mode: 'days'; days: number }
  | { mode: 'until'; date: string };

/** The server's ceiling: ten years, as days or as a date. */
export const MAX_RETENTION_DAYS = 3650;

/** The windows offered first. Any other number up to the ceiling can be typed. */
export const RETENTION_DAY_PRESETS = [7, 30, 90, 180, 365] as const;

export function retentionOf(
  album: Pick<Album, 'retention_days'> & { retention_until?: string | null },
): Retention {
  if (album.retention_until) return { mode: 'until', date: album.retention_until };
  if (album.retention_days && album.retention_days > 0) {
    return { mode: 'days', days: album.retention_days };
  }
  return { mode: 'forever' };
}

/** What to send for a setting. Both fields, so choosing one clears the other. */
export function retentionInput(retention: Retention): {
  retention_days: number | null;
  retention_until: string | null;
} {
  if (retention.mode === 'days') return { retention_days: retention.days, retention_until: null };
  if (retention.mode === 'until') return { retention_days: null, retention_until: retention.date };
  return { retention_days: null, retention_until: null };
}

/** A setting that can be saved: a window in range, or a date chosen. */
export function retentionReady(retention: Retention): boolean {
  if (retention.mode === 'days') {
    return (
      Number.isInteger(retention.days) &&
      retention.days >= 1 &&
      retention.days <= MAX_RETENTION_DAYS
    );
  }
  if (retention.mode === 'until') return /^\d{4}-\d{2}-\d{2}$/.test(retention.date);
  return true;
}

export function sameRetention(a: Retention, b: Retention): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'days' && b.mode === 'days') return a.days === b.days;
  if (a.mode === 'until' && b.mode === 'until') return a.date === b.date;
  return true;
}

/** "7 days", "6 months", "1 year", "45 days". */
export function retentionDaysLabel(days: number): string {
  if (days >= 365 && days % 365 === 0) {
    const years = days / 365;
    return `${years} ${years === 1 ? 'year' : 'years'}`;
  }
  if (days === 180) return '6 months';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Today on this device, YYYY-MM-DD. */
export function todayDateKey(now = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** A YYYY-MM-DD `days` later, by the calendar. */
export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Whole days from one YYYY-MM-DD to another. */
export function daysBetweenKeys(from: string, to: string): number {
  const at = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/** "Tue, Jan 5, 2027". Noon, so no zone can tip it into another day. */
export function retentionDateLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** What the setting does, in a sentence. */
export function retentionSummary(retention: Retention): string {
  if (retention.mode === 'days') {
    return `Each file is removed ${retentionDaysLabel(retention.days)} after it was uploaded.`;
  }
  if (retention.mode === 'until') {
    return `Everything is kept until ${retentionDateLabel(retention.date)}, then removed.`;
  }
  return 'Kept until you delete them.';
}

/** The short form, for a label on the album. Null when nothing is removed. */
export function retentionBadge(retention: Retention): string | null {
  if (retention.mode === 'days') return `Removed ${retentionDaysLabel(retention.days)} after upload`;
  if (retention.mode === 'until') return `Kept until ${retentionDateLabel(retention.date)}`;
  return null;
}

export const albumsApi = {
  list(params: ListAlbumsParams = {}): Promise<ListResponse<Album>> {
    return api.get<ListResponse<Album>>('/albums', { query: params });
  },

  get(id: string): Promise<Album> {
    return api.get<Album>(`/albums/${id}`);
  },

  create(input: CreateAlbumInput): Promise<Album> {
    return api.post<Album>('/albums', { body: input });
  },

  update(id: string, input: UpdateAlbumInput): Promise<Album> {
    return api.patch<Album>(`/albums/${id}`, { body: input });
  },

  remove(id: string): Promise<void> {
    return api.delete<void>(`/albums/${id}`);
  },
};
