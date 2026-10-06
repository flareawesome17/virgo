import type { DatabaseService } from '../database/database.service';
import type { MailConfig } from '../mail/mail.config';
import type { MailService } from '../mail/mail.service';
import type { StorageService } from '../storage/storage.service';
import type { AdminCustomersService } from './admin-customers.service';
import type { AdminService } from './admin.service';
import { ModerationService } from './moderation.service';
import type { SupportService } from './support.service';

/**
 * The rules around a moderation decision. The queries themselves run against
 * real Postgres where the SQL is checked; these pin what a decision may be and
 * what it sets in motion.
 */
const STAFF = { id: 'admin-1', name: 'Mo Moderator' };
const PERSON = 'user-1';
const POST = 'post-1';

function harness() {
  const queries: { sql: string; args?: unknown[] }[] = [];
  const db = {
    queryOne: jest.fn(async (sql: string, args?: unknown[]) => {
      queries.push({ sql, args });
      if (sql.startsWith('select p.user_id as id') || sql.startsWith('select u.id from users')) return { id: PERSON };
      if (sql.includes('as name, u.email')) return { id: PERSON, name: 'Dino Reyes', email: 'dino@studio.test' };
      if (sql.includes('from hiring_posts p where p.id')) return { id: POST, title: 'Cash only' };
      if (sql.startsWith('select email, display_name')) return { email: 'dino@studio.test', display_name: 'Dino' };
      return null;
    }),
    query: jest.fn(async (sql: string, args?: unknown[]) => {
      queries.push({ sql, args });
      if (/^\s*update (user_reports|hiring_post_reports|showcase_reports)/.test(sql)) return [{ id: 'r1' }, { id: 'r2' }];
      return [];
    }),
  };
  const support = { openFromStaff: jest.fn(async () => 'ticket-1') };
  const admin = { setUserDisabled: jest.fn(async () => ({})) };
  const customers = { notifySuspension: jest.fn(async () => true) };
  const mail = { send: jest.fn(async () => true) };
  const service = new ModerationService(
    db as unknown as DatabaseService,
    support as unknown as SupportService,
    admin as unknown as AdminService,
    customers as unknown as AdminCustomersService,
    mail as unknown as MailService,
    { appUrl: 'https://web.virgo.test' } as unknown as MailConfig,
    { mediaUrls: jest.fn(async () => []) } as unknown as StorageService,
  );
  return { service, queries, support, admin, customers, mail };
}

describe('ModerationService.resolve', () => {
  it('refuses to hide a person, to warn in silence, and to dismiss with a message', async () => {
    const { service, support } = harness();
    await expect(service.resolve('user', PERSON, STAFF, { action: 'hide' })).rejects.toMatchObject({ status: 400 });
    await expect(service.resolve('user', PERSON, STAFF, { action: 'warn', message: '  ' })).rejects.toMatchObject({ status: 400 });
    await expect(service.resolve('job', POST, STAFF, { action: 'dismiss', message: 'hi' })).rejects.toMatchObject({ status: 400 });
    expect(support.openFromStaff).not.toHaveBeenCalled();
  });

  it('warns through the support inbox, emails the same words, and closes every open report', async () => {
    const { service, support, mail, queries } = harness();
    const result = await service.resolve('user', PERSON, STAFF, { action: 'warn', message: 'Stop.' });

    expect(result).toMatchObject({ closed: 2, ticketId: 'ticket-1' });
    expect(support.openFromStaff).toHaveBeenCalledWith(PERSON, 'About your account', 'Stop.', STAFF, 'safety');
    const [to, email] = mail.send.mock.calls[0] as unknown as [string, { text: string }];
    expect(to).toBe('dino@studio.test');
    expect(email.text).toContain('Stop.');
    expect(email.text).toContain('https://web.virgo.test/support?ticket=ticket-1');
    const close = queries.find((q) => q.sql.includes('update user_reports'))!;
    expect(close.sql).toContain("status = 'open'");
    expect(close.args).toEqual([PERSON, 'actioned', 'warned', STAFF.id, null]);
    const record = queries.find((q) => q.sql.includes('insert into moderation_actions'))!;
    expect(record.args?.slice(0, 7)).toEqual([PERSON, 'warn', 'user', PERSON, 'Dino Reyes', 2, 'Stop.']);
  });

  it('hides a post, and names it when it warns', async () => {
    const { service, support, queries } = harness();
    await service.resolve('job', POST, STAFF, { action: 'hide', message: 'No deposits.' });
    expect(queries.some((q) => q.sql.startsWith('update hiring_posts set hidden_at'))).toBe(true);
    expect(support.openFromStaff).toHaveBeenCalledWith(PERSON, 'About your job post “Cash only”', 'No deposits.', STAFF, 'safety');
  });

  it('dismisses quietly: nobody is told and the reports read dismissed', async () => {
    const { service, support, mail, queries } = harness();
    const result = await service.resolve('job', POST, STAFF, { action: 'dismiss', note: 'Fine.' });
    expect(result.ticketId).toBeNull();
    expect(support.openFromStaff).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
    const close = queries.find((q) => q.sql.includes('update hiring_post_reports'))!;
    expect(close.args).toEqual([POST, 'dismissed', 'dismissed', STAFF.id, 'Fine.']);
  });

  it('suspends the way the account page does, with the notice unless asked not to', async () => {
    const { service, admin, customers } = harness();
    await service.resolve('user', PERSON, STAFF, { action: 'suspend', note: 'Threats.' });
    expect(admin.setUserDisabled).toHaveBeenCalledWith(PERSON, true, 'Threats.');
    expect(customers.notifySuspension).toHaveBeenCalledWith(PERSON, true);

    const quiet = harness();
    await quiet.service.resolve('user', PERSON, STAFF, { action: 'suspend', notify: false });
    expect(quiet.customers.notifySuspension).not.toHaveBeenCalled();
  });

  it('tells a suspended person to answer by email, since they cannot sign in to the message', async () => {
    const { service, mail } = harness();
    await service.resolve('user', PERSON, STAFF, { action: 'suspend', message: 'Suspended for threats.' });
    const [, email] = mail.send.mock.calls[0] as unknown as [string, { text: string; html: string }];
    expect(email.text).toContain('Suspended for threats.');
    expect(email.text).toContain('reply to this email');
    expect(email.text).not.toContain('/support?ticket=');
    expect(email.html).not.toContain('Open the message');
  });
});
