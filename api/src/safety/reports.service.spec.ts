import { ValidationPipe } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service';
import type { MailConfig } from '../mail/mail.config';
import type { MailService } from '../mail/mail.service';
import type { BlocksService } from './blocks.service';
import { ReportPersonDto, USER_REPORT_REASONS } from './dto/safety.dto';
import { ReportsService } from './reports.service';

/**
 * Reporting a person: written down once per reporter, emailed on the first
 * one only, and never failed by the mail relay.
 */

const REPORTER = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';

function serviceOver(
  options: { inserted?: boolean; sendRejects?: boolean; evidenceRejects?: boolean } = {},
) {
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    if (/insert into report_evidence/.test(sql) && options.evidenceRejects) throw new Error('db down');
    return /insert into user_reports/.test(sql) && options.inserted !== false ? [{ id: 'r1' }] : [];
  });
  const queryOne = jest.fn(async (sql: string, _params?: unknown[]) =>
    /select id from user_reports/.test(sql)
      ? { id: 'r-open' }
      : { name: 'Ana Cruz', handle: 'ana', n: 3 },
  );
  const db = { query, queryOne } as unknown as DatabaseService;
  const blocks = { resolvePerson: jest.fn(async () => TARGET) };
  const mail = {
    send: jest.fn(async () => {
      if (options.sendRejects) throw new Error('relay down');
      return true;
    }),
  };
  const mailConfig = {
    replyTo: 'support@virgo.ph',
    consoleUrl: 'https://console.example',
  } as unknown as MailConfig;

  const service = new ReportsService(
    db,
    blocks as unknown as BlocksService,
    mail as unknown as MailService,
    mailConfig,
  );
  return { service, query, queryOne, mail, blocks };
}

const DTO = { userId: TARGET, reason: 'harassment' } as ReportPersonDto;

