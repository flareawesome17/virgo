import { LAB_FILES, readLabFile } from '../../_lib/assets';

/**
 * Serves the map levels and the grain tile from marketing-assets/assets to the
 * map lab, uncached, so a rebuild shows on reload. Development only: in
 * production it answers 404 before touching the disk.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  if (process.env.NODE_ENV === 'production') return new Response('Not found', { status: 404 });
  const { name } = await params;
  const file = LAB_FILES[name];
  const body = file ? readLabFile(name) : null;
  if (!file || !body) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: { 'content-type': file.type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}
