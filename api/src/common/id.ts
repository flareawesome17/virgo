import { randomUUID } from 'node:crypto';

/**
 * Ids for the domain tables are `text`, matching the original Supabase schema
 * where the client generated them. A UUID string satisfies that column and
 * removes any chance of collision between clients.
 */
export function generateId(): string {
  return randomUUID();
}
