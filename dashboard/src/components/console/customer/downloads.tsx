'use client';

import { useState } from 'react';
import type { CustomerDownloads } from '@/api/console';
import { useCustomerDownloads, useMe, useSetDownloadExtra } from '@/hooks/useConsole';
import { DataState, Panel, bytes } from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** The API counts the extra in GiB, as `bytes` shows them. */
const GB = 1024 ** 3;
/** The most one month's extra can be; the API refuses more. */
const MAX_EXTRA_GB = 1000;
const QUICK_ADD_GB = [15, 45, 90];

/** "Nov 1". The month turns at midnight UTC, so the day is read in UTC too. */
function resetDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * What the account's client links delivered this month against the
 * allowance, and — for staff who manage billing — extra for this month only.
 *
 * Its own query, apart from subscriptions and promos, so a failure in one
 * does not hide the other.
 */
export function DownloadsPanel({ id }: { id: string }) {
  const { can } = useMe();
  const { data, isLoading, isError, refetch } = useCustomerDownloads(id);

  return (
    <Panel
      title="Client downloads this month"
      action={data?.paused && <Badge variant="destructive">Paused</Badge>}
    >
      <DataState isLoading={isLoading} isError={isError} isEmpty={false} onRetry={() => void refetch()}>
        {data && (
          <div className="grid gap-5 lg:grid-cols-2">
            <Usage usage={data} />
            <div className="border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
              {data.limitBytes === null ? (
                <p className="text-xs text-muted-foreground">
                  Their plan has no monthly download limit, so there is nothing to add.
                </p>
              ) : can('billing.manage') ? (
                <ExtraControls id={id} usage={data} />
              ) : (
                <p className="text-xs text-muted-foreground">Your role cannot add extra downloads.</p>
              )}
            </div>
          </div>
        )}
      </DataState>
    </Panel>
  );
}

function Usage({ usage: u }: { usage: CustomerDownloads }) {
  const limit = u.limitBytes;
  const share = limit === null ? 0 : Math.min(1, u.usedBytes / Math.max(1, limit));
  const extraGb = Math.round(u.extraBytes / GB);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm">
          Delivered <span className="font-semibold tabular-nums">{bytes(u.usedBytes)}</span>
          {limit === null ? (
            <span className="text-muted-foreground"> · Unlimited</span>
          ) : (
            <>
              {' '}of <span className="font-semibold tabular-nums">{bytes(limit)}</span>
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">Resets {resetDay(u.resetsAt)}</p>
      </div>
      {limit !== null && (
        <div
          role="progressbar"
          aria-label="Client downloads delivered this month"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share * 100)}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width]',
              u.paused || share >= 1 ? 'bg-destructive' : share >= 0.8 ? 'bg-warning' : 'bg-primary',
            )}
            style={{ width: `${share * 100}%` }}
          />
        </div>
      )}
      {u.extraBytes > 0 && (
        <p className="text-xs text-muted-foreground">Includes {extraGb} GB extra from staff</p>
      )}
    </div>
  );
}

/**
 * The API replaces the month's extra with what it is sent, so the quick
 * buttons add to what is there and send the new total.
 */
function ExtraControls({ id, usage: u }: { id: string; usage: CustomerDownloads }) {
  const setExtra = useSetDownloadExtra(id);
  const [draft, setDraft] = useState('');

  const extraGb = Math.round(u.extraBytes / GB);
  const planBytes = (u.limitBytes ?? 0) - u.extraBytes;
  const resets = resetDay(u.resetsAt);
  const asNumber = Number(draft);
  const typed =
    draft.trim() !== '' && Number.isInteger(asNumber) && asNumber >= 0 && asNumber <= MAX_EXTRA_GB
      ? asNumber
      : null;

  function save(gigabytes: number, question: string) {
    const after = planBytes + gigabytes * GB;
    const consequence =
      u.usedBytes >= after
        ? `They have already delivered ${bytes(u.usedBytes)}, so client downloads ${u.paused ? 'stay' : 'will be'} paused.`
        : `Their allowance becomes ${bytes(after)} until ${resets}.`;
    if (!confirm(`${question} ${consequence}`)) return;
    setExtra.mutate(gigabytes, { onSuccess: () => setDraft('') });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">Extra for this month</p>
      <div className="flex flex-wrap gap-2">
        {QUICK_ADD_GB.map((n) => (
          <Button
            key={n}
            size="sm"
            variant="outline"
            disabled={setExtra.isPending || extraGb + n > MAX_EXTRA_GB}
            onClick={() =>
              save(
                extraGb + n,
                extraGb > 0
                  ? `Add ${n} GB, making this month's extra ${extraGb + n} GB?`
                  : `Give them ${n} GB extra this month?`,
              )
            }
          >
            +{n} GB
          </Button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed === null || typed === extraGb) return;
          save(typed, typed === 0 ? `Remove the ${extraGb} GB extra?` : `Set this month's extra to ${typed} GB?`);
        }}
      >
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_EXTRA_GB}
          step={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={String(extraGb)}
          aria-label="Extra gigabytes this month"
          aria-invalid={draft.trim() !== '' && typed === null}
          className="h-7 w-20 tabular-nums"
        />
        <span className="text-xs text-muted-foreground">GB</span>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          disabled={setExtra.isPending || typed === null || typed === extraGb}
        >
          Set extra
        </Button>
        {extraGb > 0 && (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={setExtra.isPending}
            onClick={() => save(0, `Remove the ${extraGb} GB extra?`)}
          >
            Remove extra
          </Button>
        )}
      </form>
      <p className="text-[11px] text-muted-foreground">
        Extra applies to this month only and lapses on the 1st. Use it when a photographer is paused
        and can&apos;t upgrade.
      </p>
    </div>
  );
}