describe('ReportsService.report', () => {
  it('thanks a repeat report without emailing it again', async () => {
    const { service, mail } = serviceOver({ inserted: false });
    await expect(service.report(REPORTER, DTO)).resolves.toEqual({ reported: true });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('emails the first report once, to the reply-to address, with a console link', async () => {
    const { service, mail } = serviceOver();

    await service.report(REPORTER, DTO);

    expect(mail.send).toHaveBeenCalledTimes(1);
    const [to, email] = mail.send.mock.calls[0] as unknown as [string, { subject: string; html: string; text: string }];
    expect(to).toBe('support@virgo.ph');
    expect(email.subject).toBe('Reported account: Ana Cruz');
    expect(email.html).toContain(`https://console.example/virgo-users/${TARGET}`);
    expect(email.text).toContain('They have 3 reports.');
  });

  it('never names the reporter in the email', async () => {
    const { service, mail } = serviceOver();
    await service.report(REPORTER, DTO);
    const [, email] = mail.send.mock.calls[0] as unknown as [string, { html: string; text: string }];
    expect(email.html).not.toContain(REPORTER);
    expect(email.text).not.toContain(REPORTER);
  });

  it('still succeeds when the email cannot be sent', async () => {
    const { service } = serviceOver({ sendRejects: true });
    await expect(service.report(REPORTER, DTO)).resolves.toEqual({ reported: true });
  });

  it('stores a blank note as null and the screen it came from as source', async () => {
    const { service, query } = serviceOver();

    await service.report(REPORTER, { ...DTO, note: '   ', from: 'chat' } as ReportPersonDto);

    const insert = query.mock.calls.find(([sql]) => /insert into user_reports/.test(sql))!;
    expect(insert[1]).toEqual([REPORTER, TARGET, 'harassment', null, 'chat']);
    expect(insert[0]).toMatch(/on conflict \(reporter_id, target_id\) where status = 'open' do nothing/);
  });

  describe('from a chat', () => {
    const CONVERSATION = '33333333-3333-4333-8333-333333333333';
    const MESSAGES = ['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555'];
    const CHAT = { ...DTO, from: 'chat', conversationId: CONVERSATION, messageIds: MESSAGES } as ReportPersonDto;
    const evidenceOf = (query: jest.Mock) =>
      query.mock.calls.find(([sql]) => /insert into report_evidence/.test(sql as string)) as
        | [string, unknown[]]
        | undefined;

    it('copies the messages, only between the two of them and only what the reporter could see', async () => {
      const { service, query } = serviceOver();
      await service.report(REPORTER, CHAT);
      const [sql, params] = evidenceOf(query)!;
      expect(params).toEqual(['r1', REPORTER, TARGET, CONVERSATION, MESSAGES]);
      expect(sql).toContain('m.sender_id in ($2, $3)');
      expect(sql).toContain('m.deleted_at is null');
      expect(sql).toContain('me.cleared_at');
      expect(sql).toContain('message_deletions');
      expect(sql).toContain('them.user_id = $3');
    });

    it('adds a second report\'s messages to the one still open', async () => {
      const { service, query, mail } = serviceOver({ inserted: false });
      await service.report(REPORTER, CHAT);
      expect(evidenceOf(query)![1][0]).toBe('r-open');
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('keeps no messages for a report from anywhere else', async () => {
      const { service, query } = serviceOver();
      await service.report(REPORTER, { ...CHAT, from: 'profile' } as ReportPersonDto);
      expect(evidenceOf(query)).toBeUndefined();
    });

    it('still files the report when the copy fails', async () => {
      const { service, mail } = serviceOver({ evidenceRejects: true });
      await expect(service.report(REPORTER, CHAT)).resolves.toEqual({ reported: true });
      expect(mail.send).toHaveBeenCalledTimes(1);
    });
  });

  it('resolves the person the same way a block does', async () => {
    const { service, blocks } = serviceOver();
    await service.report(REPORTER, DTO);
    expect(blocks.resolvePerson).toHaveBeenCalledWith(REPORTER, DTO, 'report');
  });
});

/** The body a report accepts, run through the pipe main.ts configures. */
describe('ReportPersonDto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });
  const validate = (body: Record<string, unknown>) =>
    pipe.transform(body, { type: 'body', metatype: ReportPersonDto });

  it('accepts all six reasons', async () => {
    for (const reason of USER_REPORT_REASONS) {
      await expect(validate({ userId: TARGET, reason })).resolves.toBeInstanceOf(ReportPersonDto);
    }
  });

  it('refuses a reason outside the list', async () => {
    await expect(validate({ userId: TARGET, reason: 'offensive' })).rejects.toThrow();
  });

  it('refuses a note over 500 characters', async () => {
    await expect(
      validate({ userId: TARGET, reason: 'spam', note: 'x'.repeat(501) }),
    ).rejects.toThrow();
    await expect(
      validate({ userId: TARGET, reason: 'spam', note: 'x'.repeat(500) }),
    ).resolves.toBeInstanceOf(ReportPersonDto);
  });

  it('takes up to twenty message ids from a chat, and only uuids', async () => {
    const id = (n: number) => `${String(n).padStart(8, '0')}-4444-4444-8444-444444444444`;
    const twenty = Array.from({ length: 20 }, (_, i) => id(i));
    const conversationId = '33333333-3333-4333-8333-333333333333';
    await expect(
      validate({ userId: TARGET, reason: 'harassment', from: 'chat', conversationId, messageIds: twenty }),
    ).resolves.toBeInstanceOf(ReportPersonDto);
    await expect(
      validate({ userId: TARGET, reason: 'harassment', from: 'chat', conversationId, messageIds: [...twenty, id(20)] }),
    ).rejects.toThrow();
    await expect(
      validate({ userId: TARGET, reason: 'harassment', from: 'chat', conversationId, messageIds: ['nope'] }),
    ).rejects.toThrow();
  });

  it('refuses ids that are not uuids', async () => {
    await expect(validate({ userId: 'not-a-uuid', reason: 'spam' })).rejects.toThrow();
    await expect(validate({ applicationId: '12345', reason: 'spam' })).rejects.toThrow();
  });

  it('refuses an unknown source', async () => {
    await expect(validate({ userId: TARGET, reason: 'spam', from: 'x' })).rejects.toThrow();
  });
});
