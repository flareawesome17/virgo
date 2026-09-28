/**
 * Turns the photographs already on people's profiles into showcases.
 *
 *   docker compose -f docker-compose.prod.yml exec api node scripts/portfolio-to-showcases.mjs --dry-run
 *   docker compose -f docker-compose.prod.yml exec api node scripts/portfolio-to-showcases.mjs
 *
 * ── It copies. It does not move. ──────────────────────────────────────────────
 *
 * Nothing is deleted from `portfolio_items`, and that is the whole safety
 * argument rather than caution for its own sake:
 *
 *   - The WEB profile — virgo.ph/<handle>, the page people send to clients —
 *     renders `portfolio_items` and has no Work tab at all. Moving the rows
 *     would empty the public page a photographer hands to somebody hiring them.
 *   - A phone that has not taken the update yet has no Work tab either.
 *
 * So after this runs, a photograph is in both places: under Work on an updated
 * phone, and in Portfolio everywhere. That duplication is deliberate and it is
 * the cheap problem. Deleting the portfolio rows is a separate decision for
 * after the web profile can show showcases, and it needs its own script.
 *
 * ── Albums are skipped, on purpose ───────────────────────────────────────────
 *
 * A `kind = 'album'` row is a link to a whole gallery, served through its own
 * share link. A showcase is a set of at most ten photographs somebody chose.
 * They are not the same object, and turning one into the other would silently
 * change what a person published — either truncating a 200-photograph gallery
 * to ten, or reducing it to its cover. Those rows stay exactly as they are and
 * keep rendering as galleries.
 *
 * ── Idempotent ───────────────────────────────────────────────────────────────
 *
 * A photograph that is already in any showcase of its owner's is skipped, so a
 * second run does nothing and a half-finished run can simply be run again.
 *
 * Each showcase made here holds one photograph, keeps the portfolio caption,
 * and is published at the portfolio row's created_at — so a profile's Work
 * reads in the order the portfolio was built rather than all at one timestamp.
 * There is no craft note: nobody wrote one, and inventing it would be putting
 * words in a photographer's mouth.
 */
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../dist/database/database.service.js';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const limitAt = args.indexOf('--limit');
const LIMIT = limitAt === -1 ? null : Number(args[limitAt + 1]);

// Strict: a mistyped `--dryrun` would otherwise write for real.
const unknown = args.filter(
  (arg, i) =>
    arg !== '--dry-run' && arg !== '--limit' && (limitAt === -1 || i !== limitAt + 1),
);
if (unknown.length || (LIMIT !== null && !(Number.isInteger(LIMIT) && LIMIT > 0))) {
  console.error('usage: node scripts/portfolio-to-showcases.mjs [--dry-run] [--limit N]');
  process.exit(2);
}

const config = new ConfigService();
const db = new DatabaseService(config);

/**
 * Every portfolio photograph that is not in a showcase yet.
 *
 * Joined to user_files so a row whose file has since been deleted, or whose
 * owner no longer matches, is left behind rather than becoming a showcase that
 * can never render. `thumb_key is not null` for the same reason the public
 * portfolio read requires it: without a web copy there is nothing to show, and
 * the thumbnail backfill is the tool for those.
 */
const CANDIDATES = `
  select p.id, p.user_id, p.file_key, p.caption, p.created_at
    from portfolio_items p
    join user_files f
      on f.key = p.file_key
     and f.user_id = p.user_id
     and f.content_type like 'image/%'
     and f.thumb_key is not null
   where p.kind = 'image'
     and not exists (
       select 1 from showcase_items si
         join showcases s on s.id = si.showcase_id
        where s.user_id = p.user_id and si.file_key = p.file_key
     )
   order by p.user_id, p.position, p.created_at
`;

const rows = await db.query(LIMIT ? `${CANDIDATES} limit ${LIMIT}` : CANDIDATES);

const owners = new Set(rows.map((r) => r.user_id));
console.log(
  `${rows.length} portfolio photograph(s) to copy, across ${owners.size} profile(s)` +
    (DRY ? ' (dry run)' : ''),
);

// Said before the work rather than after, because it is the thing somebody
// reading the output needs to decide whether to let it run.
const skipped = await db.queryOne(
  `select count(*)::text as count from portfolio_items where kind = 'album'`,
);
if (Number(skipped?.count ?? 0) > 0) {
  console.log(
    `${skipped.count} showcased album(s) left alone — a gallery is not a showcase, and they keep rendering as galleries.`,
  );
}

if (DRY) {
  for (const row of rows.slice(0, 20)) {
    console.log(`  ${row.user_id}  ${row.file_key}${row.caption ? `  "${row.caption}"` : ''}`);
  }
  if (rows.length > 20) console.log(`  … and ${rows.length - 20} more`);
  console.log('\nDry run: nothing was written.');
  await db.onModuleDestroy();
  process.exit(0);
}

let made = 0;
let failed = 0;

for (const row of rows) {
  try {
    // One transaction per photograph. A failure on one leaves the rest of the
    // run intact, and the next run picks it up again because the skip test is
    // "is it in a showcase yet", not a flag this script wrote.
    await db.transaction(async (client) => {
      const created = await client.query(
        `insert into showcases (user_id, title, published_at, created_at)
         values ($1, $2, $3, $3)
         returning id`,
        [row.user_id, row.caption ?? null, row.created_at],
      );
      await client.query(
        `insert into showcase_items (showcase_id, user_id, file_key, position)
         values ($1, $2, $3, 0)`,
        [created.rows[0].id, row.user_id, row.file_key],
      );
    });
    made++;
  } catch (err) {
    failed++;
    console.error(`  failed ${row.user_id} ${row.file_key}: ${String(err?.message ?? err)}`);
  }
}

console.log(`\nmade=${made} failed=${failed}`);

const left = await db.query(CANDIDATES);
if (left.length > 0) {
  console.log(`${left.length} photograph(s) still to copy — run it again.`);
}

await db.onModuleDestroy();
// Non-zero while anything is outstanding, so a deploy step notices.
process.exit(failed > 0 ? 1 : 0);
