/**
 * Email bodies.
 *
 * Inline styles and a table-free single column, because email clients are not
 * browsers: Outlook ignores <style> blocks, Gmail strips classes, and anything
 * clever degrades into unstyled text somewhere. This layout survives that
 * gracefully — worst case it renders as a plain, readable column.
 *
 * Every message is also given a plain-text alternative. Some clients show it
 * by preference, spam filters weight its absence, and a link nobody can click
 * is worse than an ugly one.
 */

const BRAND = '#B66A40';
const INK = '#1E1B18';
const MUTED = '#847167';
const PAPER = '#FFF8F4';
const CARD = '#FFFFFF';
const BORDER = '#E8DAD1';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function layout(options: {
  heading: string;
  intro: string;
  /** Large, copyable verification code shown between the intro and CTA. */
  code?: string;
  cta?: { label: string; url: string };
  /** Sits under the button, usually the raw URL and how long it lasts. */
  fineprint?: string[];
  outro?: string;
}): string {
  const { heading, intro, code, cta, fineprint = [], outro } = options;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
  <!-- Shown in the inbox list next to the subject, then hidden. Without it
       clients pull the first line of markup instead. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(intro)}</div>

  <div style="background:${PAPER};padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;">

      <div style="padding:0 4px 20px;">
        <span style="font-size:19px;font-weight:700;color:${INK};letter-spacing:-0.3px;">Virgo</span>
        <span style="font-size:10px;font-weight:600;color:${MUTED};letter-spacing:2px;text-transform:uppercase;margin-left:8px;">Creative OS</span>
      </div>

      <div style="background:${CARD};border:1px solid ${BORDER};border-radius:16px;padding:32px;">
        <h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;font-weight:700;color:${INK};">${escapeHtml(heading)}</h1>
        <p style="margin:0;font-size:15px;line-height:1.6;color:${MUTED};">${escapeHtml(intro)}</p>

        ${
          code
            ? `<div style="margin:26px 0 0;background:${PAPER};border:1px solid ${BORDER};border-radius:12px;padding:18px 16px;text-align:center;font-size:30px;line-height:1;font-weight:750;letter-spacing:7px;color:${INK};font-variant-numeric:tabular-nums;">${escapeHtml(code)}</div>`
            : ''
        }

        ${
          cta
            ? `<div style="margin:28px 0 0;">
          <a href="${escapeAttr(cta.url)}" style="display:inline-block;background:${BRAND};color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:700;padding:13px 28px;border-radius:10px;">${escapeHtml(cta.label)}</a>
        </div>`
            : ''
        }

        ${
          fineprint.length > 0
            ? `<div style="margin:24px 0 0;padding:16px 0 0;border-top:1px solid ${BORDER};">
          ${fineprint
            .map(
              (line) =>
                `<p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:${MUTED};word-break:break-all;">${escapeHtml(line)}</p>`,
            )
            .join('')}
        </div>`
            : ''
        }

        ${
          outro
            ? `<p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">${escapeHtml(outro)}</p>`
            : ''
        }
      </div>

      <p style="margin:20px 4px 0;font-size:11px;line-height:1.6;color:${MUTED};">
        Sent by Virgo, a private workspace for photographers.
        If you weren&rsquo;t expecting this, you can ignore it.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/** A short-lived second factor sent only after the password has been checked. */
export function twoFactorCode(options: {
  code: string;
  purpose: 'setup' | 'login' | 'disable' | 'recovery';
  expiresInMinutes: number;
}): RenderedEmail {
  const descriptions = {
    setup: 'turning on two-factor authentication',
    login: 'signing in',
    disable: 'turning off two-factor authentication',
    recovery: 'replacing your recovery codes',
  } as const;
  const action = descriptions[options.purpose];
  const intro = `Use this six-digit code to finish ${action} for your Virgo account.`;

  return {
    subject: `${options.code} is your Virgo verification code`,
    html: layout({
      heading: 'Your verification code',
      intro,
      code: options.code,
      fineprint: [
        `This code expires in ${options.expiresInMinutes} minutes and can be used once.`,
        'Virgo will never ask you to share this code in a message or phone call.',
      ],
      outro: `If you were not ${action}, change your password as soon as possible.`,
    }),
    text: [
      'Your Virgo verification code',
      '',
      options.code,
      '',
      intro,
      '',
      `This code expires in ${options.expiresInMinutes} minutes and can be used once.`,
      'Do not share it with anyone.',
    ].join('\n'),
  };
}

