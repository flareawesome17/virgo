'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  MonitorSmartphone,
  PauseCircle,
  ShieldCheck,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { SettingRow } from '@/components/settings/setting-row';
import { ChangeEmailDialog, ChangePasswordDialog } from '@/components/settings/sign-in-dialogs';
import { useAuth } from '@/hooks/useAuth';

/** Typed into the box before a delete is allowed to run. */
const CONFIRM_WORD = 'DELETE';

/** Offered pause lengths. A free-text field invites typos on a one-way door. */
const PAUSE_OPTIONS = [7, 14, 30, 90] as const;

/**
 * Account & security: how you sign in, and how to stop.
 *
 * Out of the one long Settings page, as the phone keeps it under Profile &
 * account. The password and the email address are changed here too: the web
 * could do neither, and the email confirmation sent you to the phone.
 */
export default function AccountSettingsPage({
  change,
}: {
  /** The form to open on arrival, from an old phone address. */
  change: 'password' | 'email' | null;
}) {
  const { profile, disableAccount, deleteAccount } = useAuth();
  const router = useRouter();

  const [changing, setChanging] = useState(change);
  const stopChanging = (open: boolean) => {
    if (open) return;
    setChanging(null);
    // Off the address too, so a reload does not open it again.
    if (change) router.replace('/settings/account', { scroll: false });
  };

  /** Which closing action is being confirmed, if any. */
  const [closing, setClosing] = useState<'pause' | 'delete' | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pauseDays, setPauseDays] = useState<number>(30);
  /**
   * When the pause dialog opened, which "comes back on" counts from. Taken in
   * the click: Date.now() during render would give a different answer on
   * every render.
   */
  const [pauseFrom, setPauseFrom] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const dismissClosing = () => {
    setClosing(null);
    setPassword('');
    setShowPassword(false);
    setDeleteConfirm('');
  };

  const fail = (label: string) => (err: Error) =>
    toast.error(label, { description: err.message });

  return (
    <Screen title="Account & security">
      <PageHeader
        title="Account & security"
        description={profile?.email ? `Signed in as ${profile.email}` : undefined}
      />

      <div className="w-full max-w-3xl">
        {/* Security */}
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Security
        </h2>
        <Card className="py-0">
          <CardContent className="p-0">
            <SettingRow
              icon={Mail}
              title="Email"
              detail={profile?.email ?? 'The address you sign in with'}
            >
              <Button variant="outline" size="sm" onClick={() => setChanging('email')}>
                Change
              </Button>
            </SettingRow>
            <SettingRow
              icon={KeyRound}
              title="Password"
              detail="Changing it signs out every other phone and browser."
            >
              <Button variant="outline" size="sm" onClick={() => setChanging('password')}>
                Change
              </Button>
            </SettingRow>
            <Link
              href="/settings/two-factor"
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/50"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                <ShieldCheck className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Two-factor authentication</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {profile?.twoFactorEnabled
                    ? 'On — a code is emailed to you when signing in'
                    : 'A code sent to your email when signing in'}
                </p>
              </div>
              {profile?.twoFactorEnabled && (
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
                  On
                </span>
              )}
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
            <Link
              href="/settings/devices"
              className="flex items-center gap-4 border-t px-5 py-4 transition-colors hover:bg-accent/50"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                <MonitorSmartphone className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Devices</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Where you are signed in, and signing one out
                </p>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </CardContent>
        </Card>


        {/* Closing the account.
            Last, and visually apart: these are the two actions that cannot be
            undone by signing in again, and nothing above should be one
            mis-click from either. */}
        <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Close your account
        </h2>
        <Card className="border-destructive/25 py-0">
          <CardContent className="p-0">
            <SettingRow
              icon={PauseCircle}
              title="Pause my account"
              detail="Sign out everywhere for a set number of days. Nothing is deleted, and it comes back on its own."
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPauseFrom(Date.now());
                  setClosing('pause');
                }}
              >
                Pause
              </Button>
            </SettingRow>

            <SettingRow
              icon={UserX}
              title="Delete my account"
              detail="Erase the account, every workspace, album, message and uploaded file. This cannot be undone."
            >
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setClosing('delete')}
              >
                Delete
              </Button>
            </SettingRow>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={closing !== null}
        onOpenChange={(open) => !open && dismissClosing()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {closing === 'pause' ? 'Pause your account' : 'Delete your account'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {closing === 'pause'
                ? 'You will be signed out on every device. Nobody can message you or invite you until it lifts. Nothing is deleted.'
                : 'Your workspaces, albums, messages and every uploaded file are erased. Share links stop working. We cannot recover any of it.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-4">
            {closing === 'pause' && (
              <div className="grid gap-2">
                <p className="text-sm font-medium">For how long</p>
                <div className="flex gap-2">
                  {PAUSE_OPTIONS.map((days) => (
                    <Button
                      key={days}
                      type="button"
                      variant={pauseDays === days ? 'default' : 'outline'}
                      size="sm"
                      className="flex-1"
                      onClick={() => setPauseDays(days)}
                    >
                      {days} days
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Comes back on{' '}
                  {new Date(pauseFrom + pauseDays * 86400000)
                    .toISOString()
                    .slice(0, 10)}
                  .
                </p>
              </div>
            )}

            <div className="grid gap-2">
              <p className="text-sm font-medium">Your password</p>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Confirm it is you"
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>

            {closing === 'delete' && (
              <div className="grid gap-2">
                <p className="text-sm">
                  Type <span className="font-mono font-bold">{CONFIRM_WORD}</span> to
                  confirm.
                </p>
                <Input
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={CONFIRM_WORD}
                  autoComplete="off"
                />
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {closing === 'pause' ? (
              <AlertDialogAction
                disabled={!password || disableAccount.isPending}
                onClick={(event) => {
                  // Keep the dialog open while the request runs, so a failure
                  // can be reported instead of vanishing.
                  event.preventDefault();
                  disableAccount.mutate(
                    { password, days: pauseDays },
                    {
                      onSuccess: ({ disabledUntil }) => {
                        dismissClosing();
                        toast.success('Account paused', {
                          description: `You can sign in again on ${disabledUntil.slice(0, 10)}.`,
                        });
                        router.replace('/sign-in');
                      },
                      onError: fail('Could not pause your account'),
                    },
                  );
                }}
              >
                {disableAccount.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Pause {pauseDays} days
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                disabled={
                  !password ||
                  deleteConfirm !== CONFIRM_WORD ||
                  deleteAccount.isPending
                }
                onClick={(event) => {
                  event.preventDefault();
                  deleteAccount.mutate(password, {
                    onSuccess: ({ filesDeleted }) => {
                      dismissClosing();
                      toast.success('Account deleted', {
                        description: `Your account and ${filesDeleted} file${filesDeleted === 1 ? '' : 's'} are gone.`,
                      });
                      router.replace('/sign-in');
                    },
                    onError: fail('Could not delete your account'),
                  });
                }}
              >
                {deleteAccount.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                Delete forever
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChangePasswordDialog open={changing === 'password'} onOpenChange={stopChanging} />
      <ChangeEmailDialog open={changing === 'email'} onOpenChange={stopChanging} />
    </Screen>
  );
}
