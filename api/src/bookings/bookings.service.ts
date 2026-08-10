import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { NotifyService } from '../notifications/notify.service';

/** The two people on a booking, and which one the reader is. */
export type BookingSide = 'poster' | 'creative';

export interface Booking {
  id: string;
  applicationId: string;
  postId: string;
  postTitle: string;
  postSlug: string;
  /** Which side the reader is on. Every screen branches on this. */
  yourSide: BookingSide;
  /** The other person, as much of them as is public. */
  otherParty: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    handle: string | null;
  };
  role: string | null;
  eventDate: string | null;
  location: string | null;
  /** Centavos, like every other money field. */
  rateMinor: number | null;
  currency: string;
  notes: string | null;
  posterConfirmedAt: string | null;
  creativeConfirmedAt: string | null;
  /** Whether *you* have confirmed the terms as they currently stand. */
  youConfirmed: boolean;
  /** Whether the other side has. */
  theyConfirmed: boolean;
  /** Set once both agree. Any edit clears it. */
  lockedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BookingRow {
  id: string;
  application_id: string;
  post_id: string;
  poster_id: string;
  creative_id: string;
  role: string | null;
  event_date: string | null;
  location: string | null;
  rate_minor: number | null;
  currency: string;
  notes: string | null;
  poster_confirmed_at: Date | null;
  creative_confirmed_at: Date | null;
  locked_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
  post_title: string;
  post_slug: string;
  other_id: string;
  other_name: string | null;
  other_email: string;
  other_avatar_url: string | null;
  other_handle: string | null;
  conversation_id: string | null;
}