/** HTML-escapes interpolated text. Names and addresses are user-controlled. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

export function verifyEmail(options: {
  name: string;
  url: string;
  expiresInHours: number;
}): RenderedEmail {
  const intro = `Confirm ${options.name ? `${options.name}, ` : ''}this is your address and your Virgo account is ready to go.`;
  return {
    subject: 'Confirm your email address',
    html: layout({
      heading: 'Confirm your email',
      intro,
      cta: { label: 'Confirm my email', url: options.url },
      fineprint: [
        `This link expires in ${options.expiresInHours} hours.`,
        `If the button does not work, paste this into your browser: ${options.url}`,
      ],
      outro: 'If you did not create a Virgo account, you can safely ignore this.',
    }),
    text: [
      'Confirm your email',
      '',
      intro,
      '',
      options.url,
      '',
      `This link expires in ${options.expiresInHours} hours.`,
      'If you did not create a Virgo account, you can safely ignore this.',
    ].join('\n'),
  };
}

export function resetPassword(options: {
  name: string;
  url: string;
  expiresInMinutes: number;
}): RenderedEmail {
  const intro =
    'Somebody asked to reset the password on this Virgo account. If that was you, use the button below.';
  return {
    subject: 'Reset your Virgo password',
    html: layout({
      heading: 'Reset your password',
      intro,
      cta: { label: 'Choose a new password', url: options.url },
      fineprint: [
        `This link expires in ${options.expiresInMinutes} minutes and can be used once.`,
        `If the button does not work, paste this into your browser: ${options.url}`,
      ],
      outro:
        'If you did not ask for this, ignore it — your password stays as it is, and nobody has been given access.',
    }),
    text: [
      'Reset your password',
      '',
      intro,
      '',
      options.url,
      '',
      `This link expires in ${options.expiresInMinutes} minutes and can be used once.`,
      'If you did not ask for this, ignore it — your password stays as it is.',
    ].join('\n'),
  };
}

/** Sent after a successful reset, so a stolen account is noticed. */
export function passwordChanged(options: { when: string }): RenderedEmail {
  const intro = `The password on your Virgo account was changed on ${options.when}.`;
  return {
    subject: 'Your Virgo password was changed',
    html: layout({
      heading: 'Your password was changed',
      intro,
      outro:
        'If this was not you, reset your password immediately and contact support@virgo.ph.',
    }),
    text: [
      'Your password was changed',
      '',
      intro,
      '',
      'If this was not you, reset your password immediately and contact support@virgo.ph.',
    ].join('\n'),
  };
}

export function collaboratorInvite(options: {
  inviterName: string;
  workspaceName: string;
  role: string;
  url: string;
}): RenderedEmail {
  const intro = `${options.inviterName} invited you to collaborate on “${options.workspaceName}” as ${options.role}.`;
  return {
    subject: `${options.inviterName} invited you to ${options.workspaceName}`,
    html: layout({
      heading: 'You have been invited',
      intro,
      cta: { label: 'Open Virgo', url: options.url },
      fineprint: [
        'Accept the invitation from your Network screen to gain access.',
      ],
    }),
    text: [
      'You have been invited',
      '',
      intro,
      '',
      options.url,
      '',
      'Accept the invitation from your Network screen to gain access.',
    ].join('\n'),
  };
}

/**
 * Somebody wants to pay you for work.
 *
 * Worth an email even for a user who ignores push: this is the one notification
 * in the product that is a lead, and a freelancer who misses it loses a booking
 * rather than a bit of context.
 *
 * The brief is deliberately not quoted in full — the point is to get them into
 * the app to read and answer it, and a message written by a stranger should not
 * be relayed verbatim into an inbox.
 */
export function hireEnquiry(options: {
  fromName: string;
  /** "Photographer", when they said. */
  roleWanted: string | null;
  /** Already formatted for reading — "Sat 14 Mar". */
  when: string | null;
  url: string;
}): RenderedEmail {
  const what = options.roleWanted
    ? `a ${options.roleWanted.toLowerCase()}`
    : 'someone to work with';
  const when = options.when ? ` for ${options.when}` : '';
  const intro = `${options.fromName} is looking for ${what}${when} and sent you an enquiry on Virgo. Open it to read the brief and reply.`;

  return {
    subject: `${options.fromName} wants to hire you`,
    html: layout({
      heading: 'New hire enquiry',
      intro,
      cta: { label: 'Read the enquiry', url: options.url },
      fineprint: [
        'Accepting connects you and opens a chat, so you can talk details.',
      ],
    }),
    text: [
      'New hire enquiry',
      '',
      intro,
      '',
      options.url,
      '',
      'Accepting connects you and opens a chat, so you can talk details.',
    ].join('\n'),
  };
}

/**
 * Somebody applied to a job you posted.
 *
 * Same reasoning as a hire enquiry: this is a lead, and a poster who misses it
 * loses a candidate rather than a bit of context. The application text is not
 * relayed — it gets them into the app to read it properly, and a message
 * written by a stranger should not be forwarded verbatim into an inbox.
 */
