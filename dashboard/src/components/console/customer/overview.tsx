'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Pin } from 'lucide-react';
import type { CustomerDetail } from '@/api/console';
import { useMe, useSetUserDisabled, useSetUserPlan } from '@/hooks/useConsole';
import { Field, Panel, day, peso, when } from '@/components/console/primitives';
import { isSuspended } from '@/lib/account-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Used only when the API is older than the list it now sends. */
const FALLBACK_PLANS = [
  { name: 'free', label: 'Free' },
  { name: 'freelance', label: 'Freelancer' },
  { name: 'studio', label: 'Studio' },
  { name: 'business', label: 'Business' },
];

function address(u: CustomerDetail['user']): string | null {
  const parts = [
    u.address_line1,
    u.address_line2,
    u.address_city,
    u.address_province,
    u.address_postal,
    u.address_country,
  ].filter((p) => p && p.trim());
  return parts.length ? parts.join(', ') : null;
}

export function OverviewTab({
  customer: d,
  onOpenNotes,
}: {
  customer: CustomerDetail;
  onOpenNotes: () => void;
}) {
  const u = d.user;
  const pinned = d.pinnedNotes ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {pinned.length > 0 && (
        <Panel
          title="Pinned notes"
          className="border-warning/40 lg:col-span-2"
          action={
            <Button variant="ghost" size="xs" onClick={onOpenNotes}>
              All notes
            </Button>
          }
          bodyClassName="space-y-2"
        >
          {pinned.map((n) => (
            <div key={n.id} className="flex gap-2 text-sm">
              <Pin className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <p className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">{n.body}</p>
              <span className="shrink-0 text-xs text-muted-foreground">
                {n.admin_name} · {when(n.created_at)}
              </span>
            </div>
          ))}
        </Panel>
      )}

      <Panel title="Account" bodyClassName="py-2">
        <Field label="Joined" value={day(u.created_at)} />
        <Field label="Last seen" value={when(u.last_seen_at)} />
        <Field label="Email confirmed" value={u.email_verified_at ? day(u.email_verified_at) : 'No'} />
        <Field label="Two-factor" value={u.two_factor ? 'On' : 'Off'} />
        <Field label="Public profile" value={u.public_profile ? 'Published' : 'Private'} />
        <Field label="Discoverable" value={u.discoverable ? 'Yes' : 'No'} />
        <Field label="Takes bookings" value={u.available_for_bookings ? 'Yes' : 'No'} />
        <Field
          label="Referred by"
          value={
            u.referred_by_user_id ? (
              <Link href={`/virgo-users/${u.referred_by_user_id}`} className="hover:underline">
                {u.referred_by_name}
              </Link>
            ) : (
              '—'
            )
          }
        />
        <Field
          label="Their referrals"
          value={`${d.referrals ?? 0}${u.referral_code ? ` · code ${u.referral_code}` : ''}`}
        />
      </Panel>

      <Panel title="Profile" bodyClassName="py-2">
        <Field label="Roles" value={u.roles?.length ? u.roles.join(', ') : '—'} />
        <Field label="Title" value={u.title || '—'} />
        <Field label="Studio" value={u.studio_name || '—'} />
        <Field label="Location" value={u.location || '—'} />
        <Field label="Phone" value={u.phone || '—'} />
        <Field label="Website" value={u.website || '—'} />
        <Field label="Social" value={u.social_handle || '—'} />
        {/* Private in the app — never on their profile — and shown here
            because support needs it for billing and deliveries. */}
        <Field label="Address" value={address(u) ?? '—'} />
      </Panel>

      <AccessPanel customer={d} />

      <Panel title="Subscription" bodyClassName="py-2">
        {d.subscription ? (
          <>
            <Field label="Plan" value={d.subscription.plan_name} />
            <Field label="Status" value={d.subscription.status} />
            <Field
              label="Amount"
              value={`${peso(Number(d.subscription.amount_minor))} · ${
                d.subscription.kind === 'subscription' ? 'monthly' : 'one month'
              }`}
            />
            <Field label="Period ends" value={day(d.subscription.current_period_end)} />
            {d.subscription.cancelled_at && (
              <Field label="Cancelled" value={day(d.subscription.cancelled_at)} />
            )}
          </>
        ) : (
          <p className="py-1 text-xs text-muted-foreground">
            Never subscribed. Their plan was set at sign-up or by staff.
          </p>
        )}
      </Panel>
    </div>
  );
}

/** Plan and suspension — the two things that change what the account can do. */
function AccessPanel({ customer: d }: { customer: CustomerDetail }) {
  const { can } = useMe();
  const u = d.user;
  const setDisabled = useSetUserDisabled(u.id);
  const setPlan = useSetUserPlan(u.id);
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const suspended = isSuspended(u);

  // An account can carry a plan the catalogue no longer lists — `pro`, the old
  // name for Freelancer. Offered as-is, so the picker shows what it has rather
  // than going blank.
  const plans = d.plans ?? FALLBACK_PLANS;
  const planOptions = plans.some((p) => p.name === u.plan)
    ? plans
    : [...plans, { name: u.plan, label: u.plan }];

  return (
    <Panel title="Plan and access" bodyClassName="space-y-4">
      {can('users.setPlan') ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Plan</p>
          <Select value={u.plan} onValueChange={(v) => setPlan.mutate(v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {planOptions.map((p) => (
                <SelectItem key={p.name} value={p.name} className="capitalize">
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Changes limits immediately. No payment is taken and no subscription is created.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Your role cannot change plans.</p>
      )}

      {can('users.disable') && (
        <div className="border-t pt-4">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">Access</p>
          {!suspended && (
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (recorded in the audit log, not sent to them)"
              className="mb-2"
            />
          )}
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              className="size-3.5 accent-primary"
            />
            Email them that their account was {suspended ? 'restored' : 'suspended'}
          </label>
          <Button
            variant={suspended ? 'secondary' : 'destructive'}
            size="sm"
            disabled={setDisabled.isPending}
            onClick={() =>
              setDisabled.mutate({ disabled: !suspended, reason: reason || undefined, notify })
            }
          >
            {suspended ? 'Restore access' : 'Suspend account'}
          </Button>
          {/* Said here because it was not always true: the old switch only
              stamped a column nothing enforced. The 15 minutes is the life of
              an access token already issued; refresh and sign-in are refused
              at once. */}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {suspended
              ? 'Lets them sign in again. '
              : 'Signs them out everywhere within 15 minutes and stops them signing back in. '}
            Their media is untouched either way.
          </p>
        </div>
      )}
    </Panel>
  );
}
