'use client';

import type { AudienceFilters, Tag } from '@/api/console';
import { useAudience, useTags } from '@/hooks/useConsole';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { num, when } from './primitives';

const ANY = '__any';

const PLANS = [
  { value: '', label: 'Any plan' },
  { value: 'free', label: 'Free' },
  { value: 'freelance', label: 'Freelancer' },
  { value: 'studio', label: 'Studio' },
  { value: 'business', label: 'Business' },
  { value: 'pro', label: 'Pro (old)' },
];
const STATUSES = [
  { value: '', label: 'Any state' },
  { value: 'active', label: 'Active' },
  { value: 'unverified', label: 'Email not confirmed' },
  { value: 'paused', label: 'Paused' },
];
const SEEN = [
  { value: '', label: 'Any time' },
  { value: 'week', label: 'In the last 7 days' },
  { value: 'month', label: 'In the last 30 days' },
  { value: 'quiet', label: 'Not for 30 days' },
  { value: 'dormant', label: 'Not for 90 days' },
];
const PLATFORMS = [
  { value: '', label: 'Any' },
  { value: 'ios', label: 'iPhone' },
  { value: 'android', label: 'Android' },
];
const REFERRED = [
  { value: '', label: 'Either' },
  { value: 'yes', label: 'Joined through a referral' },
  { value: 'no', label: 'Joined on their own' },
];
const TWO_FACTOR = [
  { value: '', label: 'Any' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const label = (list: { value: string; label: string }[], value?: string) =>
  list.find((o) => o.value === value)?.label;

/** An audience in a line, for lists: "Studio plan · seen in the last 30 days". */
export function describeAudience(f: AudienceFilters, tags?: Tag[]): string {
  const parts: string[] = [];
  if (f.plan) parts.push(`${label(PLANS, f.plan) ?? f.plan} plan`);
  if (f.status) parts.push((label(STATUSES, f.status) ?? f.status).toLowerCase());
  if (f.seen) parts.push(`seen: ${(label(SEEN, f.seen) ?? f.seen).toLowerCase()}`);
  if (f.tag) parts.push(`tagged ${tags?.find((t) => t.id === f.tag)?.label ?? 'with a tag'}`);
  if (f.platform) parts.push(`${label(PLATFORMS, f.platform)} app`);
  if (f.versionBelow) parts.push(`app older than ${f.versionBelow}`);
  if (f.referred) parts.push((label(REFERRED, f.referred) ?? '').toLowerCase());
  if (f.joinedAfter) parts.push(`joined from ${f.joinedAfter}`);
  if (f.joinedBefore) parts.push(`joined by ${f.joinedBefore}`);
  if (f.storageAbove) parts.push(`using ${f.storageAbove}%+ of storage`);
  if (f.twoFactor) parts.push(`two-factor ${f.twoFactor}`);
  if (f.q) parts.push(`matching “${f.q}”`);
  return parts.length ? parts.join(' · ') : 'Everyone';
}

/**
 * The people list's filters, for building an audience. Changes go up
 * whole; nothing here is sent until the caller saves or sends.
 */
export function AudienceEditor({
  value,
  onChange,
}: {
  value: AudienceFilters;
  onChange: (next: AudienceFilters) => void;
}) {
  const { data: tags } = useTags();
  const set = (patch: Partial<AudienceFilters>) => {
    const next = { ...value, ...patch };
    for (const key of Object.keys(next) as (keyof AudienceFilters)[]) {
      if (next[key] === undefined || next[key] === '') delete next[key];
    }
    onChange(next);
  };
  const pick = (
    id: string,
    text: string,
    current: string | undefined,
    options: { value: string; label: string }[],
    onPick: (v: string | undefined) => void,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {text}
      </Label>
      <Select value={current || ANY} onValueChange={(v) => onPick(v === ANY ? undefined : v)}>
        <SelectTrigger id={id} size="sm" className="w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value || ANY} value={o.value || ANY}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {pick('aud-plan', 'Plan', value.plan, PLANS, (v) => set({ plan: v }))}
      {pick('aud-status', 'Account', value.status, STATUSES, (v) => set({ status: v }))}
      {pick('aud-seen', 'Last seen', value.seen, SEEN, (v) => set({ seen: v }))}
      {pick(
        'aud-tag',
        'Tag',
        value.tag,
        [{ value: '', label: 'Any tag' }, ...(tags ?? []).map((t) => ({ value: t.id, label: t.label }))],
        (v) => set({ tag: v }),
      )}
      {pick('aud-platform', 'Phone app', value.platform, PLATFORMS, (v) => set({ platform: v }))}
      <div className="space-y-1">
        <Label htmlFor="aud-version" className="text-xs text-muted-foreground">
          App older than
        </Label>
        <Input
          id="aud-version"
          value={value.versionBelow ?? ''}
          onChange={(e) => set({ versionBelow: e.target.value.trim() || undefined })}
          placeholder="1.16.0"
          className="h-8 text-xs"
        />
      </div>
      {pick('aud-referred', 'How they joined', value.referred, REFERRED, (v) => set({ referred: v }))}
      {pick('aud-2fa', 'Two-factor', value.twoFactor, TWO_FACTOR, (v) => set({ twoFactor: v }))}
      <div className="space-y-1">
        <Label htmlFor="aud-after" className="text-xs text-muted-foreground">
          Joined on or after
        </Label>
        <Input
          id="aud-after"
          type="date"
          value={value.joinedAfter ?? ''}
          onChange={(e) => set({ joinedAfter: e.target.value || undefined })}
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="aud-before" className="text-xs text-muted-foreground">
          Joined on or before
        </Label>
        <Input
          id="aud-before"
          type="date"
          value={value.joinedBefore ?? ''}
          onChange={(e) => set({ joinedBefore: e.target.value || undefined })}
          className="h-8 text-xs"
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="aud-storage" className="text-xs text-muted-foreground">
          Using at least this much of what they may store (%)
        </Label>
        <Input
          id="aud-storage"
          type="number"
          min={1}
          max={100}
          value={value.storageAbove ?? ''}
          onChange={(e) => set({ storageAbove: e.target.value ? Number(e.target.value) : undefined })}
          placeholder="Any"
          className="h-8 w-32 text-xs"
        />
      </div>
    </div>
  );
}

/**
 * Who an audience reaches, counted by the API as the filters settle: how
 * many, how many a push can reach, and a few of them by name. Suspended
 * accounts are never counted.
 */
export function AudienceCount({ filters, compact = false }: { filters: AudienceFilters; compact?: boolean }) {
  const settled = useDebouncedValue(filters, 400);
  const { data, isFetching, isError } = useAudience(settled);

  if (isError) return <p className="text-xs text-destructive">Could not count them.</p>;
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="text-sm">
        <span className="text-lg font-semibold tabular-nums">{data ? num(data.count) : '…'}</span>{' '}
        {data?.count === 1 ? 'person' : 'people'}
        {data && (
          <span className="text-muted-foreground"> · {num(data.withPhone)} with a phone app</span>
        )}
        {isFetching && <span className="ml-2 text-xs text-muted-foreground">counting…</span>}
      </p>
      {!compact && data && data.preview.length > 0 && (
        <ul className="divide-y rounded-md border text-xs">
          {data.preview.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="min-w-0 truncate">
                <span className="font-medium">{p.name}</span>{' '}
                <span className="text-muted-foreground">{p.email}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">{when(p.last_seen_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