export function jobApplication(options: {
  applicantName: string;
  jobTitle: string;
  url: string;
}): RenderedEmail {
  const intro = `${options.applicantName} applied to “${options.jobTitle}” on Virgo. Open it to read what they said and reply.`;

  return {
    subject: `${options.applicantName} applied to your job post`,
    html: layout({
      heading: 'New application',
      intro,
      cta: { label: 'See the application', url: options.url },
      fineprint: [
        'Accepting connects you and opens a chat, so you can talk details.',
      ],
    }),
    text: [
      'New application',
      '',
      intro,
      '',
      options.url,
      '',
      'Accepting connects you and opens a chat, so you can talk details.',
    ].join('\n'),
  };
}

/**
 * A job post has been reported.
 *
 * Goes to whoever answers the reply-to address, because the product has no
 * admin queue yet. Taking a post down is setting `hidden_at` by hand — this
 * email is the only thing that makes that possible, so it carries the link and
 * the running count rather than just saying "something happened".
 */
export function jobPostReported(options: {
  jobTitle: string;
  reason: string;
  note: string | null;
  reportCount: number;
  url: string;
}): RenderedEmail {
  const intro = `“${options.jobTitle}” was reported as ${options.reason}. It has ${options.reportCount} report${options.reportCount === 1 ? '' : 's'}.`;

  return {
    subject: `Reported job post: ${options.jobTitle}`,
    html: layout({
      heading: 'A job post was reported',
      intro,
      cta: { label: 'View the post', url: options.url },
      fineprint: [
        options.note ? `They added: ${options.note}` : 'No further detail was given.',
        'To take it down, set hidden_at on the hiring_posts row.',
      ],
    }),
    text: [
      'A job post was reported',
      '',
      intro,
      options.note ? `\nThey added: ${options.note}` : '',
      '',
      options.url,
      '',
      'To take it down, set hidden_at on the hiring_posts row.',
    ].join('\n'),
  };
}

/**
 * An event somebody is on has changed.
 *
 * Carries the old time as well as the new one. "Your shoot has moved" with a
 * single date leaves the reader working out what changed from memory, and the
 * one thing this message exists to prevent is somebody turning up at the time
 * they had written down.
 *
 * Two audiences, because an attendee and the organiser need different sentences
 * from the same event. An attendee is being told their plans moved and that
 * their place is safe; the organiser is being told that somebody else touched
 * their event, which is a different kind of news and needs the person named.
 *
 * No accept/decline call to action: nobody's attendance is in question. The
 * link goes to the event so they can see it and talk to whoever changed it.
 */
export function eventChanged(options: {
  /** Whoever made the change. Not necessarily the organiser any more. */
  editorName: string;
  eventTitle: string;
  /** Already formatted for reading, as it stood before the edit. */
  previousWhen: string;
  /** Already formatted for reading — "Fri 14 Mar at 09:00". */
  when: string;
  /** What changed, already phrased: `['the title', 'the notes']`. */
  changed: readonly string[];
  /** Who is reading. The organiser owns the event; an attendee joined it. */
  audience: 'attendee' | 'organiser';
  url: string;
}): RenderedEmail {
  const moved = options.previousWhen !== options.when;
  const others = options.changed.filter((c) => c !== 'the date and time');
  const mine = options.audience === 'organiser';

  // A move gets its own wording. It is the change that can cost somebody a
  // wasted trip, and it should not read like a corrected typo.
  const intro = moved
    ? `${options.editorName} moved “${options.eventTitle}”. It was ${options.previousWhen}, and it is now ${options.when}.` +
      // Starts a new sentence, so it is capitalised; the other branch is
      // mid-sentence and must not be.
      (others.length > 0 ? ` ${capitalise(joinList(others))} also changed.` : '')
    : `${options.editorName} updated “${options.eventTitle}” — ${joinList(options.changed)} changed. It is still ${options.when}.`;

  const heading = mine
    ? moved
      ? 'Your event has been moved'
      : 'Your event was updated'
    : moved
      ? 'An event you joined has moved'
      : 'An event you joined was updated';

  const note = mine
    ? 'Anyone who is going to this has been told as well. You own the event, so you can change it back.'
    : 'Your place is unchanged — you do not need to accept again. If it no longer works for you, tell the organiser.';

  return {
    subject: moved
      ? `Moved: ${options.eventTitle} is now ${options.when}`
      : `Updated: ${options.eventTitle}`,
    html: layout({
      heading,
      intro,
      cta: { label: 'Open the event', url: options.url },
      fineprint: [note],
    }),
    text: [heading, '', intro, '', options.url, '', note].join('\n'),
  };
}

