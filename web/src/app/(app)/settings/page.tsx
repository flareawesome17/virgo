'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  HardDrive,
  Loader2,
  MapPin,
  Monitor,
  Moon,
  PauseCircle,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AppShell, PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
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
import { Input } from '@/components/ui/input';
import { playAlert, setSoundEnabled, soundEnabled } from '@/lib/sounds';
import { useAuth } from '@/hooks/useAuth';
import { useUsage } from '@/hooks/useUsage';
import { useLocationSharing, useShareLocation, useStopSharingLocation } from '@/hooks/useNearby';
import { useWipeStorage } from '@/hooks/useStorageAdmin';
import {
  notificationPermission,
  requestNotificationPermission,
} from '@/lib/alerts';
import { formatBytes } from '@/api';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/** Typed into the box before a wipe or a delete is allowed to run. */
const CONFIRM_WORD = 'DELETE';

/** Offered pause lengths. A free-text field invites typos on a one-way door. */
const PAUSE_OPTIONS = [7, 14, 30, 90] as const;

function SettingRow({
  icon: Icon,
  title,
  detail,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 border-b px-5 py-4 last:border-0">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { profile, updateProfile, disableAccount, deleteAccount } = useAuth();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { usage, storageUsedBytes, storageLimitBytes, storageFraction } = useUsage();

  const { sharing, isLoading: loadingLocation } = useLocationSharing();
  const startSharing = useShareLocation();
  const stopSharing = useStopSharingLocation();
  const wipe = useWipeStorage();

  const [mounted, setMounted] = useState(false);
  const [permission, setPermission] = useState<string>('default');
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  /** Which closing action is being confirmed, if any. */
  const [closing, setClosing] = useState<'pause' | 'delete' | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pauseDays, setPauseDays] = useState<number>(30);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const dismissClosing = () => {
    setClosing(null);
    setPassword('');
    setShowPassword(false);
    setDeleteConfirm('');
  };

  // Read in an effect, not in useState: localStorage does not exist during
  // the server render, and reading it inline would mismatch on hydration.
  const [sound, setSound] = useState(true);

  useEffect(() => {
    setMounted(true);
    setPermission(notificationPermission());
    setSound(soundEnabled());
  }, []);

  const discoverable = profile?.discoverable ?? true;

  const fail = (label: string) => (err: Error) =>
    toast.error(label, { description: err.message });

  return (
    <AppShell title="Settings">
      <PageHeader title="Settings" description="How the app behaves in this browser" />

      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        {/* Appearance */}
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Appearance
        </h2>
        <Card className="py-0">
          <CardContent className="p-0">
            <div className="px-5 py-4">
              <p className="text-sm font-semibold">Theme</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Saved in this browser. System follows your operating system.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {THEME_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = mounted && theme === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setTheme(option.value)}
                      className={cn(
                        'flex flex-col items-center gap-2 rounded-lg border-2 px-3 py-4 transition-colors',
                        active
                          ? 'border-primary bg-primary/5'
                          : 'border-transparent bg-muted hover:bg-accent',
                      )}
                    >
                      <Icon className={cn('size-4', active && 'text-primary')} />
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          active && 'text-primary',
                        )}
                      >
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Privacy */}
        <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Privacy
        </h2>
        <Card className="py-0">
          <CardContent className="p-0">
            <SettingRow
              icon={Search}
              title="Find me by name"
              detail={
                discoverable
                  ? 'People searching your name can find you.'
                  : 'Only people who know your exact email can find you.'
              }
            >
              {updateProfile.isPending ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                <Switch
                  checked={discoverable}
                  onCheckedChange={(next) =>
                    updateProfile.mutate(
                      { discoverable: next },
                      { onError: fail('Could not save') },
                    )
                  }
                />
              )}
            </SettingRow>

            <SettingRow
              icon={MapPin}
              title="Share my location"
              detail={
                sharing
                  ? 'You appear in Nearby. Others see a distance, never a place.'
                  : 'Turn on to see who is nearby. Discovery works both ways.'
              }
            >
              {loadingLocation || startSharing.isPending || stopSharing.isPending ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : (
                <Switch
                  checked={sharing}
                  onCheckedChange={(next) =>
                    (next ? startSharing : stopSharing).mutate(undefined as never, {
                      onError: fail('Could not change sharing'),
                    })
                  }
                />
              )}
            </SettingRow>

            <SettingRow
              icon={permission === 'granted' ? Bell : BellOff}
              title="Desktop notifications"
              detail={
                permission === 'unsupported'
                  ? 'This browser does not support notifications.'
                  : permission === 'granted'
                    ? 'New messages notify you when this tab is in the background.'
                    : permission === 'denied'
                      ? 'Blocked for this site. Allow it in your browser settings.'
                      : 'Get notified about new messages while this tab is behind others.'
              }
            >
              {permission === 'granted' ? (
                <span className="text-xs font-semibold text-success">On</span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={permission === 'denied' || permission === 'unsupported'}
                  onClick={async () => {
                    const granted = await requestNotificationPermission();
                    setPermission(notificationPermission());
                    if (!granted) {
                      toast.error('Not enabled', {
                        description: 'Your browser did not grant permission.',
                      });
                    }
                  }}
                >
                  Enable
                </Button>
              )}
            </SettingRow>

            {/* Separate from the permission above, and deliberately so: the
                browser's permission governs notifications you get when the tab
                is behind others, this governs the sound you hear when you are
                looking straight at it. Somebody in an open-plan office wants
                the first and not the second. */}
            <SettingRow
              icon={sound ? Volume2 : VolumeX}
              title="Notification sound"
              detail={
                sound
                  ? 'Messages, reminders and everything else each have their own tone.'
                  : 'Notifications arrive silently.'
              }
            >
              <Switch
                checked={sound}
                onCheckedChange={(next) => {
                  setSound(next);
                  setSoundEnabled(next);
                  // Plays the sound being switched on, because the only way to
                  // judge a notification tone is to hear it. Nothing on switching
                  // off, which would be a joke at the user's expense.
                  if (next) playAlert('global');
                }}
                aria-label="Notification sound"
              />
            </SettingRow>
          </CardContent>
        </Card>

        {/* Storage */}
        <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Storage
        </h2>
        <Card>
          <CardContent className="py-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {formatBytes(storageUsedBytes)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {storageLimitBytes
                    ? `of ${formatBytes(storageLimitBytes)} on ${usage?.plan ?? 'free'}`
                    : 'used'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings/plans">
                    <CreditCard className="size-4" />
                    Plans
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/settings/storage">
                    <HardDrive className="size-4" />
                    Details
                  </Link>
                </Button>
              </div>
            </div>
            {storageLimitBytes ? (
              <Progress value={storageFraction * 100} className="mt-4 h-1.5" />
            ) : null}

            <Separator className="my-5" />

            <div className="flex items-start gap-4">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10">
                <Trash2 className="size-4 text-destructive" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Wipe cloud data</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Deletes every photo, video and audio file you have uploaded,
                  across all workspaces. This cannot be undone.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() => {
                  setConfirmText('');
                  setConfirmingWipe(true);
                }}
              >
                Wipe
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Legal */}
        <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          About
        </h2>
        <Card className="py-0">
          <CardContent className="p-0">
            <Link
              href="/legal"
              className="flex items-center gap-4 border-b px-5 py-4 transition-colors hover:bg-accent/50"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                <FileText className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Terms &amp; Privacy Policy</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  What we collect, and what we do with it
                </p>
              </div>
              <ExternalLink className="size-4 shrink-0 text-muted-foreground" />
            </Link>
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                <ShieldCheck className="size-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Virgo for web</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Signed in as {profile?.email}
                </p>
              </div>
            </div>
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
              <Button variant="outline" size="sm" onClick={() => setClosing('pause')}>
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
                  {new Date(Date.now() + pauseDays * 86400000)
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
                        router.replace('/login');
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
                      router.replace('/login');
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

      <AlertDialog open={confirmingWipe} onOpenChange={setConfirmingWipe}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wipe every uploaded file?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes {formatBytes(storageUsedBytes)} of media from storage
              permanently. Albums and workspaces survive, but they will be empty.
              We cannot recover the files for you.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-2">
            <p className="text-sm">
              Type <span className="font-mono font-bold">{CONFIRM_WORD}</span> to confirm.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== CONFIRM_WORD || wipe.isPending}
              onClick={(event) => {
                // The dialog closes on action by default; keep it open while
                // the request runs so the result can be reported.
                event.preventDefault();
                wipe.mutate(undefined, {
                  onSuccess: (result) => {
                    setConfirmingWipe(false);
                    toast.success(`Deleted ${result.deleted} file${result.deleted === 1 ? '' : 's'}`, {
                      description:
                        result.failed > 0
                          ? `${result.failed} could not be deleted and still count towards your quota.`
                          : `Freed ${formatBytes(result.freedBytes)}.`,
                    });
                  },
                  onError: fail('Could not wipe storage'),
                });
              }}
            >
              {wipe.isPending && <Loader2 className="size-4 animate-spin" />}
              Wipe everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
