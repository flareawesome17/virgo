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

function serviceOver(options: { inserted?: boolean; sendRejects?: boolean } = {}) {
  const query = jest.fn(async (sql: string, _params?: unknown[]) =>
    /insert into user_reports/.test(sql) && options.inserted !== false ? [{ id: 'r1' }] : [],
  );
  const queryOne = jest.fn(async (_sql: string, _params?: unknown[]) => ({
    name: 'Ana Cruz',
    handle: 'ana',
    n: 3,
  }));
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
    expect(insert[0]).toMatch(/on conflict \(reporter_id, target_id\) do nothing/);
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

  it('refuses ids that are not uuids', async () => {
    await expect(validate({ userId: 'not-a-uuid', reason: 'spam' })).rejects.toThrow();
    await expect(validate({ applicationId: '12345', reason: 'spam' })).rejects.toThrow();
  });

  it('refuses an unknown source', async () => {
    await expect(validate({ userId: TARGET, reason: 'spam', from: 'x' })).rejects.toThrow();
  });
});
