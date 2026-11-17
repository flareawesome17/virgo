'use client';

import { Receipt } from 'lucide-react';
import { formatMoney, type PackageCardContext } from '@/api';
import {
  CardExternalAction,
  CardKindLabel,
  GoneNote,
  cardShell,
  type CardEnv,
} from '@/components/chat/cards/card-parts';

type PackageNow = NonNullable<PackageCardContext['package']>;

/** "Paid ₱3,000, left ₱7,000", or "Paid in full, ₱10,000". */
export function packageCardMoney(pkg: PackageNow): string {
  return pkg.paidInFull
    ? `Paid in full, ${formatMoney(pkg.totalMinor)}`
    : `Paid ${formatMoney(pkg.receivedMinor)}, left ${formatMoney(pkg.balanceMinor)}`;
}

/**
 * A package (board ChatCards): what has been paid and what is left, read
 * fresh with the thread, and its statement page. Sending one shared its
 * statement; once its sender stops sharing, the card says so.
 */
export function PackageCard({ context, env }: { context: PackageCardContext | null; env: CardEnv }) {
  const pkg = context?.package;
  if (!pkg) {
    return (
      <div className={cardShell(env.mine, 'flex w-72 flex-col gap-1.5 px-3.5 py-3')}>
        <CardKindLabel icon={Receipt}>Package</CardKindLabel>
        <GoneNote>This package isn&apos;t shared any more.</GoneNote>
      </div>
    );
  }

  const share = pkg.totalMinor > 0 ? Math.min(1, Math.max(0, pkg.receivedMinor / pkg.totalMinor)) : pkg.paidInFull ? 1 : 0;

  return (
    <div className={cardShell(env.mine, 'flex w-72 flex-col gap-1.5 px-3.5 pb-3.5 pt-3')}>
      <CardKindLabel icon={Receipt}>Package</CardKindLabel>
      <p className="text-[15px] font-bold leading-snug">{pkg.title}</p>
      <span
        role="progressbar"
        aria-label="Paid so far"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
        className="block h-2 overflow-hidden rounded-full bg-muted"
      >
        <span className="block h-full rounded-full bg-success" style={{ width: `${share * 100}%` }} />
      </span>
      {pkg.paidInFull ? (
        <p className="flex justify-between text-sm">
          <span className="font-bold text-success">Paid in full</span>
          <span className="font-bold">{formatMoney(pkg.totalMinor)}</span>
        </p>
      ) : (
        <p className="flex justify-between gap-3 text-sm">
          <span>
            <span className="text-muted-foreground">Paid </span>
            <span className="font-bold">{formatMoney(pkg.receivedMinor)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Left </span>
            <span className="font-bold">{formatMoney(pkg.balanceMinor)}</span>
          </span>
        </p>
      )}
      {pkg.statementUrl ? (
        <CardExternalAction href={pkg.statementUrl}>Open statement</CardExternalAction>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">No longer shared</p>
      )}
    </div>
  );
}
