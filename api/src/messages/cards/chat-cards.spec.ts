import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AlbumShareService } from '../../albums/share/album-share.service';
import type { BookingsService } from '../../bookings/bookings.service';
import type { DatabaseService } from '../../database/database.service';
import type { FriendsService } from '../../friends/friends.service';
import type { MailConfig } from '../../mail/mail.config';
import type { MoneyPackagesService } from '../../money/money-packages.service';
import type { EventAttendeesService } from '../../schedule-events/event-attendees.service';
import type { ScheduleEventsService } from '../../schedule-events/schedule-events.service';
import type { ShowcasesService } from '../../showcases/showcases.service';
import type { MessageRow, MessagesService } from '../messages.service';
import { SendCardDto } from './chat-cards.controller';
import { ChatCardsService, dayLabel, timeLabel } from './chat-cards.service';

/**
 * Chat phase 2: cards.
 *
 * Every neighbour is faked. These pin who may share what, that nothing is
 * made for a chat that would refuse the card, what each card's plain line
 * says, and that a card only ever shows what its sender may see. The SQL was
 * run against a real Postgres 18 when it was written.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const ANA = '22222222-2222-4222-8222-222222222222';
const BEA = '33333333-3333-4333-8333-333333333333';
const CONVO = '44444444-4444-4444-8444-444444444444';
const MSG = '66666666-6666-4666-8666-666666666666';
const BOOKING = '77777777-7777-4777-8777-777777777777';
const URL = 'https://client.virgo.ph/s/AbCdEfGhIjKlMnOpQrStUvWx';

type Row = Record<string, unknown>;

function harness(options: { frozen?: boolean; friends?: string[]; inviteFails?: boolean; dbRows?: Record<string, Row[]> } = {}) {
  const order: string[] = [];
  const db = {
    query: jest.fn(async (sql: string) => {
      for (const [match, rows] of Object.entries(options.dbRows ?? {})) {
        if (sql.includes(match)) return rows;
      }
      if (sql.includes('from conversation_participants')) return [{ user_id: ANA }, { user_id: BEA }];
      return [];
    }),
    queryOne: jest.fn(async (sql: string) => {
      if (sql.includes('from albums a')) return { name: 'Santos Wedding', photos: 12, films: 0 };
      return null;
    }),
  };
  const messages = {
    useCardFiller: jest.fn(),
    assertCanSend: jest.fn(async () => {
      order.push('assertCanSend');
      if (options.frozen) throw new ForbiddenException("You can't reply to this conversation.");
    }),
    send: jest.fn(async (_u: string, _c: string, body: string, opts: Row) => ({
      id: MSG,
      body,
      ...(opts.card as Row),
    })),
    visibleMessage: jest.fn(),
    announceChanged: jest.fn(async () => ({ id: MSG, kind: 'date-plan' })),
  };
  const shares = {
    createFilesLink: jest.fn(async () => {
      order.push('createFilesLink');
      return { id: 'link1', url: URL, fileCount: 12 };
    }),
    preview: jest.fn(),
  };
  const bookings = {
    byId: jest.fn(async () => ({
      id: BOOKING,
      postTitle: 'Cruz Debut',
      role: 'Videographer',
      eventDate: '2026-12-13',
      location: 'Tagaytay',
      rateMinor: 1_000_000,
    })),
  };
  const packages = { get: jest.fn(), share: jest.fn() };
  const showcases = { one: jest.fn() };
  const events = {
    create: jest.fn(async () => {
      order.push('createEvent');
      return { id: 'ev1', event_date: '2026-12-06', event_time: '16:00:00', location: 'Sirao Garden, Cebu' };
    }),
  };
  const attendees = {
    invite: jest.fn(async () => {
      if (options.inviteFails) throw new ForbiddenException("Some of the people you picked can't be invited to this event.");
      return { invited: 1 };
    }),
    respond: jest.fn(async () => ({ status: 'accepted' })),
  };
  const friends = { areFriends: jest.fn(async (_a: string, b: string) => (options.friends ?? [ANA, BEA]).includes(b)) };
  const mail = { appUrl: 'https://web.virgo.ph', siteUrl: 'https://virgo.ph' };
  const service = new ChatCardsService(
    db as unknown as DatabaseService,
    messages as unknown as MessagesService,
    shares as unknown as AlbumShareService,
    bookings as unknown as BookingsService,
    packages as unknown as MoneyPackagesService,
    showcases as unknown as ShowcasesService,
    events as unknown as ScheduleEventsService,
    attendees as unknown as EventAttendeesService,
    friends as unknown as FriendsService,
    mail as unknown as MailConfig,
  );
  return { service, db, messages, shares, bookings, packages, showcases, events, attendees, friends, order };
}

function card(kind: string, context: Row, sender = ME): MessageRow {
  return { id: MSG, conversation_id: CONVO, sender_id: sender, body: 'line', kind, context } as unknown as MessageRow;
}

describe('ChatCardsService.send', () => {
  it('makes the client link only after the chat says it can take the card', async () => {
    const { service, messages, order } = harness();
    const row = await service.send(ME, CONVO, { kind: 'album-photos', albumId: 'alb1', keys: ['a', 'b'] });

    expect(order).toEqual(['assertCanSend', 'createFilesLink']);
    expect(messages.send).toHaveBeenCalledWith(
      ME,
      CONVO,
      `Shared 12 photos from Santos Wedding\n${URL}`,
      expect.objectContaining({ card: { kind: 'album-photos', context: { albumId: 'alb1', linkId: 'link1', url: URL } } }),
    );
    expect(row.kind).toBe('album-photos');
  });

  it('makes nothing for a frozen chat', async () => {
    const { service, shares, events } = harness({ frozen: true });
    await expect(service.send(ME, CONVO, { kind: 'album-photos', albumId: 'alb1', keys: ['a'] })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.send(ME, CONVO, { kind: 'date-plan', type: 'event', title: '', date: '2026-12-06', inviteEveryone: true }),
    ).rejects.toThrow(ForbiddenException);
    expect(shares.createFilesLink).not.toHaveBeenCalled();
    expect(events.create).not.toHaveBeenCalled();
  });

  it('writes a booking as a plain line with its link, for apps without cards', async () => {
    const { service, messages } = harness();
    await service.send(ME, CONVO, { kind: 'booking', bookingId: BOOKING });
    expect(messages.send).toHaveBeenCalledWith(
      ME,
      CONVO,
      `Booking: Videographer for “Cruz Debut” · Sun, Dec 13 · Tagaytay · ₱10,000\nhttps://web.virgo.ph/bookings/${BOOKING}`,
      expect.objectContaining({ card: { kind: 'booking', context: { bookingId: BOOKING } } }),
    );
  });

  it('refuses a job post that is not yours and not open', async () => {
    const { service, messages } = harness();
    await expect(service.send(ME, CONVO, { kind: 'job-post', postId: BOOKING })).rejects.toThrow(NotFoundException);
    expect(messages.send).not.toHaveBeenCalled();
  });

  it('invites only the people the organiser is connected with, and names the date by its type when untitled', async () => {
    const { service, attendees, messages } = harness({ friends: [ANA] });
    await service.send(ME, CONVO, {
      kind: 'date-plan',
      type: 'event',
      title: '  ',
      date: '2026-12-06',
      time: '16:00',
      place: 'Sirao Garden, Cebu',
      inviteEveryone: true,
    });
    expect(attendees.invite).toHaveBeenCalledWith(ME, 'ev1', [ANA]);
    expect(messages.send).toHaveBeenCalledWith(
      ME,
      CONVO,
      'Shoot · Sun, Dec 6, 4:00 PM · Sirao Garden, Cebu\nAnswer it in your Schedule on Virgo',
      expect.objectContaining({ card: { kind: 'date-plan', context: { eventId: 'ev1' } } }),
    );
  });

  it('leaves no calendar entry behind when the chat cannot all be invited', async () => {
    const { service, db, messages } = harness({ inviteFails: true });
    await expect(
      service.send(ME, CONVO, { kind: 'date-plan', type: 'meeting', title: 'Call', date: '2026-12-06', inviteEveryone: true }),
    ).rejects.toThrow(ForbiddenException);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('delete from schedule_events'), ['ev1', ME]);
    expect(messages.send).not.toHaveBeenCalled();
  });
});

describe('ChatCardsService.fill', () => {
  it('shows a booking only to a chat its sender is on', async () => {
    const booking = {
      id: BOOKING,
      poster_id: ANA,
      creative_id: BEA,
      role: 'Videographer',
      event_date: '2026-12-13',
      location: 'Tagaytay',
      rate_minor: 1_000_000,
      currency: 'PHP',
      confirmed: true,
      cancelled: false,
      post_title: 'Cruz Debut',
      post_slug: 'cruz-debut',
    };
    const { service } = harness({ dbRows: { 'from job_bookings b': [booking] } });
    const theirs = card('booking', { bookingId: BOOKING }, ANA);
    const notMine = card('booking', { bookingId: BOOKING }, ME);
    await service.fill([theirs, notMine]);
    expect((theirs.context as Row).booking).toMatchObject({ role: 'Videographer', parties: [ANA, BEA] });
    expect((notMine.context as Row).booking).toBeNull();
  });

  it("shows a date only from its organiser, with everyone's answers", async () => {
    const { service } = harness({
      dbRows: {
        'from schedule_events e': [
          {
            id: 'ev1',
            user_id: ME,
            title: 'Ocular',
            event_date: '2026-12-06',
            event_time: '16:00',
            event_type: 'event',
            event_type_other: null,
            location: null,
          },
        ],
        'from event_attendees a': [
          { event_id: 'ev1', user_id: ANA, status: 'accepted' },
          { event_id: 'ev1', user_id: BEA, status: 'declined' },
        ],
      },
    });
    const mine = card('date-plan', { eventId: 'ev1' }, ME);
    const forged = card('date-plan', { eventId: 'ev1' }, ANA);
    await service.fill([mine, forged]);
    expect((mine.context as Row).plan).toMatchObject({
      title: 'Ocular',
      answers: [
        { userId: ANA, status: 'accepted' },
        { userId: BEA, status: 'declined' },
      ],
    });
    expect((forged.context as Row).plan).toBeNull();
  });

  it('keeps nothing on a card deleted for everyone, and leaves typed messages alone', async () => {
    const { service, db } = harness();
    const gone = { ...card('package', { packageId: 'p1' }), deleted_at: new Date() } as MessageRow;
    const typed = card('text', null as unknown as Row);
    await service.fill([gone, typed]);
    expect(gone.context).toBeNull();
    expect(typed.context).toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('marks a kind it could not fill as unavailable without failing the thread', async () => {
    const { service, db, packages } = harness();
    db.query.mockRejectedValueOnce(new Error('connection reset'));
    packages.get.mockResolvedValue({
      package: {
        id: 'p1',
        title: 'Cruz Debut · Video',
        totalMinor: 1_000_000,
        receivedMinor: 300_000,
        balanceMinor: 700_000,
        paidInFull: false,
        shareUrl: 'https://client.virgo.ph/s/statement/x',
        costsMinor: 50_000,
      },
    });
    const job = card('job-post', { postId: 'j1' });
    const pkg = card('package', { packageId: 'p1' });
    await service.fill([job, pkg]);
    expect(job.context).toMatchObject({ postId: 'j1', unavailable: true });
    // The package still filled, and its costs stayed off the card.
    expect((pkg.context as Row).package).toMatchObject({ receivedMinor: 300_000, balanceMinor: 700_000 });
    expect((pkg.context as Row).package).not.toHaveProperty('costsMinor');
  });
});

describe('ChatCardsService.answer', () => {
  it('answers through the calendar, then sends the card on', async () => {
    const { service, messages, attendees } = harness();
    messages.visibleMessage.mockResolvedValue({ kind: 'date-plan', context: { eventId: 'ev1' }, deleted_at: null });
    await service.answer(ANA, CONVO, MSG, false);
    expect(attendees.respond).toHaveBeenCalledWith(ANA, 'ev1', false);
    expect(messages.announceChanged).toHaveBeenCalledWith(ANA, CONVO, MSG);
  });

  it('refuses anything that is not a date', async () => {
    const { service, messages, attendees } = harness();
    messages.visibleMessage.mockResolvedValue({ kind: 'text', context: null, deleted_at: null });
    await expect(service.answer(ANA, CONVO, MSG, true)).rejects.toThrow(BadRequestException);
    expect(attendees.respond).not.toHaveBeenCalled();
  });
});

describe('SendCardDto', () => {
  it('asks each kind only for its own fields', async () => {
    const ok = await validate(plainToInstance(SendCardDto, { kind: 'booking', bookingId: BOOKING }));
    expect(ok).toHaveLength(0);
    const missing = await validate(plainToInstance(SendCardDto, { kind: 'album-photos', albumId: 'alb-santos' }));
    expect(missing.map((e) => e.property)).toEqual(['keys']);
    const badTime = await validate(
      plainToInstance(SendCardDto, { kind: 'date-plan', type: 'event', title: '', date: '2026-12-06', time: '4pm', inviteEveryone: true }),
    );
    expect(badTime.map((e) => e.property)).toEqual(['time']);
  });
});

describe('labels', () => {
  it('reads a date as written and a time on a 12-hour clock', () => {
    expect(dayLabel('2026-12-06')).toBe('Sun, Dec 6');
    expect(dayLabel(null)).toBeNull();
    expect(timeLabel('00:30')).toBe('12:30 AM');
    expect(timeLabel('12:00:00')).toBe('12:00 PM');
  });
});
