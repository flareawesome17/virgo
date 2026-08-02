'use client';

import { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RolePicker } from '@/components/role-picker';
import { useAuth } from '@/hooks/useAuth';

/**
 * Asks accounts created before roles existed to pick theirs.
 *
 * Roles are required at sign-up, but everyone who joined before that has an
 * empty array — and an empty array means invisible in Nearby, which is where
 * work comes from. Leaving it to a settings screen would mean it never got
 * filled in.
 *
 * Deliberately not dismissible with an X or a click outside: the whole reason
 * this exists is that the alternative is people never doing it. There is still
 * a "later" button — a modal with no way out is worse than an empty profile —
 * but it has to be chosen, and the prompt comes back next session.
 *
 * Mounted once, app-wide, inside the authenticated layout.
 */
export function RolesRequiredDialog() {
  const { profile, isAuthenticated, updateProfile } = useAuth();
  const [picked, setPicked] = useState<string[]>([]);
  const [postponed, setPostponed] = useState(false);

  const needsRoles =
    isAuthenticated && !!profile && (profile.roles ?? []).length === 0;

  if (!needsRoles || postponed) return null;

  const save = () => {
    updateProfile.mutate(
      { roles: picked },
      {
        onSuccess: () =>
          toast.success('Saved', {
            description: 'People looking for what you do can find you now.',
          }),
        onError: (err: Error) =>
          toast.error('Could not save', { description: err.message }),
      },
    );
  };

  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        // Neither of these should dismiss it — see above.
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-1 grid size-10 place-items-center rounded-xl bg-primary/15">
            <Sparkles className="size-5 text-primary" />
          </div>
          <DialogTitle>What do you do on a shoot?</DialogTitle>
          <DialogDescription>
            Your account was created before we asked this. It is how people find
            each other in Nearby — somebody looking to hire a photographer or an
            SDE editor searches by role, so without one you do not appear at all.
            Pick everything that applies.
          </DialogDescription>
        </DialogHeader>

        <RolePicker selected={picked} onChange={setPicked} className="py-1" />

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => setPostponed(true)}>
            Not now
          </Button>
          <Button
            onClick={save}
            disabled={picked.length === 0 || updateProfile.isPending}
          >
            {updateProfile.isPending && <Loader2 className="size-4 animate-spin" />}
            Save {picked.length > 0 ? `(${picked.length})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
