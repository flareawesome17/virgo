'use client';

import { Screen } from '@/components/app-shell';
import { DesktopHome } from '@/components/home/desktop-home';
import { useHome } from '@/components/home/use-home';
import { WebHome } from '@/components/home/web-home';
import { IS_DESKTOP } from '@/lib/desktop';

/**
 * Home: your day.
 *
 * One set of facts (useHome), two layouts. The web lays it out in two roomy
 * columns for somebody arriving from a browser tab. The desktop app lays it
 * out in three dense ones for a window kept open all day, and adds the files
 * moving on this computer.
 */
export default function HomePage() {
  const home = useHome();
  return <Screen title="Home">{IS_DESKTOP ? <DesktopHome home={home} /> : <WebHome home={home} />}</Screen>;
}
