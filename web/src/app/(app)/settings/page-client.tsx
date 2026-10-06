'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { useTheme } from 'next-themes';
import {
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Loader2,
  MapPin,
  Monitor,
  Moon,
  Search,
  ChevronRight,
  Sun,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PageHeader, Screen } from '@/components/app-shell';
import { SettingRow } from '@/components/settings/setting-row';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { playAlert, setSoundEnabled, soundEnabled, subscribeToSoundEnabled } from '@/lib/sounds';
import { useAuth } from '@/hooks/useAuth';
import { useLocationSharing, useShareLocation, useStopSharingLocation } from '@/hooks/useNearby';
import {
  notificationPermission,
  requestNotificationPermission,
  subscribeToNotificationPermission,
} from '@/lib/alerts';
import { useHydrated } from '@/lib/hydration';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

/*
 * What the server render and the hydrating render show for the two settings
 * only the browser knows. Neither Notification nor localStorage exists on the
 * server, so the real values arrive in the render straight after hydration.
 */
const permissionOnServer = () => 'default' as const;
const soundOnServer = () => true;


export default function SettingsPage() {
  const { profile, updateProfile } = useAuth();
  const { theme, setTheme } = useTheme();

  const {
    sharing,
    data: locationStatus,
    isLoading: loadingLocation,
    loadFailed: locationFailed,
    refetch: refetchLocation,
  } = useLocationSharing();
  // Never read, rather than read as off. A failed check showed the switch
  // off, telling someone who may well be visible in Nearby that they were not.
  const locationUnknown = locationFailed && !locationStatus;
  const startSharing = useShareLocation();
  const stopSharing = useStopSharingLocation();

  const hydrated = useHydrated();
  const permission = useSyncExternalStore(
    subscribeToNotificationPermission,
    notificationPermission,
    permissionOnServer,
  );
  // Through useSyncExternalStore rather than useState: localStorage does not
  // exist during the server render, and reading it inline would mismatch on
  // hydration.
  const sound = useSyncExternalStore(subscribeToSoundEnabled, soundEnabled, soundOnServer);

  const discoverable = profile?.discoverable ?? true;

  const fail = (label: string) => (err: Error) =>
    toast.error(label, { description: err.message });

  return (
    <Screen title="General">
      <PageHeader title="General" description="How the app behaves in this browser" />

      <div className="w-full max-w-3xl">
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
                  const active = hydrated && theme === option.value;
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
                locationUnknown
                  ? "Couldn't check whether you're sharing your location."
                  : sharing
                    ? 'You appear in Nearby. Others see a distance, never a place.'
                    : 'Turn on to see who is nearby. Discovery works both ways.'
              }
            >
              {loadingLocation || startSharing.isPending || stopSharing.isPending ? (
                <Loader2 className="size-4 animate-spin text-primary" />
              ) : locationUnknown ? (
                <Button size="sm" variant="outline" onClick={() => void refetchLocation()}>
                  Try again
                </Button>
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
                    ? 'Alerts show on this computer while Virgo is in the background.'
                    : permission === 'denied'
                      ? 'Blocked for this site. Allow it in your browser settings.'
                      : 'Get alerts on this computer while Virgo is in the background.'
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
                    // Nothing to store: asking announces the answer, and
                    // `permission` above reads it.
                    const granted = await requestNotificationPermission();
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
                  setSoundEnabled(next);
                  // Plays the sound being switched on, because the only way to
                  // judge a notification tone is to hear it. Nothing on switching
                  // off, which would be a joke at the user's expense.
                  if (next) playAlert('global');
                }}
                aria-label="Notification sound"
              />
            </SettingRow>

            {/* Everything above is this device; this is the account — which
                kinds of notification follow you to your phone and inbox. */}
            <SettingRow
              icon={Bell}
              title="What reaches you"
              detail="Choose which kinds of notification reach your phone and your inbox."
            >
              <Button asChild size="sm" variant="outline">
                <Link href="/settings/notifications">
                  Choose
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            </SettingRow>
          </CardContent>
        </Card>

      </div>

    </Screen>
  );
}
