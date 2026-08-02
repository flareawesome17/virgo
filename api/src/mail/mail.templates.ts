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
  cta?: { label: string; url: string };
  /** Sits under the button, usually the raw URL and how long it lasts. */
  fineprint?: string[];
  outro?: string;
}): string {
  const { heading, intro, cta, fineprint = [], outro } = options;

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
