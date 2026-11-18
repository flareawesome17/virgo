import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { AlbumShareService } from '../../albums/share/album-share.service';
import { BookingsService } from '../../bookings/bookings.service';
import { DatabaseService } from '../../database/database.service';
import { FriendsService } from '../../friends/friends.service';
import { MailConfig } from '../../mail/mail.config';
import { MoneyPackagesService } from '../../money/money-packages.service';
import { pesoText } from '../../money/money-nudges.service';
import { EventAttendeesService } from '../../schedule-events/event-attendees.service';
import { ScheduleEventsService } from '../../schedule-events/schedule-events.service';
import { ShowcasesService } from '../../showcases/showcases.service';
import { MessagesService, type CardFiller, type MessageRow } from '../messages.service';
import { CARD_KINDS, MAX_CARD_FILES, type CardKind, type PlanType } from './card-kinds';

/** What a person sends: which thing, by kind. Validated by the controller's DTO. */
export type SendCardInput =
  | { kind: 'album-photos'; albumId: string; keys: string[]; clientId?: string }
  | { kind: 'booking'; bookingId: string; clientId?: string }
  | { kind: 'job-post'; postId: string; clientId?: string }
  | { kind: 'post'; showcaseId: string; clientId?: string }
  | { kind: 'package'; packageId: string; clientId?: string }
  | {
      kind: 'date-plan';
      type: PlanType;
      title: string;
      date: string;
      time?: string;
      place?: string;
      /** Everyone else in the chat you are connected with. */
      inviteEveryone: boolean;
      clientId?: string;
    };

/** "Shoot", not "event": the calendar's word for a shoot is 'event'. */
const PLAN_TYPE_NAMES: Record<PlanType, string> = {
  event: 'Shoot',
  meeting: 'Meeting',
  editing: 'Editing',
  review: 'Review',
  delivery: 'Delivery',
};

