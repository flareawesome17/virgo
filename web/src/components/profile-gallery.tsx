'use client';

import { useState } from 'react';
import Image from 'next/image';
import { ArrowUpRight, Grid3x3, ImageIcon, Layers } from 'lucide-react';
import type { PortfolioAlbum, PortfolioImage } from '@/api';

/**
 * The work, as a social profile shows it.
 *
 * A tight square grid rather than the padded cards this page had before. That
 * is the convention every photographer already knows from Instagram, and it is
 * the right one here for a reason beyond familiarity: uniform crops let a
 * stranger compare twelve photographs at a glance, which is the entire job of
 * this page. Captions stay out of the way until hover.
 *
 * A client component only because of the tab state. Both panels are rendered
 * into the HTML and the inactive one is hidden with CSS, so a crawler still
 * reads every image and gallery.
 */
export function ProfileGallery({
  images,
  albums,
  displayName,
}: {
  images: PortfolioImage[];
  albums: PortfolioAlbum[];
  displayName: string;
}) {
  const [tab, setTab] = useState<'work' | 'galleries'>(
    images.length > 0 ? 'work' : 'galleries',
  );

  if (images.length === 0 && albums.length === 0) {
    return (
      <div className="border-t border-white/8 px-5 py-16 text-center sm:px-8">
        <ImageIcon className="mx-auto size-7 text-white/15" />
        <p className="mt-3 text-[13px] text-white/35">
          {displayName.split(' ')[0]} has not added any work yet.
        </p>
      </div>
    );
  }

  // No counts on the labels: the stats row directly above already carries
  // them, and printing "Work 3" twice within 60px reads like a mistake.
  const tabs = [
    { key: 'work' as const, label: 'Work', icon: Grid3x3, count: images.length },
    { key: 'galleries' as const, label: 'Galleries', icon: Layers, count: albums.length },
  ].filter((t) => t.count > 0);

  return (
    <div className="border-t border-white/8">
      {/* Only worth a tab bar when there is something to switch between. */}
      {tabs.length > 1 && (
        <div className="flex justify-center gap-10">
          {tabs.map(({ key, label, icon: Icon, count }) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-selected={active}
                // The active marker is a top border that sits on the section
                // divider, the way Instagram marks the selected tab.
                className={`-mt-px flex items-center gap-2 border-t-2 py-4 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                  active
                    ? 'border-[#c17745] text-white'
                    : 'border-transparent text-white/35 hover:text-white/60'
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {images.length > 0 && (
        <div
          hidden={tab !== 'work'}
          className="grid grid-cols-3 gap-0.5 sm:gap-1"
        >
          {images.map((item) => (
            <figure
              key={item.id}
              className="group relative aspect-square overflow-hidden bg-white/[0.04]"
            >
              <Image
                src={item.url}
                alt={item.caption ?? ''}
                fill
                // Three across at every width, so a phone never pulls a
                // desktop-sized file for a thumbnail.
                sizes="(max-width: 640px) 33vw, 300px"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.05]"
              />
              {item.caption && (
                <figcaption className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-black/10 to-transparent p-3 text-[12px] font-medium text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  {item.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}

      {albums.length > 0 && (
        <div
          hidden={tab !== 'galleries'}
          className="grid gap-2 p-2 sm:grid-cols-2 sm:gap-3 sm:p-4"
        >
          {albums.map((album) => (
            <a
              key={album.id}
              href={album.url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex aspect-[16/10] items-end overflow-hidden rounded-xl bg-white/[0.04]"
            >
              {album.coverUrl ? (
                <Image
                  src={album.coverUrl}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 100vw, 400px"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-[#c17745]/10">
                  <Layers className="size-7 text-[#c17745]/60" />
                </div>
              )}

              <div className="relative w-full bg-gradient-to-t from-black/85 to-transparent p-4 pt-10">
                <p className="flex items-center gap-1.5 text-[15px] font-bold text-white">
                  {album.name}
                  <ArrowUpRight className="size-4 shrink-0 text-white/50 transition-colors group-hover:text-[#c17745]" />
                </p>
                <p className="mt-0.5 text-[12px] text-white/55">
                  {album.itemCount} {album.itemCount === 1 ? 'photo' : 'photos'}
                  {album.caption ? ` · ${album.caption}` : ''}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
