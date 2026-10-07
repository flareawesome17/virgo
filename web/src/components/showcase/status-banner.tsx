'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { showcaseStatus, type Showcase } from '@/api';
import { cn } from '@/lib/utils';
import { usePrivacyToggle } from './privacy';

/**
 * What the owner is told about their own post that is not out. Nobody else
 * is ever sent one, so this is the only place its state is said out loud —
 * on the post's page, and over it when it is opened from the profile.
 */
export function StatusBanner({
  showcase,
  className,
}: {
  showcase: Pick<Showcase, 'id' | 'visibility' | 'publishedAt' | 'unpublishedAt' | 'hiddenAt'>;
  className?: string;
}) {
  const status = showcaseStatus(showcase);
  const privacy = usePrivacyToggle(showcase);
  if (status === 'live') return null;

  if (status === 'removed') {
    return (
      <div className={cn('rounded-xl bg-destructive/10 p-4', className)}>
        <p className="text-sm font-bold text-destructive">Virgo took this down</p>
        <p className="mt-1 text-sm leading-6">
          It was reported and reviewed, and only you can see it now. If you think that was a
          mistake, tell us.
        </p>
        <Link
          href="/support"
          className="mt-2 inline-block text-sm font-bold text-primary hover:underline"
        >
          Contact support
        </Link>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-3 rounded-xl bg-secondary p-4', className)}>
      <Lock className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{status === 'draft' ? 'Private, not posted yet' : 'Private'}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Only you can see it.</p>
      </div>
      <Button size="sm" onClick={privacy.request} disabled={privacy.pending}>
        {privacy.label}
      </Button>
      {privacy.confirmElement}
    </div>
  );
}
