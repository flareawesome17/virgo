/**
 * Counts the files already stored twice: same account, same album, same name
 * (any case) and same size. Reports only; deletes nothing, changes nothing.
 *
 * Until uploads checked for files already in the album (migration 098,
 * src/storage/upload-dedup.ts), re-sending a batch that half-failed stored
 * every file that had arrived the first time again, under a new key. This
 * says how much of that there is, per album, so whether and how to remove it
 * can be decided with the numbers in front of you. Removing anything is a
 * separate, deliberate step that this script does not take.
 *
 * Name and size are not proof that two rows are the same photograph — a
 * camera counter that reset can produce two different IMG_0001.JPG of the
 * same size — so groups are split by how sure they are:
 *
 *   identical  every copy has an ETag recorded and they all agree. Content
 *              confirmed the same (both were sent in one piece, or both in
 *              the same number of parts).
 *   unverified everything else: rows from before ETags were recorded, or
 *              ETags that differ (most often one copy sent in parts and the
 *              other not, which is the same file; occasionally a different
 *              one).
 *
 * Prints counts, album ids and album names. No file names and no keys: a log
 * line naming a client's files outlives the files.
 *
 *   docker compose -f docker-compose.prod.yml exec api node scripts/report-duplicate-uploads.mjs
 *   docker compose -f docker-compose.prod.yml exec api node scripts/report-duplicate-uploads.mjs --json
 */
import { pathToFileURL } from 'node:url';

/**
 * One row per (account, album) with any duplicate group, largest waste first.
 *
 * `extra_copies` is every copy beyond the first in each group, and
 * `extra_bytes` what those copies hold — what removing them would give back.
 */
export const DUPLICATE_SUMMARY_SQL = `
  with groups as (
    select f.user_id,
           f.album_id,
           f.size_bytes,
           count(*) as copies,
           count(f.etag) as with_etag,
           count(distinct f.etag) as distinct_etags
      from user_files f
     where f.original_name is not null
     group by f.user_id, f.album_id, lower(f.original_name), f.size_bytes
    having count(*) > 1
  )
  select g.user_id,
         g.album_id,
         a.name as album_name,
         count(*)::int as groups,
         sum(g.copies - 1)::int as extra_copies,
         sum((g.copies - 1) * g.size_bytes)::bigint as extra_bytes,
         (count(*) filter (where g.with_etag = g.copies and g.distinct_etags = 1))::int
           as identical_groups,
         coalesce(sum((g.copies - 1) * g.size_bytes)
           filter (where g.with_etag = g.copies and g.distinct_etags = 1), 0)::bigint
           as identical_extra_bytes
    from groups g
    left join albums a on a.id = g.album_id
   group by g.user_id, g.album_id, a.name
   order by extra_bytes desc, g.user_id, g.album_id
`;

function formatBytes(value) {
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = bytes / 1024;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit += 1;
  }
  return `${n.toFixed(n < 10 ? 2 : 1)} ${units[unit]}`;
}

/** Totals across every row of the summary. */
export function totalsOf(rows) {
  return rows.reduce(
    (sum, row) => ({
      albums: sum.albums + 1,
      groups: sum.groups + Number(row.groups),
      extraCopies: sum.extraCopies + Number(row.extra_copies),
      extraBytes: sum.extraBytes + Number(row.extra_bytes),
      identicalGroups: sum.identicalGroups + Number(row.identical_groups),
      identicalExtraBytes: sum.identicalExtraBytes + Number(row.identical_extra_bytes),
    }),
    { albums: 0, groups: 0, extraCopies: 0, extraBytes: 0, identicalGroups: 0, identicalExtraBytes: 0 },
  );
}

/**
 * Runs the summary on a connected client, inside a read-only transaction, so
 * nothing this script does can write even by mistake.
 */
export async function duplicateSummary(client) {
  await client.query('begin transaction read only');
  try {
    const { rows } = await client.query(DUPLICATE_SUMMARY_SQL);
    return rows;
  } finally {
    await client.query('rollback');
  }
}

async function main() {
  const { Client } = await import('pg');
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  let rows;
  try {
    rows = await duplicateSummary(pg);
  } finally {
    await pg.end();
  }
  const totals = totalsOf(rows);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ totals, albums: rows }, null, 2));
    return;
  }

  if (rows.length === 0) {
    console.log('No duplicate uploads: no album holds two files of the same name and size.');
    return;
  }

  console.log(
    `${totals.groups} file(s) stored more than once, in ${totals.albums} album(s): ` +
      `${totals.extraCopies} extra cop${totals.extraCopies === 1 ? 'y' : 'ies'}, ${formatBytes(totals.extraBytes)}.`,
  );
  console.log(
    `Of those, ${totals.identicalGroups} confirmed identical by ETag (${formatBytes(totals.identicalExtraBytes)}); ` +
      `the rest match on name and size only.\n`,
  );
  for (const row of rows) {
    const album = row.album_id ? `${row.album_name ?? '(deleted album)'} [${row.album_id}]` : '(no album)';
    console.log(
      `${row.user_id}  ${album}\n` +
        `    ${row.groups} file(s) duplicated, ${row.extra_copies} extra, ${formatBytes(row.extra_bytes)}` +
        ` · ${row.identical_groups} confirmed identical`,
    );
  }
  console.log('\nNothing was changed.');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
