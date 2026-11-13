'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NAV, isActive, useNavCounts } from '@/components/shell/nav';

/**
 * The desktop app's navigation: the same nine places as the web sidebar, as a
 * rail of icons in the window's own dark frame.
 *
 * The web gives the places a quarter of the window, with their names, because
 * a browser tab is somewhere people arrive cold. The desktop app is opened by
 * somebody who uses it every day, on a screen they are filling with their own
 * work; it gives that width back and names a place when the pointer rests on
 * it. A dot says something is waiting; the tooltip says how many.
 *
 * `dark` on the element, whatever the theme: the frame is dark in both, so
 * everything drawn on it takes the dark palette's colours.
 */
export function DesktopRail() {
  const pathname = usePathname();
  const counts = useNavCounts();

  return (
    <nav
      aria-label="Main"
      className="dark no-scrollbar flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto pb-2 pt-1 text-foreground"
    >
      {NAV.map((group, i) => (
        <Fragment key={group.heading ?? i}>
          {i > 0 && <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-border" />}
          {group.items.map((item) => {
            const active = isActive(item, pathname);
            const count = item.badge ? counts[item.badge] : 0;
            const Icon = item.icon;
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    aria-label={count > 0 ? `${item.label}, ${count} waiting` : item.label}
                    className={cn(
                      'relative grid size-10 shrink-0 place-items-center rounded-[10px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'bg-muted text-primary'
                        : 'text-secondary-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                  >
                    <Icon className="size-[19px]" />
                    {count > 0 && (
                      <span
                        aria-hidden
                        className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-[var(--frame)]"
                      />
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {item.label}
                  {count > 0 ? ` · ${count > 99 ? '99+' : count}` : ''}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </Fragment>
      ))}
    </nav>
  );
}
