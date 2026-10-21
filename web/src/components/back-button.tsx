'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { IS_DESKTOP } from '@/lib/desktop';
import { cn } from '@/lib/utils';

/**
 * Goes back to wherever the person came from, and to `fallback` when there is
 * nowhere to go back to (a page opened straight from a link or a new tab).
 *
 * `router.back()` on its own does nothing in that case, which is how a detail
 * page ended up with no way out.
 */
export function BackButton({
  fallback,
  label = 'Back',
  className,
}: {
  fallback: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  // The desktop title bar already has back and forward for the whole app.
  if (IS_DESKTOP) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('-ml-2 text-muted-foreground', className)}
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
    >
      <ArrowLeft className="size-4" />
      {label}
    </Button>
  );
}
