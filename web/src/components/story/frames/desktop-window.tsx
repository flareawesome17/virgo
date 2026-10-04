import type { ReactNode } from 'react';
import {
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  FolderOpen,
  Home,
  Images,
  LayoutGrid,
  LifeBuoy,
  MapPin,
  MessageCircle,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { APP_NAME, DESKTOP_NAV, DESKTOP_USER, type NavIcon, type NavKey } from '../data/strings/common';
import { Avatar } from '../mocks/avatar';
import { WindowDots } from './browser-frame';
import { VirgoMark } from './mark';

/**
 * The Virgo desktop app (Tauri, Windows and macOS), drawn from its own
 * chrome rather than a generic window:
 *
 * - `desktop/src-tauri/tauri.conf.json`: window background `#161311`.
 * - `web/src/components/desktop-title-bar.tsx`: a 32 px strip, border-b, the
 *   14 px mark and "Virgo" in 12 px medium muted. On Windows (decorations
 *   off) it carries its own 46 × 32 minimise / maximise / close buttons with
 *   10 px 1 px-stroke glyphs at foreground/70. On macOS the native traffic
 *   lights float over it and the strip starts at 80 px.
 * - `web/src/components/app-shell.tsx`: the 256 px sidebar on `#1A1715`,
 *   its head (32 px mark, "Virgo" 14 px bold), the nav in the app's order
 *   and styling, and the account footer.
 *
 * The sidebar needs room, so below `md` it is left out and the window shows
 * its content alone. Rewards and the "Creative OS" line are omitted on
 * purpose (see `strings/common.ts`).
 *
 * Wrap it in a `Slab` with `radius={desktopRadius(os)}` for thickness.
 *
 * Parts: desktop-window, title-bar, sidebar, nav-item (data-active),
 * nav-badge, window-content.
 */

export type DesktopOS = 'windows' | 'macos';

export function desktopRadius(os: DesktopOS) {
  return os === 'macos' ? 'rounded-[10px]' : 'rounded-lg';
}

const ICONS: Record<NavIcon, LucideIcon> = {
  Home,
  LayoutGrid,
  FolderOpen,
  Images,
  CalendarDays,
  Users,
  MessageCircle,
  MapPin,
  BriefcaseBusiness,
  FileText,
  Bell,
  LifeBuoy,
};

/** Windows' own caption glyphs: 10 px, 1 px stroke (desktop-title-bar.tsx). */
function CaptionButtons() {
  const glyph = 'grid h-full w-[46px] place-items-center text-[#F2EDE8]/70';
  return (
    <span aria-hidden className="flex h-full">
      <span className={glyph}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M0 5h10" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
      </span>
      <span className={glyph}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" fill="none" strokeWidth="1" />
        </svg>
      </span>
      <span className={glyph}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" fill="none" />
        </svg>
      </span>
    </span>
  );
}

function Sidebar({ active, badges }: { active?: NavKey; badges: Partial<Record<NavKey, number>> }) {
  return (
    <aside
      data-part="sidebar"
      className="hidden w-64 shrink-0 flex-col overflow-hidden border-r border-[#362F2B] bg-[#1A1715] md:flex"
    >
      <div className="flex h-14 items-center gap-2.5 px-5">
        <VirgoMark size={32} />
        <p className="truncate text-sm font-bold leading-none">{APP_NAME}</p>
      </div>
      <div className="flex flex-col gap-6 px-3 py-2">
        {DESKTOP_NAV.map((group, i) => (
          <div key={group.heading ?? i} className="flex flex-col gap-1">
            {group.heading && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A08E84]">
                {group.heading}
              </p>
            )}
            {group.items.map((item) => {
              const on = item.key === active;
              const Icon = ICONS[item.icon];
              const count = badges[item.key];
              return (
                <div
                  key={item.key}
                  data-part="nav-item"
                  data-active={on ? '' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                    on ? 'bg-[#2A2522] text-[#F2EDE8]' : 'text-[#A08E84]'
                  }`}
                >
                  <Icon aria-hidden className={`size-4 shrink-0 ${on ? 'text-[#D18A5A]' : ''}`} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {count ? (
                    <span
                      data-part="nav-badge"
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#D18A5A] px-1.5 text-[11px] font-medium tabular-nums text-[#161311]"
                    >
                      {count > 99 ? '99+' : count}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center gap-3 border-t border-[#362F2B] p-3">
        <Avatar surface="workspace" name={DESKTOP_USER.name} size={32} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{DESKTOP_USER.name}</p>
          <p className="truncate text-xs text-[#A08E84]">{DESKTOP_USER.email}</p>
        </div>
      </div>
    </aside>
  );
}

export function DesktopWindow({
  os = 'windows',
  sidebar = true,
  active,
  badges = {},
  children,
  width = '100%',
  className = '',
  contentClassName = '',
}: {
  os?: DesktopOS;
  /** The app shell's sidebar (from md up). */
  sidebar?: boolean;
  /** The nav item lit as the current page. */
  active?: NavKey;
  /** Counts on nav items, as the app badges them. */
  badges?: Partial<Record<NavKey, number>>;
  children?: ReactNode;
  width?: string | number;
  className?: string;
  /** Classes for the page area beside the sidebar (height, padding). */
  contentClassName?: string;
}) {
  return (
    <div
      data-part="desktop-window"
      data-os={os}
      className={`flex flex-col overflow-hidden ${desktopRadius(os)} border border-[#362F2B] bg-[#161311] font-sans text-[#F2EDE8] ${className}`}
      style={{ width }}
    >
      <div
        data-part="title-bar"
        className={`relative flex h-8 shrink-0 items-center border-b border-[#362F2B] bg-[#161311] ${
          os === 'windows' ? 'pl-3' : 'pl-20'
        }`}
      >
        {os === 'macos' && (
          // The native lights, floating over the strip (titleBarStyle Overlay).
          <span className="absolute left-3 top-1/2 -translate-y-1/2">
            <WindowDots size={12} />
          </span>
        )}
        <span className="flex items-center gap-2">
          <VirgoMark size={14} />
          <span className="text-xs font-medium text-[#A08E84]">{APP_NAME}</span>
        </span>
        <span className="flex-1" />
        {os === 'windows' && <CaptionButtons />}
      </div>
      <div className="flex min-h-0 flex-1">
        {sidebar && <Sidebar active={active} badges={badges} />}
        <div data-part="window-content" className={`relative min-w-0 flex-1 ${contentClassName}`}>
          {children}
        </div>
      </div>
    </div>
  );
}