/** "Sat, Dec 6" from "2026-12-06", without moving the day across a time zone. */
export function dayLabel(date: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date ?? '');
  if (!m) return null;
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return day.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "4:00 PM" from "16:00" or "16:00:00". */
export function timeLabel(time: string | null | undefined): string | null {
  const m = /^(\d{2}):(\d{2})/.exec(time ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

function contextId(row: MessageRow, key: string): string | null {
  const value = row.context?.[key];
  return typeof value === 'string' && value ? value : null;
}

/** The token at the end of a client link's address. */
function tokenOf(url: string): string | null {
  const m = /\/s\/([A-Za-z0-9_-]{16,128})\/?$/.exec(url);
  return m ? m[1] : null;
}

/**
 * Cards: Virgo things shared in a chat.
 *
 * Sending checks the sender may share the thing — an album they manage, a
 * booking they are on, their own package — and writes a message of the card's
 * kind with a plain line as its body. Reading fills each card in as the thing
 * is now, as its sender may see it: the card is the sender showing it to the
 * chat. A thing that is gone, or no longer the sender's to show, fills in as
 * null and the apps say so.
 */
@Injectable()
export class ChatCardsService implements CardFiller, OnModuleInit {
  private readonly log = new Logger(ChatCardsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly messages: MessagesService,
    private readonly shares: AlbumShareService,
    private readonly bookings: BookingsService,
    private readonly packages: MoneyPackagesService,
    private readonly showcases: ShowcasesService,
    private readonly events: ScheduleEventsService,
    private readonly attendees: EventAttendeesService,
    private readonly friends: FriendsService,
    private readonly mail: MailConfig,
  ) {}

  onModuleInit(): void {
    this.messages.useCardFiller(this);
  }

  // ─── Sending ───────────────────────────────────────────────────────────────

  async send(userId: string, conversationId: string, input: SendCardInput): Promise<MessageRow> {
    // A client link or a calendar entry is made before the message; neither
    // should exist for a chat that would refuse it.
    await this.messages.assertCanSend(userId, conversationId);
    const { body, context } = await this.prepare(userId, conversationId, input);
    return this.messages.send(userId, conversationId, body, {
      clientId: input.clientId,
      card: { kind: input.kind, context },
    });
  }

  private async prepare(
    userId: string,
    conversationId: string,
    input: SendCardInput,
  ): Promise<{ body: string; context: Record<string, unknown> }> {
    switch (input.kind) {
      case 'album-photos': {
        const keys = [...new Set(input.keys)];
        if (keys.length > MAX_CARD_FILES) {
          throw new BadRequestException(`Choose up to ${MAX_CARD_FILES} at a time`);
        }
        // Manage on the album, every key in it: the same link the album's own
        // "Share a selection" makes, reused when it is the same selection.
        const link = await this.shares.createFilesLink(userId, input.albumId, keys);
        const album = await this.db.queryOne<{ name: string; photos: number; films: number }>(
          `select a.name,
                  count(f.key) filter (where f.content_type like 'image/%')::int as photos,
                  count(f.key) filter (where f.content_type like 'video/%')::int as films
             from albums a
             left join user_files f on f.album_id = a.id and f.key = any($2::text[])
            where a.id = $1
            group by a.name`,
          [input.albumId, keys],
        );
        const count = link.fileCount || keys.length;
        // "12 photos", "2 films", or "14 files" for a mix.
        const noun =
          album?.photos === count
            ? count === 1 ? 'photo' : 'photos'
            : album?.films === count
              ? count === 1 ? 'film' : 'films'
              : count === 1 ? 'file' : 'files';
        return {
          body: `Shared ${count} ${noun} from ${album?.name ?? 'an album'}\n${link.url}`,
          context: { albumId: input.albumId, linkId: link.id, url: link.url },
        };
      }

      case 'booking': {
        // Yours either way, poster or hired; 404 otherwise.
        const b = await this.bookings.byId(userId, input.bookingId);
        const line = [
          b.role ? `${b.role} for “${b.postTitle}”` : `“${b.postTitle}”`,
          dayLabel(b.eventDate),
          b.location,
          b.rateMinor != null ? pesoText(b.rateMinor) : null,
        ]
          .filter(Boolean)
          .join(' · ');
        return {
          body: `Booking: ${line}\n${this.mail.appUrl}/bookings/${b.id}`,
          context: { bookingId: b.id },
        };
      }

      case 'job-post': {
        const post = await this.db.queryOne<{ id: string; slug: string; title: string }>(
          `select p.id, p.slug, p.title
             from hiring_posts p
             join users u on u.id = p.user_id
            where p.id = $1 and p.hidden_at is null and u.suspended_at is null
              -- Your own in any state; somebody else's while it is open.
              and (p.user_id = $2 or p.status = 'open')`,
          [input.postId, userId],
        );
        if (!post) throw new NotFoundException('Job post not found');
        return {
          body: `Job post: ${post.title}\n${this.mail.siteUrl}/jobs/${post.slug}`,
          context: { postId: post.id },
        };
      }

      case 'post': {
        // As you may see it: your own, or one shown to you.
        const post = await this.showcases.one(userId, input.showcaseId);
        if (!post.publishedAt || post.unpublishedAt || post.hiddenAt) {
          throw new NotFoundException('Post not found');
        }
        return {
          body: `Post: ${post.title?.trim() || `by ${post.maker.displayName}`}\n${this.mail.siteUrl}/p/${post.id}`,
          context: { showcaseId: post.id },
        };
      }

      case 'package': {
        // Only your own. Sending it shares its statement, the page "Open
        // statement" goes to; one already shared keeps its link.
        const { package: pkg } = await this.packages.get(userId, input.packageId);
        const { url } = await this.packages.share(userId, input.packageId);
        const money = pkg.paidInFull
          ? `paid in full, ${pesoText(pkg.totalMinor)}`
          : `paid ${pesoText(pkg.receivedMinor)}, ${pesoText(pkg.balanceMinor)} left`;
        return {
          body: `Package: ${pkg.title} · ${money}\n${url}`,
          context: { packageId: pkg.id },
        };
      }

      case 'date-plan':
        return this.preparePlan(userId, conversationId, input);
    }
  }

  /**
   * Puts the date on the sender's calendar and invites the chat. Only people
   * the sender is connected with can be invited — the calendar's own rule —
   * so in a group with somebody they are not, that person sees the card
   * without the buttons.
   */
  private async preparePlan(
    userId: string,
    conversationId: string,
    input: Extract<SendCardInput, { kind: 'date-plan' }>,
  ): Promise<{ body: string; context: Record<string, unknown> }> {
    const title = input.title.trim() || PLAN_TYPE_NAMES[input.type];
    const event = await this.events.create(userId, {
      title,
      event_date: input.date,
      ...(input.time ? { event_time: input.time } : {}),
      event_type: input.type,
      ...(input.place?.trim() ? { location: input.place.trim() } : {}),
    });

    if (input.inviteEveryone) {
      const others = await this.db.query<{ user_id: string }>(
        `select user_id from conversation_participants
          where conversation_id = $1 and user_id <> $2`,
        [conversationId, userId],
      );
      const connected: string[] = [];
      for (const o of others) {
        if (await this.friends.areFriends(userId, o.user_id)) connected.push(o.user_id);
      }
      if (connected.length > 0) {
        try {
          await this.attendees.invite(userId, event.id, connected);
        } catch (err) {
          // A block between two of them: no half-made date left behind.
          await this.db.query('delete from schedule_events where id = $1 and user_id = $2', [event.id, userId]);
          throw err;
        }
      }
    }

    const when = [dayLabel(event.event_date), timeLabel(event.event_time)].filter(Boolean).join(', ');
    // "Shoot: Ocular at Sirao", or just "Shoot" when it was left untitled.
    const named = title === PLAN_TYPE_NAMES[input.type] ? title : `${PLAN_TYPE_NAMES[input.type]}: ${title}`;
    const line = [named, when, event.location].filter(Boolean).join(' · ');
    return {
      body: `${line}\nAnswer it in your Schedule on Virgo`,
      context: { eventId: event.id },
    };
  }

  // ─── Answering a date ──────────────────────────────────────────────────────

  /**
   * Going or can't go, from the card. The calendar's own answer — Going puts
   * it on your Schedule, and the organiser is told — and then the card's new
   * count goes to everyone in the chat.
   */
  async answer(userId: string, conversationId: string, messageId: string, going: boolean): Promise<MessageRow> {
    const message = await this.messages.visibleMessage(userId, conversationId, messageId);
    const eventId = typeof message.context?.eventId === 'string' ? message.context.eventId : null;
    if (message.kind !== 'date-plan' || message.deleted_at || !eventId) {
      throw new BadRequestException('That message is not a date to answer');
    }
    await this.attendees.respond(userId, eventId, going);
    const row = await this.messages.announceChanged(userId, conversationId, messageId);
    if (!row) throw new NotFoundException('Message not found');
    return row;
  }

  // ─── Filling in ────────────────────────────────────────────────────────────

  async fill(rows: MessageRow[]): Promise<void> {
    const byKind = new Map<CardKind, MessageRow[]>();
    for (const row of rows) {
      // Only the cards this service fills. Typed words, notices, the app's own
      // cards, pay cards, and photos and files (ChatFilesService) are not its.
      if (!row.kind || !(CARD_KINDS as readonly string[]).includes(row.kind)) {
        continue;
      }
      // Deleted for everyone keeps nothing, as a pay card does.
      if (row.deleted_at) {
        row.context = null;
        continue;
      }
      const kind = row.kind as CardKind;
      const list = byKind.get(kind) ?? [];
      list.push(row);
      byKind.set(kind, list);
    }

    const fillers: Record<CardKind, (cards: MessageRow[]) => Promise<void>> = {
      'album-photos': (c) => this.fillAlbums(c),
      booking: (c) => this.fillBookings(c),
      'job-post': (c) => this.fillJobs(c),
      post: (c) => this.fillPosts(c),
      package: (c) => this.fillPackages(c),
      'date-plan': (c) => this.fillPlans(c),
    };
    await Promise.all(
      [...byKind].map(async ([kind, cards]) => {
        try {
          await fillers[kind](cards);
        } catch (err) {
          // One kind failing to fill must not take the thread down with it.
          this.log.warn(`Could not fill ${kind} cards: ${(err as Error).message}`);
          for (const row of cards) row.context = { ...row.context, unavailable: true };
        }
      }),
    );
  }

  private async fillAlbums(cards: MessageRow[]): Promise<void> {
    await Promise.all(
      cards.map(async (row) => {
        const url = contextId(row, 'url');
        const token = url ? tokenOf(url) : null;
        let album: Record<string, unknown> | null = null;
        if (token) {
          try {
            const p = await this.shares.preview(token);
            album = {
              name: p.albumName,
              sectionName: p.sectionName,
              total: p.total,
              counts: p.counts,
              thumbs: p.thumbs,
              blurs: p.blurs,
            };
          } catch {
            // Turned off, expired, or the album went to Recently deleted.
            album = null;
          }
        }
        row.context = { ...row.context, album };
      }),
    );
  }

  private async fillBookings(cards: MessageRow[]): Promise<void> {
    const ids = [...new Set(cards.map((r) => contextId(r, 'bookingId')).filter((x): x is string => !!x))];
    const found = await this.db.query<{
      id: string;
      poster_id: string;
      creative_id: string;
      role: string | null;
      event_date: string | null;
      location: string | null;
      rate_minor: number | null;
      currency: string;
      confirmed: boolean;
      cancelled: boolean;
      post_title: string;
      post_slug: string;
    }>(
      `select b.id, b.poster_id, b.creative_id, b.role,
              to_char(b.event_date, 'YYYY-MM-DD') as event_date,
              b.location, b.rate_minor, b.currency,
              b.creative_confirmed_at is not null as confirmed,
              b.cancelled_at is not null as cancelled,
              p.title as post_title, p.slug as post_slug
         from job_bookings b
         join hiring_posts p on p.id = b.post_id
        where b.id = any($1::uuid[])`,
      [ids],
    );
    const byId = new Map(found.map((b) => [b.id, b]));
    for (const row of cards) {
      const b = byId.get(contextId(row, 'bookingId') ?? '');
      // Only one the sender is on: a card cannot show somebody else's booking.
      const ok = b && (b.poster_id === row.sender_id || b.creative_id === row.sender_id);
      row.context = {
        ...row.context,
        booking: ok
          ? {
              id: b.id,
              postTitle: b.post_title,
              postSlug: b.post_slug,
              role: b.role,
              eventDate: b.event_date,
              location: b.location,
              rateMinor: b.rate_minor,
              currency: b.currency,
              confirmed: b.confirmed,
              cancelled: b.cancelled,
              // Who may open it: the two on it. Everyone else sees the card only.
              parties: [b.poster_id, b.creative_id],
            }
          : null,
      };
    }
  }

  private async fillJobs(cards: MessageRow[]): Promise<void> {
    const ids = [...new Set(cards.map((r) => contextId(r, 'postId')).filter((x): x is string => !!x))];
    const found = await this.db.query<{
      id: string;
      slug: string;
      title: string;
      event_date: string | null;
      location: string | null;
      roles_wanted: string[];
      budget_min: number | null;
      budget_max: number | null;
      status: string;
      posted_by: string | null;
    }>(
      `select p.id, p.slug, p.title, to_char(p.event_date, 'YYYY-MM-DD') as event_date,
              p.location, p.roles_wanted, p.budget_min, p.budget_max, p.status,
              u.display_name as posted_by
         from hiring_posts p
         join users u on u.id = p.user_id
        where p.id = any($1::uuid[])
          and p.hidden_at is null
          and u.suspended_at is null`,
      [ids],
    );
    const byId = new Map(found.map((p) => [p.id, p]));
    for (const row of cards) {
      const p = byId.get(contextId(row, 'postId') ?? '');
      row.context = {
        ...row.context,
        job: p
          ? {
              slug: p.slug,
              title: p.title,
              eventDate: p.event_date,
              location: p.location,
              roles: p.roles_wanted ?? [],
              budgetMin: p.budget_min,
              budgetMax: p.budget_max,
              status: p.status,
              postedBy: p.posted_by,
            }
          : null,
      };
    }
  }

  private async fillPosts(cards: MessageRow[]): Promise<void> {
    await Promise.all(
      cards.map(async (row) => {
        const id = contextId(row, 'showcaseId');
        let post: Record<string, unknown> | null = null;
        if (id) {
          try {
            // As the sender sees it, the way they shared it.
            const p = await this.showcases.one(row.sender_id, id);
            const first = p.pieces?.[0];
            if (first && p.publishedAt && !p.unpublishedAt && !p.hiddenAt) {
              const blur = await this.db.queryOne<{ blur_data_url: string | null }>(
                'select blur_data_url from user_files where key = $1',
                [first.fileKey],
              );
              post = {
                id: p.id,
                title: p.title,
                likeCount: p.likeCount,
                makerId: p.userId,
                makerName: p.maker.displayName,
                thumbUrl: first.url,
                blur: blur?.blur_data_url ?? null,
                film: first.kind === 'video',
                pieces: p.pieces.length,
              };
            }
          } catch {
            post = null;
          }
        }
        row.context = { ...row.context, post };
      }),
    );
  }

  private async fillPackages(cards: MessageRow[]): Promise<void> {
    await Promise.all(
      cards.map(async (row) => {
        const id = contextId(row, 'packageId');
        let pkg: Record<string, unknown> | null = null;
        if (id) {
          try {
            // The sender's own, as it stands. Costs and profit stay off the card.
            const { package: p } = await this.packages.get(row.sender_id, id);
            pkg = {
              id: p.id,
              title: p.title,
              totalMinor: p.totalMinor,
              receivedMinor: p.receivedMinor,
              balanceMinor: p.balanceMinor,
              paidInFull: p.paidInFull,
              // Null once its sender stops sharing the statement.
              statementUrl: p.shareUrl,
            };
          } catch {
            pkg = null;
          }
        }
        row.context = { ...row.context, package: pkg };
      }),
    );
  }

  private async fillPlans(cards: MessageRow[]): Promise<void> {
    const ids = [...new Set(cards.map((r) => contextId(r, 'eventId')).filter((x): x is string => !!x))];
    const [events, answers] = await Promise.all([
      this.db.query<{
        id: string;
        user_id: string;
        title: string;
        event_date: string;
        event_time: string | null;
        event_type: string;
        event_type_other: string | null;
        location: string | null;
      }>(
        `select e.id, e.user_id, e.title, to_char(e.event_date, 'YYYY-MM-DD') as event_date,
                to_char(e.event_time, 'HH24:MI') as event_time,
                e.event_type, e.event_type_other, e.location
           from schedule_events e
          where e.id = any($1::text[])`,
        [ids],
      ),
      this.db.query<{ event_id: string; user_id: string; status: string }>(
        `select a.event_id, a.user_id, a.status
           from event_attendees a
          where a.event_id = any($1::text[])
          order by a.responded_at nulls last, a.user_id`,
        [ids],
      ),
    ]);
    const byId = new Map(events.map((e) => [e.id, e]));
    for (const row of cards) {
      const e = byId.get(contextId(row, 'eventId') ?? '');
      // Only the sender's own date: the card is their invitation.
      row.context = {
        ...row.context,
        plan:
          e && e.user_id === row.sender_id
            ? {
                eventId: e.id,
                title: e.title,
                date: e.event_date,
                time: e.event_time,
                type: e.event_type,
                typeOther: e.event_type_other,
                location: e.location,
                organiserId: e.user_id,
                answers: answers
                  .filter((a) => a.event_id === e.id)
                  .map((a) => ({ userId: a.user_id, status: a.status })),
              }
            : null,
      };
    }
  }
}
