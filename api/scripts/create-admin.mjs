/**
 * Creates a management console account.
 *
 * The console has no sign-up: every account is made by an existing owner, and
 * the first owner has to come from somewhere. That is this script.
 *
 *   docker exec virgo-api node scripts/create-admin.mjs \
 *     --email you@example.com --name "Your Name" --role owner
 *
 * Omit --password and one is generated and printed once. Pass --reset to
 * change the password of an account that already exists rather than failing.
 *
 * Printing a password to a terminal is not ideal, and it is the least bad
 * option for bootstrapping: the alternative is a default password compiled
 * into the image, which is worse in every way. Change it after first sign-in.
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const ROLES = ['owner', 'admin', 'support', 'viewer'];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (name) => process.argv.includes(`--${name}`);

const email = arg('email')?.trim().toLowerCase();
const name = arg('name')?.trim();
const role = (arg('role') ?? 'owner').trim();
const reset = has('reset');

if (!email || !name) {
  console.error('Usage: --email <email> --name <name> [--role owner|admin|support|viewer] [--password <pw>] [--reset]');
  process.exit(1);
}
if (!ROLES.includes(role)) {
  console.error(`Unknown role "${role}". One of: ${ROLES.join(', ')}`);
  process.exit(1);
}

// 24 bytes of base64url — long enough that the 12-character policy is not the
// thing standing between this account and a guess.
const password = arg('password') ?? randomBytes(18).toString('base64url');
if (password.length < 12) {
  console.error('Password must be at least 12 characters.');
  process.exit(1);
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const hash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS ?? 12));

const existing = await db.query(
  'select id, role from admin_users where lower(email) = $1',
  [email],
);

if (existing.rowCount && !reset) {
  console.error(`${email} already has a console account. Pass --reset to set a new password.`);
  await db.end();
  process.exit(1);
}

if (existing.rowCount) {
  await db.query(
    'update admin_users set password_hash = $2, name = $3, updated_at = now() where id = $1',
    [existing.rows[0].id, hash, name],
  );
  // Any session opened with the old password is no longer trustworthy.
  await db.query(
    `update admin_refresh_tokens set revoked_at = now()
      where admin_id = $1 and revoked_at is null`,
    [existing.rows[0].id],
  );
  console.log(`\nPassword reset for ${email} (role stays ${existing.rows[0].role}).`);
} else {
  await db.query(
    'insert into admin_users (email, name, password_hash, role) values ($1, $2, $3, $4)',
    [email, name, hash, role],
  );
  console.log(`\nCreated console account for ${email} with role "${role}".`);
}

if (!arg('password')) {
  console.log(`\n  password: ${password}\n`);
  console.log('Shown once. Change it after signing in.\n');
}

await db.end();
