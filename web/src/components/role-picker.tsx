'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRoles } from '@/hooks/useRoles';

/**
 * Picks what someone does on a shoot.
 *
 * Chips rather than a multi-select: holding several is normal — a photographer
 * who also cuts the same-day edit holds both — and a list where that reads as
 * an exception gets filled in wrong.
 *
 * Shared by sign-up, the profile editor and the prompt shown to accounts that
 * predate roles, so all three offer exactly the same thing.
 */
export function RolePicker({
  selected,
  onChange,
  /** Renders counts beside each role, e.g. how many are nearby. */
  counts,
  disabled,
  className,
}: {
  selected: string[];
  onChange: (roles: string[]) => void;
  counts?: Record<string, number>;
  disabled?: boolean;
  className?: string;
}) {
  const { roles, isLoading } = useRoles();

  if (isLoading && roles.length === 0) {
    return <p className="text-xs text-muted-foreground">Loading roles…</p>;
  }

  const toggle = (role: string) =>
    onChange(
      selected.includes(role)
        ? selected.filter((r) => r !== role)
        : [...selected, role],
    );

  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {roles.map((role) => {
        const isSelected = selected.includes(role);
        const count = counts?.[role];
        // Only when counts were asked for: a role nobody nearby does is worth
        // showing greyed rather than hiding, or the list changes shape as
        // people move around.
        const empty = counts !== undefined && !count;

        return (
          <button
            key={role}
            type="button"
            disabled={disabled}
            onClick={() => toggle(role)}
            aria-pressed={isSelected}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
              isSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border hover:bg-accent',
              empty && !isSelected && 'text-muted-foreground opacity-60',
              disabled && 'pointer-events-none opacity-50',
            )}
          >
            {isSelected && <Check className="size-3" />}
            {role}
            {counts !== undefined && (
              <span
                className={cn(
                  'tabular-nums',
                  isSelected ? 'opacity-80' : 'text-muted-foreground',
                )}
              >
                {count ?? 0}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
