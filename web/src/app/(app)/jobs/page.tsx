import { redirect } from 'next/navigation';

/**
 * The board's short address.
 *
 * The proxy sends `virgo.ph/jobs` — the old public board, and still the
 * address anybody would guess — to this host unchanged, where nothing
 * answered it: a 404. The board lives on the Jobs screen, which opens on
 * Browse.
 */
export default function JobsPage() {
  redirect('/jobs/mine');
}
