/**
 * Gives existing job posts their coordinates.
 *
 * New posts resolve theirs at write time; these predate the column. Run inside
 * the API container, which already holds the database URL:
 *
 *   docker exec virgo-api node scripts/backfill-post-coords.mjs
 *   docker exec virgo-api node scripts/backfill-post-coords.mjs --dry-run
 *
 * Idempotent: only touches rows with no coordinate yet, so it is safe to run
 * repeatedly and safe to interrupt. Worth running again after adding cities to
 * the table, since posts that did not match before may match now.
 */
import pg from 'pg';
import { canonicalLocation, coordsFor } from '../dist/hiring/locations.js';

const DRY = process.argv.includes('--dry-run');

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

const { rows } = await db.query(
  `select id, location from hiring_posts
    where location is not null and location_lat is null`,
);

console.log(`${rows.length} post(s) without coordinates${DRY ? ' (dry run)' : ''}`);

let matched = 0;
let unmatched = 0;

for (const row of rows) {
  const coords = coordsFor(row.location);
  if (!coords) {
    // Normal: a named venue is a real location with no coordinate in the
    // table. Reported rather than silently skipped, because a name that
    // *should* match and does not is worth seeing.
    console.log(`  no match  ${row.location}`);
    unmatched++;
    continue;
  }

  if (!DRY) {
    await db.query(
      'update hiring_posts set location_lat = $2, location_lon = $3 where id = $1',
      [row.id, coords.lat, coords.lon],
    );
  }
  console.log(
    `  ok        ${canonicalLocation(row.location)} -> ${coords.lat}, ${coords.lon}`,
  );
  matched++;
}

console.log(`\nmatched=${matched} unmatched=${unmatched}`);
await db.end();
