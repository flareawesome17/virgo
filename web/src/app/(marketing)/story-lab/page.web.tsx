import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

/**
 * The story site's asset lab: every mock, the sky, the map and the stills,
 * rendered on their own for visual QA. Development only — production 404s,
 * and the proxy never routes the apex here anyway.
 *
 * The list is read from disk on each request, so an area appears the moment
 * its folder has a page: no registry to keep in step.
 */
export const metadata: Metadata = {
  title: 'Story lab',
  robots: { index: false, follow: false },
};

type Area = { slug: string; title: string; blurb: string };

/** Where this folder is, whether `next dev` runs from web/ or the repo root. */
function labDir(): string | null {
  for (const base of [process.cwd(), join(process.cwd(), 'web')]) {
    const dir = join(base, 'src', 'app', '(marketing)', 'story-lab');
    if (existsSync(dir)) return dir;
  }
  return null;
}

function readAreas(): Area[] {
  const dir = labDir();
  if (!dir) return [];
  return readdirSync(dir)
    .filter((name) => !/^[_.(\[@]/.test(name) && statSync(join(dir, name)).isDirectory())
    .flatMap((slug) => {
      const page = ['page.web.tsx', 'page.tsx'].map((f) => join(dir, slug, f)).find((f) => existsSync(f));
      if (!page) return [];
      const source = readFileSync(page, 'utf8');
      // The page's own metadata title, and the first line of its first doc
      // comment, if it has them.
      const title = /title:\s*['"`]([^'"`]+)['"`]/.exec(source)?.[1] ?? slug;
      const blurb = /\/\*\*\s*\n\s*\*\s*([^\n]+)/.exec(source)?.[1]?.trim() ?? '';
      return [{ slug, title: title.replace(/^Story lab\s*[·:—-]\s*/i, ''), blurb }];
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export default async function StoryLab() {
  if (process.env.NODE_ENV === 'production') notFound();
  await connection();
  const areas = readAreas();

  return (
    <main className="min-h-dvh bg-[#161311] px-4 py-14 text-[#F2EDE8] sm:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="figure text-[11px] uppercase tracking-[0.14em] text-[#A08E84]">virgo.ph · development only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.02em]">Story lab</h1>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-[#BCADA3]">
          Assets for the story site, one area per page. Each renders its mocks, frames and stills on their own, at
          every state, for visual QA.
        </p>

        {areas.length === 0 ? (
          <p className="mt-10 rounded-xl border border-dashed border-[#362F2B] px-5 py-8 text-sm text-[#A08E84]">
            No areas yet. Add a folder with a <code className="figure">page.web.tsx</code> beside this page.
          </p>
        ) : (
          <ul className="mt-10 divide-y divide-[#362F2B] overflow-hidden rounded-xl border border-[#362F2B] bg-[#1E1B18]">
            {areas.map((a) => (
              <li key={a.slug}>
                <a
                  href={`/story-lab/${a.slug}`}
                  className="flex items-baseline gap-4 px-5 py-4 transition-colors hover:bg-[#26221F] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#F2EDE8]"
                >
                  <span className="figure w-32 shrink-0 text-[12px] text-[#D18A5A]">/{a.slug}</span>
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium">{a.title}</span>
                    {a.blurb && <span className="mt-0.5 block text-[13px] leading-snug text-[#A08E84]">{a.blurb}</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