/** What either side may change while the booking is unlocked. */
export interface BookingPatch {
  role?: string | null;
  eventDate?: string | null;
  location?: string | null;
  rateMinor?: number | null;
  notes?: string | null;
}

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notifier: NotifyService,
  ) {}

  /**
   * Everything the reader needs, from either side.
   *
   * `$1` appears throughout as "me", which is what makes one query serve both
   * the poster's view and the creative's — the alternative is two nearly
   * identical selects that drift.
   */
  private select(): string {
    return `
      select b.*,
             p.title as post_title,
             p.slug  as post_slug,
             o.id    as other_id,
             o.display_name as other_name,
             o.email        as other_email,
             o.avatar_url   as other_avatar_url,
             case when o.public_profile then o.handle end as other_handle,
             (select c.id
                from conversations c
                join conversation_participants cp1
                  on cp1.conversation_id = c.id and cp1.user_id = b.poster_id
                join conversation_participants cp2
                  on cp2.conversation_id = c.id and cp2.user_id = b.creative_id
               where c.is_group = false
               limit 1) as conversation_id
        from job_bookings b
        join hiring_posts p on p.id = b.post_id
        join users o
          on o.id = case when b.poster_id = $1 then b.creative_id else b.poster_id end`;
  }

  private present(row: BookingRow, viewerId: string): Booking {
    const yourSide: BookingSide =
      row.poster_id === viewerId ? 'poster' : 'creative';
    const youConfirmed =
      yourSide === 'poster' ? !!row.poster_confirmed_at : !!row.creative_confirmed_at;
    const theyConfirmed =
      yourSide === 'poster' ? !!row.creative_confirmed_at : !!row.poster_confirmed_at;

    return {
      id: row.id,
      applicationId: row.application_id,
      postId: row.post_id,
      postTitle: row.post_title,
      postSlug: row.post_slug,
      yourSide,
      otherParty: {
        id: row.other_id,
        displayName: row.other_name?.trim() || row.other_email.split('@')[0],
        avatarUrl: row.other_avatar_url,
        handle: row.other_handle,
      },
      role: row.role,
      eventDate: row.event_date,
      location: row.location,
      rateMinor: row.rate_minor,
      currency: row.currency,
      notes: row.notes,
      posterConfirmedAt: row.poster_confirmed_at?.toISOString() ?? null,
      creativeConfirmedAt: row.creative_confirmed_at?.toISOString() ?? null,
      youConfirmed,
      theyConfirmed,
      lockedAt: row.locked_at?.toISOString() ?? null,
      cancelledAt: row.cancelled_at?.toISOString() ?? null,
      cancelReason: row.cancel_reason,
      conversationId: row.conversation_id,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /**
   * Creates the booking that acceptance implies.
   *
   * Called from inside HiringService.respond's transaction, so a booking and
   * an acceptance land together or not at all — an accepted application with
   * no booking would be exactly the state this feature exists to remove.
   *
   * Pre-filled from the post: whatever was advertised is the obvious opening
   * position, and both sides can change it before either confirms.
   */
  async createForAcceptance(
    client: PoolClient,
    input: {
      applicationId: string;
      postId: string;
      posterId: string;
      creativeId: string;
      role: string | null;
      eventDate: string | null;
      location: string | null;
      rateMinor: number | null;
    },
  ): Promise<void> {
    await client.query(
      `insert into job_bookings
         (application_id, post_id, poster_id, creative_id,
          role, event_date, location, rate_minor)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       -- Re-accepting an application that already has one must not fail the
       -- whole transaction.
       on conflict (application_id) do nothing`,
      [
        input.applicationId,
        input.postId,
        input.posterId,
        input.creativeId,
        input.role,
        input.eventDate,
        input.location,
        input.rateMinor,
      ],
    );
  }

  /** Every booking the caller is on, either side. */
  async list(userId: string): Promise<Booking[]> {
    const rows = await this.db.query<BookingRow>(
      `${this.select()}
        where b.poster_id = $1 or b.creative_id = $1
        order by b.cancelled_at nulls first, b.event_date nulls last, b.created_at desc
        limit 100`,
      [userId],
    );
    return rows.map((row) => this.present(row, userId));
  }

  /**
   * One booking.
   *
   * Scoped by participation, never by id alone — a booking id must not be
   * enough to read what two other people agreed and what it pays.
   */
  async byId(userId: string, id: string): Promise<Booking> {
    const row = await this.db.queryOne<BookingRow>(
      `${this.select()} where b.id = $2 and (b.poster_id = $1 or b.creative_id = $1)`,
      [userId, id],
    );
    if (!row) throw new NotFoundException('Booking not found');
    return this.present(row, userId);
  }

  private async requireOpen(userId: string, id: string): Promise<BookingRow> {
    const row = await this.db.queryOne<BookingRow>(
      `${this.select()} where b.id = $2 and (b.poster_id = $1 or b.creative_id = $1)`,
      [userId, id],
    );
    if (!row) throw new NotFoundException('Booking not found');
    if (row.cancelled_at) {
      throw new BadRequestException('This booking was cancelled');
    }
    return row;
  }

  /**
   * Changes the terms, and un-agrees them.
   *
   * Clearing both confirmations is the entire mechanism. It is why this is
   * worth having: neither person can alter the rate or the date on something
   * already agreed without the other being asked again. A locked booking is
   * editable for the same reason — plans change — but editing unlocks it.
   */
  async update(userId: string, id: string, patch: BookingPatch): Promise<Booking> {
    const row = await this.requireOpen(userId, id);

    const touches = (Object.keys(patch) as (keyof BookingPatch)[]).filter(
      (k) => patch[k] !== undefined,
    );
    if (touches.length === 0) {
      throw new BadRequestException('Nothing to change');
    }
    if (patch.rateMinor != null && patch.rateMinor < 0) {
      throw new BadRequestException('A rate cannot be negative');
    }

    await this.db.query(
      `update job_bookings
          set role       = case when $3::boolean then $4::text else role end,
              event_date = case when $5::boolean then $6::date else event_date end,
              location   = case when $7::boolean then $8::text else location end,
              rate_minor = case when $9::boolean then $10::int else rate_minor end,
              notes      = case when $11::boolean then $12::text else notes end,
              -- The terms moved, so nobody has agreed to these ones yet.
              poster_confirmed_at   = null,
              creative_confirmed_at = null,
              locked_at             = null
        where id = $1 and (poster_id = $2 or creative_id = $2)`,
      [
        id,
        userId,
        patch.role !== undefined,
        patch.role ?? null,
        patch.eventDate !== undefined,
        patch.eventDate ?? null,
        patch.location !== undefined,
        patch.location ?? null,
        patch.rateMinor !== undefined,
        patch.rateMinor ?? null,
        patch.notes !== undefined,
        patch.notes ?? null,
      ],
    );

    const other = row.poster_id === userId ? row.creative_id : row.poster_id;
    await this.notifier.notify([other], {
      topic: 'booking',
      title: row.locked_at ? 'Booking terms changed' : 'Booking updated',
      body: row.locked_at
        ? `The terms for “${row.post_title}” changed. Confirm them again.`
        : `The booking for “${row.post_title}” was updated.`,
      data: { type: 'booking', bookingId: id },
    });

    return this.byId(userId, id);
  }

  /**
   * Agree to the terms as they currently stand.
   *
   * The second confirmation locks it. Confirming twice is a no-op rather than
   * an error — a double tap should not be a failure.
   */
  async confirm(userId: string, id: string): Promise<Booking> {
    const row = await this.requireOpen(userId, id);
    const side: BookingSide = row.poster_id === userId ? 'poster' : 'creative';
    const column =
      side === 'poster' ? 'poster_confirmed_at' : 'creative_confirmed_at';
    const already =
      side === 'poster' ? row.poster_confirmed_at : row.creative_confirmed_at;
    if (already) return this.byId(userId, id);

    const updated = await this.db.queryOne<{ locked_at: Date | null }>(
      `update job_bookings
          set ${column} = now(),
              -- Locked exactly when the other side is already in. Computed
              -- here rather than in a second statement so two simultaneous
              -- confirmations cannot both see the other as unconfirmed.
              locked_at = case
                when ${side === 'poster' ? 'creative_confirmed_at' : 'poster_confirmed_at'} is not null
                then now() else locked_at end
        where id = $1 and (poster_id = $2 or creative_id = $2)
        returning locked_at`,
      [id, userId],
    );

    const other = row.poster_id === userId ? row.creative_id : row.poster_id;
    const locked = !!updated?.locked_at;
    await this.notifier.notify([other], {
      topic: 'booking',
      title: locked ? 'Booking agreed' : 'Booking confirmed',
      body: locked
        ? `You and ${row.other_name?.trim() || 'they'} both confirmed “${row.post_title}”.`
        : `They confirmed the booking for “${row.post_title}”. Your turn.`,
      data: { type: 'booking', bookingId: id },
    });

    if (locked) this.logger.log(`booking ${id} agreed by both sides`);
    return this.byId(userId, id);
  }

  /**
   * Cancels, without deleting.
   *
   * A booking that fell through is part of what happened. Removing the row
   * would lose the fact that it was agreed at all, which is the one thing
   * somebody would later want to point at.
   */
  async cancel(userId: string, id: string, reason?: string): Promise<Booking> {
    const row = await this.requireOpen(userId, id);

    await this.db.query(
      `update job_bookings
          set cancelled_at = now(), cancelled_by = $2, cancel_reason = $3
        where id = $1 and (poster_id = $2 or creative_id = $2)`,
      [id, userId, reason?.trim().slice(0, 500) ?? null],
    );

    const other = row.poster_id === userId ? row.creative_id : row.poster_id;
    await this.notifier.notify([other], {
      topic: 'booking',
      title: 'Booking cancelled',
      body: `The booking for “${row.post_title}” was cancelled.`,
      data: { type: 'booking', bookingId: id },
    });

    return this.byId(userId, id);
  }

  /** The booking for one application, if acceptance created one. */
  async forApplication(
    userId: string,
    applicationId: string,
  ): Promise<Booking | null> {
    const row = await this.db.queryOne<BookingRow>(
      `${this.select()}
        where b.application_id = $2 and (b.poster_id = $1 or b.creative_id = $1)`,
      [userId, applicationId],
    );
    return row ? this.present(row, userId) : null;
  }

  /** Refuses a caller who is on neither side. Used by the controller guard. */
  async assertParticipant(userId: string, id: string): Promise<void> {
    const row = await this.db.queryOne<{ id: string }>(
      'select id from job_bookings where id = $1 and (poster_id = $2 or creative_id = $2)',
      [id, userId],
    );
    if (!row) throw new ForbiddenException('Not your booking');
  }
}
