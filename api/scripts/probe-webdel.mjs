/** Throwaway: a poster with an accepted applicant, for the web delete dialog. */
import pg from 'pg';

const BASE = 'http://localhost:3000';
const stamp = Math.floor(Date.now() / 1000);
const PASS = 'Probe!Passw0rd-2026';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query(`delete from users where email like 'probe-wd-%@example.invalid'`);

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function signUp(prefix, name) {
  const email = `probe-wd-${prefix}-${stamp}@example.invalid`;
  const up = await call('/auth/register', {
    method: 'POST',
    body: { email, password: PASS, displayName: name, roles: ['Photographer'] },
  });
  if (up.status >= 300) throw new Error(JSON.stringify(up));
  await db.query('update users set email_verified_at = now() where lower(email) = $1', [
    email.toLowerCase(),
  ]);
  return { email, token: up.body.accessToken };
}

const poster = await signUp('poster', 'WD Poster');
const hired = await signUp('hired', 'Liza Buenaventura');
const other = await signUp('other', 'Noel Aguinaldo');

const post = (
  await call('/me/jobs', {
    method: 'POST',
    token: poster.token,
    body: {
      title: 'HMUA for a Plaridel wedding',
      description:
        'Morning prep at the house, ceremony at two. Looking for an HMUA comfortable with a large entourage and a long day.',
      rolesWanted: ['HMUA'],
      location: 'Cebu City',
      budgetMin: 200000,
    },
  })
).body;

const app = (
  await call(`/jobs/${post.slug}/apply`, {
    method: 'POST',
    token: hired.token,
    body: { message: 'I can provide the service, I have experience in HMUA.' },
  })
).body;
await call(`/jobs/${post.slug}/apply`, {
  method: 'POST',
  token: other.token,
  body: { message: 'Available that date and used to big entourages.' },
});
await call(`/jobs/applications/${app.id}/respond`, {
  method: 'POST',
  token: poster.token,
  body: { status: 'accepted' },
});
await call('/me/jobs/seen', { method: 'POST', token: poster.token });

console.log(JSON.stringify({ email: poster.email, password: PASS }));
await db.end();
