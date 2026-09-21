import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useEffect, useRef, type ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ArrowRightIcon,
  CalendarIcon,
  ChevronLeftIcon,
  MailIcon,
  MapPinIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react-native';
import {
  useAlbum,
  useBooking,
  useDeleteNotifications,
  useMarkNotificationsRead,
  useMarkNotificationsUnread,
  useNotification,
  useScheduleEvent,
  useTheme,
} from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';
import { NotificationIcon } from '@/components/NotificationIcon';
import { CATEGORY_OF_TOPIC, rateLabel, type AppNotification } from '@/src/api';
import {
  CATEGORY_LABELS,
  actionLabel,
  fullTimestamp,
} from '@/src/lib/notification-categories';
import { destination } from '@/src/lib/notification-topics';
import { PALETTES, type Palette } from '@/theme';

type Icon = typeof CalendarIcon;

function Fact({ icon: Icon, text, palette }: { icon: Icon; text: string | null; palette: Palette }) {
  if (!text) return null;
  return (
    <View className="flex-row items-center gap-2.5">
      <Icon size={16} color={palette.mutedForeground} />
      <Text className="text-secondary-foreground flex-1 text-[14px] leading-5">{text}</Text>
    </View>
  );
}

/** The card for what a notification is about. */
function ContextCard({
  title,
  status,
  palette,
  children,
}: {
  title: string;
  status?: { label: string; color: string } | null;
  palette: Palette;
  children?: ReactNode;
}) {
  return (
    <View
      className="rounded-2xl p-4"
      style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, gap: 12 }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <Text className="text-foreground flex-1 text-[15px] font-semibold leading-5">{title}</Text>
        {status && (
          <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${status.color}1F` }}>
            <Text className="text-[12px] font-semibold" style={{ color: status.color }}>
              {status.label}
            </Text>
          </View>
        )}
      </View>
      {children ? <View style={{ gap: 9 }}>{children}</View> : null}
    </View>
  );
}

function BookingContext({ bookingId, palette }: { bookingId: string; palette: Palette }) {
  const { booking } = useBooking(bookingId);
  if (!booking) return null;
  const status = booking.cancelledAt
    ? { label: 'Cancelled', color: palette.destructive }
    : booking.confirmed
      ? { label: 'Agreed', color: palette.success }
      : { label: 'Waiting on terms', color: palette.mutedForeground };
  const when = booking.eventDate
    ? new Date(`${booking.eventDate}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : null;
  const rate = rateLabel(booking.rateMinor, booking.currency);
  return (
    <ContextCard title={booking.postTitle} status={status} palette={palette}>
      <Fact icon={CalendarIcon} text={when} palette={palette} />
      <Fact icon={MapPinIcon} text={booking.location} palette={palette} />
      <Fact
        icon={UserIcon}
        text={`With ${booking.otherParty.displayName}${rate ? ` · ${rate}` : ''}`}
        palette={palette}
      />
    </ContextCard>
  );
}

function EventContext({ eventId, palette }: { eventId: string; palette: Palette }) {
  const { data: event } = useScheduleEvent(eventId);
  if (!event) return null;
  const date = new Date(`${event.event_date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <ContextCard title={event.title} palette={palette}>
      <Fact
        icon={CalendarIcon}
        text={event.event_time ? `${date} · ${event.event_time.slice(0, 5)}` : date}
        palette={palette}
      />
      <Fact icon={MapPinIcon} text={event.location} palette={palette} />
    </ContextCard>
  );
}

function AlbumContext({ albumId, palette }: { albumId: string; palette: Palette }) {
  const { data: album } = useAlbum(albumId);
  if (!album) return null;
  return <ContextCard title={album.name} palette={palette} />;
}

/** What the notification is about, when that is something the app can show. */
function Context({ n, palette }: { n: AppNotification; palette: Palette }) {
  const id = (key: string) => (typeof n.data[key] === 'string' ? (n.data[key] as string) : null);
  const bookingId = n.topic === 'booking' ? id('bookingId') : null;
  if (bookingId) return <BookingContext bookingId={bookingId} palette={palette} />;
  const eventId =
    n.topic === 'event-invite' || n.topic === 'event-updated' || n.topic === 'event-response'
      ? id('eventId')
      : null;
  if (eventId) return <EventContext eventId={eventId} palette={palette} />;
  const albumId = n.topic === 'client-picks' ? id('albumId') : null;
  if (albumId) return <AlbumContext albumId={albumId} palette={palette} />;
  return null;
}

/**
 * One notification, all of it.
 *
 * The list previews a notification in two lines; this is where it is read —
 * the whole title and body, when it came, what it is about, and the one thing
 * to do about it. Opening it marks it read, once: marking it unread again from
 * here sticks.
 */
export default function NotificationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { notification: n, isLoading, notFound, loadFailed, refetch } = useNotification(id);
  const { mutate: markRead } = useMarkNotificationsRead();
  const markUnread = useMarkNotificationsUnread();
  const remove = useDeleteNotifications();

  const autoRead = useRef<string | null>(null);
  useEffect(() => {
    if (!n || n.readAt || autoRead.current === n.id) return;
    autoRead.current = n.id;
    markRead([n.id]);
  }, [n, markRead]);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/notifications' as never));

  const follow = (notification: AppNotification) => {
    const href = destination(notification);
    if (!href) return;
    // A link outside the app goes to the system browser; everything else is a
    // route inside it.
    if (/^https:\/\//.test(href)) void Linking.openURL(href).catch(() => undefined);
    else router.push(href as never);
  };

  const category = n ? CATEGORY_OF_TOPIC[n.topic] : null;
  const href = n ? destination(n) : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <View className="flex-row items-center justify-between px-2 pt-1">
        <Pressable
          onPress={back}
          accessibilityLabel="Back to notifications"
          hitSlop={8}
          className="h-11 w-11 items-center justify-center"
        >
          <ChevronLeftIcon size={24} color={palette.secondaryForeground} />
        </Pressable>
        <Text className="text-foreground text-[16px] font-semibold">Notification</Text>
        <View className="h-11 w-11" />
      </View>

      {!n ? (
        isLoading ? (
          <ActivityIndicator color={palette.primary} className="mt-10" />
        ) : notFound ? (
          <View className="mt-16 items-center px-10">
            <Text className="text-foreground text-[15px] font-semibold">This notification is gone</Text>
            <Text className="text-muted-foreground mt-1 text-center text-[12px] leading-5">
              It was deleted, or it is older than 90 days.
            </Text>
          </View>
        ) : loadFailed ? (
          <LoadFailed what="this notification" onRetry={() => refetch()} />
        ) : null
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 12, gap: 18, flexGrow: 1 }}>
          <View className="flex-row items-center gap-2.5">
            <View
              className="flex-row items-center gap-2 rounded-full py-1 pl-1 pr-3"
              style={{ backgroundColor: palette.muted }}
            >
              <NotificationIcon topic={n.topic} palette={palette} size={24} />
              <Text className="text-foreground text-[12px] font-semibold">
                {category ? CATEGORY_LABELS[category] : ''}
              </Text>
            </View>
            <Text className="text-muted-foreground flex-1 text-[13px]">{fullTimestamp(n.createdAt)}</Text>
          </View>

          <View style={{ gap: 10 }}>
            <Text
              className="text-foreground text-[26px] font-bold leading-8"
              style={{ letterSpacing: -0.4 }}
              accessibilityRole="header"
            >
              {n.title}
            </Text>
            <Text className="text-foreground/85 text-[16px] leading-6">{n.body}</Text>
          </View>

          <Context n={n} palette={palette} />

          <View style={{ gap: 10 }}>
            {href && (
              <Pressable
                onPress={() => follow(n)}
                className="h-[52px] flex-row items-center justify-center gap-2 rounded-2xl bg-action active:opacity-85"
              >
                <Text className="text-action-foreground text-[16px] font-semibold">{actionLabel(n)}</Text>
                <ArrowRightIcon size={18} color={palette.actionForeground} />
              </Pressable>
            )}
            <View className="flex-row gap-2.5">
              {n.readAt && (
                <Pressable
                  onPress={() => markUnread.mutate([n.id])}
                  disabled={markUnread.isPending}
                  className="h-[46px] flex-1 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-70"
                  style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}
                >
                  <MailIcon size={17} color={palette.foreground} />
                  <Text className="text-foreground text-[14px] font-semibold">Mark as unread</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => {
                  remove.mutate([n.id]);
                  back();
                }}
                className="h-[46px] flex-1 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-70"
                style={{ backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}
              >
                <Trash2Icon size={17} color={palette.destructive} />
                <Text className="text-[14px] font-semibold" style={{ color: palette.destructive }}>
                  Delete
                </Text>
              </Pressable>
            </View>
          </View>

          <View className="flex-1" />

          {category === 'support' ? (
            <Text className="text-muted-foreground text-center text-[13px] leading-5">
              Replies from support always reach you.
            </Text>
          ) : (
            <Text className="text-muted-foreground text-center text-[13px] leading-5">
              This is one of your {category ? CATEGORY_LABELS[category].toLowerCase() : ''} notifications.{' '}
              <Text
                onPress={() => router.push('/settings/notifications' as never)}
                accessibilityRole="link"
                className="font-semibold"
                style={{ color: palette.primary }}
              >
                Notification settings
              </Text>
            </Text>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
