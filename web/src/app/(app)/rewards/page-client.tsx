'use client';

import { useState } from 'react';
import {
  Check,
  Copy,
  Gift,
  Loader2,
  PartyPopper,
  Share2,
  TicketCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  expiryLabel,
  rewardLabel,
  storageLabel,
  type ClaimedPromo,
  type OfferedPromo,
} from '@/api';
import { AppShell, PageHeader } from '@/components/app-shell';
import { CenteredSpinner } from '@/components/states';
import {
  useClaimPromo,
  usePromoOffers,
  useRedeemReferral,
  useReferralCode,
} from '@/hooks/usePromos';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function OfferCard({
  offer,
  onClaimed,
}: {
  offer: OfferedPromo;
  onClaimed: (result: ClaimedPromo) => void;
}) {
  const claim = useClaimPromo();
  const expiry = expiryLabel(offer.expiresAt);

  const take = async () => {
    try {
      onClaimed(await claim.mutateAsync(offer.grantId));
    } catch (err) {
      toast.error('Could not claim that', {
        description:
          err instanceof Error
            ? err.message
            : 'It may have expired. Reload and try again.',
      });
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10">
          <Gift className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold tracking-tight">{offer.name}</h2>
            {offer.kind === 'referral' && (
              <Badge variant="secondary">Referral</Badge>
            )}
          </div>

          <p className="mt-1 text-sm font-medium text-primary">
            {rewardLabel(offer)}
          </p>

          {offer.description && (
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {offer.description}
            </p>
          )}

          {offer.referredName && (
            <p className="mt-2 text-sm text-muted-foreground">
              You earned this when {offer.referredName} joined with your code.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => void take()} disabled={claim.isPending}>
              {claim.isPending && <Loader2 className="size-4 animate-spin" />}
              Claim
            </Button>
            {expiry && (
              <span className="text-xs text-muted-foreground">{expiry}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The moment after claiming.
 *
 * A toast was not enough. A promo *adds* to what the plan already gives, and
 * the one thing somebody wants confirmed is the new total — "15 GB" on its own
 * leaves them wondering whether it replaced their allowance. So the new
 * ceilings are stated outright, next to what was just won.
 */
function ClaimedDialog({
  result,
  onClose,
}: {
  result: ClaimedPromo | null;
  onClose: () => void;
}) {
  const totals = [
    result?.limits.storageBytes != null && {
      label: 'Storage',
      value: storageLabel(result.limits.storageBytes),
    },
    result?.limits.workspaces != null && {
      label: 'Workspaces',
      value: `${result.limits.workspaces}`,
    },
    result?.limits.albumsPerWorkspace != null && {
      label: 'Albums each',
      value: `${result.limits.albumsPerWorkspace}`,
    },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Dialog open={!!result} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader className="items-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10">
            <PartyPopper className="size-8 text-primary" />
          </div>
          <DialogTitle className="mt-4 text-xl">You got it!</DialogTitle>
          <DialogDescription className="text-balance">
            {result?.reward} has been added to your account.
          </DialogDescription>
        </DialogHeader>

        {totals.length > 0 && (
          <div className="mt-2 rounded-xl border bg-muted/40 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Your account now has
            </p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {totals.map((t) => (
                <div key={t.label}>
                  <p className="text-lg font-bold tabular-nums">{t.value}</p>
                  <p className="text-[11px] text-muted-foreground">{t.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button className="mt-2 w-full" onClick={onClose}>
          Nice
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The code to share, and what sharing it is worth.
 *
 * Deliberately vague about the reward: what a referral pays is whatever promo
 * is active at the time, and it can be switched off entirely. Promising a
 * specific number here would be a promise the console can revoke.
 */
function ReferralCard() {
  const { code, isLoading } = useReferralCode();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Code copied');
    } catch {
      toast.error('Could not copy', { description: 'Select it and copy by hand.' });
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted">
          <Share2 className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold tracking-tight">Invite other creatives</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Share your code. When someone joins with it and confirms their email
            address, <span className="font-medium text-foreground">you both</span>{' '}
            get whatever reward we are running.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <code className="rounded-lg border bg-muted px-4 py-2 font-mono text-lg font-semibold tracking-[0.2em]">
              {isLoading ? '······' : (code ?? '—')}
            </code>
            <Button variant="outline" onClick={() => void copy()} disabled={!code}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Using somebody else's code.
 *
 * The signup form has a field for this too, but most people are handed a code
 * by a friend after they have already joined — and a field only reachable by
 * starting over is a field nobody uses.
 *
 * Hides itself once used: it is once per account, and a control that can only
 * fail is not worth the space.
 */
function RedeemCard() {
  const [code, setCode] = useState('');
  const [done, setDone] = useState(false);
  const redeem = useRedeemReferral();

  const submit = async () => {
    try {
      const result = await redeem.mutateAsync(code.trim());
      setDone(true);
      toast.success('Invite code accepted', {
        description: result.rewarded
          ? 'Your reward is waiting above — claim it whenever you like.'
          : 'No reward is running right now, but your invite is recorded.',
      });
    } catch (err) {
      toast.error('Could not use that code', {
        description:
          err instanceof Error ? err.message : 'Check the code and try again.',
      });
    }
  };

  if (done) return null;

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted">
          <TicketCheck className="size-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold tracking-tight">Have an invite code?</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Enter the code somebody shared with you and you both get the reward.
            One code per account.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && code.trim().length >= 4) void submit();
              }}
              placeholder="ABC1234"
              maxLength={32}
              className="w-40 font-mono tracking-widest"
            />
            <Button
              variant="outline"
              onClick={() => void submit()}
              disabled={code.trim().length < 4 || redeem.isPending}
            >
              {redeem.isPending && <Loader2 className="size-4 animate-spin" />}
              Use code
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Rewards waiting to be claimed, and the code that earns more of them.
 *
 * Claiming is explicit rather than automatic on purpose: somebody who was
 * given storage should know they have it, and a limit that silently changed
 * is indistinguishable from a bug.
 */
export default function RewardsPage() {
  const { offers, isLoading, loadFailed, refetch } = usePromoOffers();
  const [claimed, setClaimed] = useState<ClaimedPromo | null>(null);

  return (
    <AppShell title="Rewards">
      <PageHeader
        title="Rewards"
        description="What is waiting for you, and how to earn more"
      />

      <div className="mx-auto w-full max-w-4xl space-y-4 px-6 py-6">
        {isLoading ? (
          <CenteredSpinner />
        ) : loadFailed ? (
          <div className="rounded-lg border border-dashed py-12 text-center">
            <p className="text-sm font-medium">Could not load your rewards</p>
            <p className="mt-1 text-xs text-muted-foreground">
              This is a connection problem, not an empty list.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </div>
        ) : (
          <>
            {offers.length === 0 ? (
              <div className="rounded-lg border border-dashed py-14 text-center">
                <Gift className="mx-auto size-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Nothing waiting right now</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
                  Rewards show up here when we send one your way, or when someone
                  joins with your code below.
                </p>
              </div>
            ) : (
              offers.map((offer) => (
                <OfferCard
                  key={offer.grantId}
                  offer={offer}
                  onClaimed={setClaimed}
                />
              ))
            )}

            <RedeemCard />
            <ReferralCard />
          </>
        )}
      </div>

      <ClaimedDialog result={claimed} onClose={() => setClaimed(null)} />
    </AppShell>
  );
}
