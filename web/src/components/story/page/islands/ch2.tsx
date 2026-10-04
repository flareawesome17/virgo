'use client';

import dynamic from 'next/dynamic';
import { CH2_FILM_SVH } from '../scenes/ch2-timing';
import { FilmSlot } from './ch1';

/**
 * Ch2's motion half (05-cinema.md §5): a lazy client film that loads as the
 * chapter nears the viewport and plays only while the motion gate is on. The
 * film publishes the shared sky's radar (sky/nearby.ts) on its own clock.
 */
const Film = dynamic(() => import('../scenes/ch2-film'), { ssr: false });

export function Ch2Motion() {
  return (
    <FilmSlot svh={CH2_FILM_SVH}>
      <Film />
    </FilmSlot>
  );
}
