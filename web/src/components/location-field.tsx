'use client';

import { useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { suggestLocations } from '@/lib/ph-locations';
import { cn } from '@/lib/utils';

/**
 * A place, with suggestions.
 *
 * Still a text input, deliberately: shoots happen at resorts, churches and
 * barangays as often as in a city, so anything that forces a pick from a list
 * would make the common case harder than the plain box it replaced.
 *
 * What the suggestions buy is spelling. Search matches on the string, so
 * "Ozamis" and "Ozamiz" are two different places as far as the board is
 * concerned, and a post using the less common one is invisible to everyone
 * searching the other.
 */
export function LocationField({
  value,
  onChange,
  placeholder = 'Cebu City',
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  id?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = focused ? suggestLocations(value) : [];
  const showing = suggestions.length > 0;

  const choose = (city: string) => {
    onChange(city);
    setFocused(false);
  };

  return (
    <div className="relative">
      <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        className="pl-9"
        autoComplete="off"
        role="combobox"
        aria-expanded={showing}
        onChange={(e) => {
          onChange(e.target.value);
          setHighlight(0);
        }}
        onFocus={() => {
          // Cancel a close still pending from a previous blur. Without this,
          // clicking away and straight back leaves the list shut: focus sets
          // it open, then the stale timer fires and closes it again.
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          // A click on a suggestion blurs the input first; without the delay
          // the list unmounts before the click lands and nothing is selected.
          blurTimer.current = setTimeout(() => setFocused(false), 120);
        }}
        onKeyDown={(e) => {
          if (!showing) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => (h + 1) % suggestions.length);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(suggestions[highlight]);
          } else if (e.key === 'Escape') {
            setFocused(false);
          }
        }}
      />

      {showing && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover p-1 shadow-md"
          onMouseDown={() => {
            // Beat the blur timer: this fires before onBlur resolves.
            if (blurTimer.current) clearTimeout(blurTimer.current);
          }}
        >
          {suggestions.map((city, i) => (
            <li key={city}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm',
                  i === highlight ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
                )}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(city)}
              >
                <MapPin className="size-3.5 text-muted-foreground" />
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
