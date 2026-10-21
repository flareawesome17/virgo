'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PartShareLink } from '@/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAlbumShareParts, useRevokePartLink } from '@/hooks/useAlbumShare';

const files = (n: number) => `${n.toLocaleString()} file${n === 1 ? '' : 's'}`;

/** "Ceremony · 42 files", or "3 selected files". */
export function partLinkLabel(link: PartShareLink): string {
  return link.scope === 'section'
    ? `${link.sectionName ?? 'A section'} · ${files(link.fileCount)}`
    : `${files(link.fileCount)} selected`;
}

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied((current) => (current === url ? null : current)), 2000);
    } catch {
      toast.error('Could not copy', { description: 'Select the link and copy it manually.' });
    }
  };
  return { copied, copy };
}

/**
 * A link just made to part of the album — a selection or one section — with
 * its URL to copy. Opened from where the part was chosen; the album's Client
 * link dialog lists it afterwards, which is where it is turned off.
 */
export function PartLinkDialog({
  link,
  albumName,
  onOpenChange,
}: {
  link: PartShareLink | null;
  albumName: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { copied, copy } = useCopy();
  return (
    <Dialog open={!!link} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {link?.scope === 'section' ? `Link to ${link.sectionName ?? 'this section'}` : 'Link to these files'}
          </DialogTitle>
          <DialogDescription>
            {link?.scope === 'section'
              ? `A read-only gallery of the ${link.sectionName ?? ''} section of ${albumName}`
              : `A read-only gallery of the ${files(link?.fileCount ?? 0)} you selected from ${albumName}`}
            , and nothing else in the album. It opens in any browser with no account needed.
          </DialogDescription>
        </DialogHeader>
        {link && (
          <div className="flex gap-2">
            <Input
              readOnly
              value={link.url}
              aria-label="Link"
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button size="icon" variant="outline" onClick={() => void copy(link.url)} aria-label="Copy link">
              {copied === link.url ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            </Button>
            <Button asChild size="icon" variant="outline" aria-label="Open link">
              <a href={link.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </div>
        )}
        <DialogFooter>
          <p className="mr-auto self-center text-xs text-muted-foreground">
            Turn it off any time from Client link.
          </p>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The album's links to a section or a selection, inside the Client link
 * dialog: each one can be copied again or turned off on its own, since each
 * may have gone to someone different.
 */
export function PartLinksList({ albumId }: { albumId: string }) {
  const { data: parts, isLoading } = useAlbumShareParts(albumId);
  const revoke = useRevokePartLink(albumId);
  const { copied, copy } = useCopy();
  const [confirming, setConfirming] = useState<PartShareLink | null>(null);

  if (isLoading) {
    return (
      <div className="py-2 text-center">
        <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!parts?.length) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        To send only part of the album, select files and choose Link, or open a section’s menu and choose Client link.
      </p>
    );
  }
  return (
    <>
      <ul className="grid gap-1.5">
        {parts.map((part) => (
          <li key={part.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm">{partLinkLabel(part)}</span>
            <Button size="icon" variant="ghost" className="size-8" onClick={() => void copy(part.url)} aria-label={`Copy link to ${partLinkLabel(part)}`}>
              {copied === part.url ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            </Button>
            <Button asChild size="icon" variant="ghost" className="size-8" aria-label={`Open link to ${partLinkLabel(part)}`}>
              <a href={part.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
              </a>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={revoke.isPending && revoke.variables === part.id}
              onClick={() => setConfirming(part)}
            >
              Turn off
            </Button>
          </li>
        ))}
      </ul>

      <AlertDialog open={!!confirming} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Turn off this link?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone opening the link to {confirming ? partLinkLabel(confirming) : 'this part'} will see a page
              saying it is no longer available. The album’s other links keep working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirming &&
                revoke.mutate(confirming.id, {
                  onSuccess: () => {
                    setConfirming(null);
                    toast.success('Link turned off');
                  },
                  onError: (err: Error) => toast.error('Could not turn it off', { description: err.message }),
                })
              }
            >
              Turn off
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
