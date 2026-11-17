import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/** Saved replies one account can keep. Enough for a price list and the usual answers. */
export const MAX_SAVED_REPLIES = 20;

export interface SavedReply {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

interface SavedReplyRow {
  id: string;
  title: string;
  body: string;
  created_at: Date;
  updated_at: Date;
}

function present(row: SavedReplyRow): SavedReply {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * The answers a creative gives every enquiry — rates, what's included, the
 * down payment — saved once and dropped into a message.
 *
 * Inserted into the message box, never sent on their own, so the person can
 * change the date or the name before sending. Only ever the owner's.
 */
@Injectable()
export class SavedRepliesService {
  constructor(private readonly db: DatabaseService) {}

  async list(userId: string): Promise<SavedReply[]> {
    const rows = await this.db.query<SavedReplyRow>(
      `select id, title, body, created_at, updated_at
         from saved_replies where user_id = $1
        order by created_at, id`,
      [userId],
    );
    return rows.map(present);
  }

  async create(userId: string, title: string, body: string): Promise<SavedReply> {
    const name = title.trim();
    const text = body.trim();
    if (!name || !text) throw new BadRequestException('Give it a name and some words');

    // Counted and inserted in one statement, so two quick saves cannot both
    // squeeze in at nineteen.
    const row = await this.db.queryOne<SavedReplyRow>(
      `insert into saved_replies (user_id, title, body)
       select $1, $2, $3
        where (select count(*) from saved_replies where user_id = $1) < $4
       returning id, title, body, created_at, updated_at`,
      [userId, name, text, MAX_SAVED_REPLIES],
    );
    if (!row) {
      throw new BadRequestException(
        `You can keep up to ${MAX_SAVED_REPLIES} saved replies. Delete one to add another.`,
      );
    }
    return present(row);
  }

  async update(
    userId: string,
    id: string,
    patch: { title?: string; body?: string },
  ): Promise<SavedReply> {
    const name = patch.title?.trim();
    const text = patch.body?.trim();
    if (name === '' || text === '') throw new BadRequestException('It cannot be empty');

    const row = await this.db.queryOne<SavedReplyRow>(
      `update saved_replies
          set title = coalesce($3, title), body = coalesce($4, body)
        where id = $1 and user_id = $2
        returning id, title, body, created_at, updated_at`,
      [id, userId, name ?? null, text ?? null],
    );
    if (!row) throw new NotFoundException('Saved reply not found');
    return present(row);
  }

  async remove(userId: string, id: string): Promise<{ deleted: boolean }> {
    const rows = await this.db.query<{ id: string }>(
      'delete from saved_replies where id = $1 and user_id = $2 returning id',
      [id, userId],
    );
    if (rows.length === 0) throw new NotFoundException('Saved reply not found');
    return { deleted: true };
  }
}