/** `['a', 'b', 'c']` -> `"a, b, and c"`. Left lowercase; callers capitalise. */
function joinList(items: readonly string[]): string {
  if (items.length === 0) return 'something';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function eventInvite(options: {
  inviterName: string;
  eventTitle: string;
  /** Already formatted for reading — "Fri 14 Mar at 09:00". */
  when: string;
  url: string;
}): RenderedEmail {
  const intro = `${options.inviterName} invited you to “${options.eventTitle}” on ${options.when}. Let them know whether you can make it.`;
  return {
    subject: `${options.inviterName} invited you to ${options.eventTitle}`,
    html: layout({
      heading: 'You have been invited to an event',
      intro,
      cta: { label: 'Accept or decline', url: options.url },
      fineprint: [
        'Accepting adds it to your schedule. Declining tells the organiser you cannot make it.',
      ],
    }),
    text: [
      'You have been invited to an event',
      '',
      intro,
      '',
      options.url,
      '',
      'Accepting adds it to your schedule.',
    ].join('\n'),
  };
}

/**
 * Sent when an account is paused.
 *
 * The point is the same as passwordChanged: if this was not you, this email is
 * how you find out, and it names the date so nobody has to guess.
 */
export function accountDisabled(options: {
  name: string;
  until: string;
  days: number;
  url: string;
}): RenderedEmail {
  const intro = `Your Virgo account is paused for ${options.days} day${options.days === 1 ? '' : 's'} and comes back on ${options.until}. Nothing has been deleted — your workspaces, albums and files are exactly as you left them.`;
  return {
    subject: `Your Virgo account is paused until ${options.until}`,
    html: layout({
      heading: 'Your account is paused',
      intro,
      cta: { label: 'Sign in from', url: options.url },
      fineprint: [
        `You will not be able to sign in until ${options.until}.`,
        'Nobody can message you or invite you while it is paused.',
      ],
      outro:
        'If you did not do this, reset your password immediately and contact support@virgo.ph.',
    }),
    text: [
      'Your account is paused',
      '',
      intro,
      '',
      `You will not be able to sign in until ${options.until}.`,
      'If you did not do this, reset your password and contact support@virgo.ph.',
    ].join('\n'),
  };
}

/** The last email this address will get from us. */
export function accountDeleted(options: { name: string }): RenderedEmail {
  const intro = `Your Virgo account has been deleted${options.name ? `, ${options.name}` : ''}. Your workspaces, albums, messages and every file you uploaded are gone, and this cannot be undone.`;
  return {
    subject: 'Your Virgo account has been deleted',
    html: layout({
      heading: 'Your account has been deleted',
      intro,
      fineprint: [
        'Share links you created no longer work.',
        'This is the last email you will receive from Virgo.',
      ],
      outro:
        'If you did not do this, contact support@virgo.ph straight away.',
    }),
    text: [
      'Your account has been deleted',
      '',
      intro,
      '',
      'Share links you created no longer work.',
      'If you did not do this, contact support@virgo.ph straight away.',
    ].join('\n'),
  };
}

export function friendRequest(options: {
  requesterName: string;
  url: string;
}): RenderedEmail {
  const intro = `${options.requesterName} wants to connect with you on Virgo. Once you are friends you can share workspaces and chat.`;
  return {
    subject: `${options.requesterName} sent you a friend request`,
    html: layout({
      heading: 'New friend request',
      intro,
      cta: { label: 'Open Virgo', url: options.url },
    }),
    text: ['New friend request', '', intro, '', options.url].join('\n'),
  };
}

/**
 * A reset link for a management console account.
 *
 * Says plainly what the account is. Console credentials are not Virgo
 * credentials, and somebody who holds both needs to know which one this
 * changes before they click.
 */
export function adminPasswordReset(options: {
  name: string;
  url: string;
  minutes: number;
}): RenderedEmail {
  return {
    subject: 'Reset your Virgo Console password',
    html: layout({
      heading: 'Reset your console password',
      intro:
        `Someone asked to reset the password for your Virgo Console account. ` +
        `This is the management console — not your Virgo app account.`,
      cta: { label: 'Choose a new password', url: options.url },
      outro:
        `The link works once and expires in ${options.minutes} minutes. ` +
        `If this was not you, ignore this email — nothing has changed, and ` +
        `your current password still works.`,
    }),
    // A plain-text part as well. Some clients render it instead, and a reset
    // email that arrives as an empty message is a support ticket.
    text: [
      'Reset your console password',
      '',
      'Someone asked to reset the password for your Virgo Console account.',
      'This is the management console — not your Virgo app account.',
      '',
      options.url,
      '',
      `The link works once and expires in ${options.minutes} minutes.`,
      'If this was not you, ignore this email. Nothing has changed.',
    ].join('\n'),
  };
}
