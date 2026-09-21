'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Link2, Loader2, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  useAlbumShare,
  useCreateShareLink,
  useRevokeShareLink,
} from '@/hooks/useAlbumShare';
import { ALL_SHARE_KINDS, type ShareMediaKind } from '@/api';

const KIND_LABELS: Record<ShareMediaKind, string> = {
  image: 'Photos',
  video: 'Videos',
  audio: 'Audio',
};

/**
 * The client link for an album.
 *
 * Which media the link exposes is a set of checkboxes, not preset bundles: a
 * photographer routinely wants the photos out and the raw audio held back, and
 * a fixed "photos + video" option cannot express that.
 */
export function ShareDialog({
  albumId,
  albumName,
  open,
  onOpenChange,
}: {
  albumId: string;
  albumName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { link, isLoading } = useAlbumShare(open ? albumId : undefined);
  const create = useCreateShareLink(albumId);
  const revoke = useRevokeShareLink(albumId);

  const [kinds, setKinds] = useState<ShareMediaKind[]>(ALL_SHARE_KINDS);
  const [copied, setCopied] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  // Seed the boxes from the live link so re-opening shows what is actually
  // shared, not the defaults. Again whenever the link itself changes — it
  // loads, or an update comes back — and during render rather than in an
  // effect, so the boxes never paint the defaults first.
  const [seededFrom, setSeededFrom] = useState<typeof link>(null);
  if (link !== seededFrom) {
    setSeededFrom(link);
    if (link) setKinds(link.kinds);
  }

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy', { description: 'Select the link and copy it manually.' });
    }
  };

  const toggle = (kind: ShareMediaKind, checked: boolean) => {
    setKinds((prev) => {
      const next = checked ? [...prev, kind] : prev.filter((k) => k !== kind);
      // An empty link would serve nothing and read as broken to the client.
      return next.length === 0 ? prev : next;
    });
  };

  const changed =
    !!link &&
    (link.kinds.length !== kinds.length || link.kinds.some((k) => !kinds.includes(k)));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Client link</DialogTitle>
            <DialogDescription>
              A read-only gallery of {albumName}. It opens in any browser with no
              account needed.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label>What the link shows</Label>
              <div className="flex flex-col gap-1">
                {ALL_SHARE_KINDS.map((kind) => (
                  <label
                    key={kind}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-2 hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={kinds.includes(kind)}
                      onCheckedChange={(checked) => toggle(kind, checked === true)}
                    />
                    <span className="text-sm">{KIND_LABELS[kind]}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Anything unticked is not served at all, not merely hidden.
              </p>
            </div>

            {isLoading ? (
              <div className="py-4 text-center">
                <Loader2 className="mx-auto size-5 animate-spin text-primary" />
              </div>
            ) : link ? (
              <div className="grid gap-2">
                <Label htmlFor="share-url">Link</Label>
                <div className="flex gap-2">
                  <Input
                    id="share-url"
                    readOnly
                    value={link.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="font-mono text-xs"
                  />
                  <Button size="icon" variant="outline" onClick={copy} aria-label="Copy link">
                    {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                  </Button>
                  <Button asChild size="icon" variant="outline" aria-label="Open link">
                    <a href={link.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-4" />
                    </a>
                  </Button>
                </div>

                <p className="mt-1 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
                  <ShieldAlert className="mt-0.5 size-3.5 shrink-0" />
                  Unguessable, but public to anyone holding it. Treat it like a
                  key, and revoke it once the shoot is signed off.
                </p>
              </div>
            ) : null}
          </div>

          <DialogFooter className="sm:justify-between">
            {link ? (
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setConfirmingRevoke(true)}
              >
                Revoke link
              </Button>
            ) : (
              <span />
            )}

            <Button
              onClick={() =>
                create.mutate(kinds, {
                  onError: (err: Error) =>
                    toast.error('Could not generate the link', { description: err.message }),
                })
              }
              disabled={create.isPending || (!!link && !changed)}
            >
              {create.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4" />
              )}
              {link ? (changed ? 'Update link' : 'Link is up to date') : 'Generate link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmingRevoke} onOpenChange={setConfirmingRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
            <AlertDialogDescription>
              Anyone opening it will see a page saying the link is no longer
              available. This takes effect immediately and cannot be undone —
              generating a new link produces a different URL.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                revoke.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmingRevoke(false);
                    toast.success('Link revoked');
                  },
                  onError: (err: Error) =>
                    toast.error('Could not revoke', { description: err.message }),
                })
              }
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
