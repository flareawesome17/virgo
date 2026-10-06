import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Authenticator-app codes (RFC 6238 TOTP over RFC 4226 HOTP), with nothing
 * but node:crypto.
 *
 * SHA-1, six digits, 30-second steps: what every authenticator app does by
 * default, and what an otpauth:// URI without parameters means. Changing any
 * of them would need every enrolled account to scan again.
 */
const STEP_SECONDS = 30;
const DIGITS = 6;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Not base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 bits, the length RFC 4226 recommends for SHA-1. */
export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The code for one 30-second step. */
export function hotp(secret: Buffer, counter: number, digits = DIGITS): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return binary.toString().padStart(digits, '0');
}

export function stepAt(timeMs: number): number {
  return Math.floor(timeMs / 1000 / STEP_SECONDS);
}

/**
 * The step a code belongs to, or null.
 *
 * One step either side is accepted, for a phone clock a few seconds out. A
 * step at or before `lastStep` is refused even if the code matches: that code
 * has been used, and accepting it again is what lets a shoulder-surfed code
 * work twice.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  options: { now?: number; lastStep?: number | null } = {},
): number | null {
  const digits = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const secret = base32Decode(secretBase32);
  const current = stepAt(options.now ?? Date.now());
  for (const step of [current - 1, current, current + 1]) {
    if (options.lastStep !== null && options.lastStep !== undefined && step <= options.lastStep) {
      continue;
    }
    const expected = Buffer.from(hotp(secret, step));
    if (timingSafeEqual(expected, Buffer.from(digits))) return step;
  }
  return null;
}

/** What an authenticator app scans. The issuer is what it lists the code under. */
export function otpauthUri(secretBase32: string, account: string, issuer = 'Virgo Console'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/*
 * The secret at rest.
 *
 * AES-256-GCM under a key derived from ADMIN_JWT_SECRET, so a leaked database
 * on its own does not hand over working codes. The cost: rotating that secret
 * makes every enrolled authenticator unreadable, and staff then sign in with a
 * recovery code and enrol again. Stored as `v1.<iv>.<tag>.<ciphertext>`.
 */
function keyFrom(masterSecret: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', masterSecret, 'virgo-admin', 'totp-secret', 32),
  );
}

export function sealSecret(plain: string, masterSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(masterSecret), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), body].map((p) =>
    typeof p === 'string' ? p : p.toString('base64url'),
  ).join('.');
}

/** The plain secret, or null when it cannot be read (a rotated key, tampering). */
export function openSecret(sealed: string, masterSecret: string): string | null {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !body) return null;
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyFrom(masterSecret),
      Buffer.from(iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(body, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/*
 * Recovery codes: ten single-use codes shown once, for a lost phone.
 *
 * Lowercase letters and digits without the ones people misread (0/o, 1/l),
 * in two groups of five. Stored as SHA-256 digests: they are random enough
 * that a slow hash buys nothing, and a digest is what lets one be found and
 * removed in a single query.
 */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(10);
    const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]);
    return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
  });
}

/** Spaces, dashes and case do not matter when somebody types one in. */
export function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function digestRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}
