import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronRightIcon, FilmIcon, type LucideIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  formatMoney,
  planDayLabel,
  showcaseStatus,
  type Booking,
  type JobPost,
  type MoneyPackage,
  type SendCardInput,
  type Showcase,
} from '@/src/api';
import { useBookings, useMoneyPackages, useMyJobs, useMyShowcases, useTheme } from '@/src/hooks';
import { BottomSheet } from '@/components/BottomSheet';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { PALETTES } from '@/theme';
import { CARD_ICON } from './cards/card-icons';
import { useCardSender } from './cards/useCardSender';
import { useChatToast } from './ChatToast';

for (const Icon of [ChevronRightIcon, FilmIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

export type ShareListKind = 'booking' | 'job-post' | 'post' | 'package';

const TITLES: Record<ShareListKind, { title: string; note?: string }> = {
  booking: { title: 'Share a booking' },
  'job-post': { title: 'Share a job post' },
  post: { title: 'Share a post' },
  package: { title: 'Share a package', note: 'Sending a package shares its statement.' },
};

/**
 * A list of your own things to share as a card: bookings, job posts,
 * published posts, packages. A tap on one sends it; the sheet closes once
 * the card is in the thread. A failure says so here, in a word over the foot
 * of the sheet, and the same tap tries again.
 */
export function ShareListSheet({
  conversationId,
  kind,
  onClose,
  onSent,
}: {
  conversationId: string;
  /** Which list; null when closed. */
  kind: ShareListKind | null;
  onClose: () => void;
  /** The card is in the thread. */
  onSent: () => void;
}) {
  const sender = useCardSender(conversationId);
  const toast = useChatToast(12);
  const showToast = toast.show;
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  const send = useCallback(
    (key: string, input: SendCardInput) => {
      if (sender.isPending) return;
      setSendingKey(key);
      sender.send(input, {
        onSuccess: () => {
          setSendingKey(null);
          onSent();
        },
        onError: (words) => {
          setSendingKey(null);
          showToast(words);
        },
      });
    },
    [sender, onSent, showToast],
  );

  const close = () => {
    // A card on its way stays on screen with its spinner until it lands.
    if (sender.isPending) return;
    onClose();
  };

  const heading = kind ? TITLES[kind] : null;

  return (
    <BottomSheet visible={kind !== null} onClose={close}>
      {kind && heading ? (
        <View style={{ flexShrink: 1 }}>
          <Text className="text-foreground text-[18px] leading-[26px] font-bold px-5" accessibilityRole="header">
            {heading.title}
          </Text>
          {heading.note ? (
            <Text className="text-muted-foreground text-[13px] leading-[18px] px-5 pt-0.5">{heading.note}</Text>
          ) : null}
          <View className="pt-3" style={{ flexShrink: 1 }}>
            {kind === 'booking' ? (
              <BookingList sendingKey={sendingKey} busy={sender.isPending} onSend={send} />
            ) : kind === 'job-post' ? (
              <JobList sendingKey={sendingKey} busy={sender.isPending} onSend={send} />
            ) : kind === 'post' ? (
              <PostList sendingKey={sendingKey} busy={sender.isPending} onSend={send} />
            ) : (
              <PackageList sendingKey={sendingKey} busy={sender.isPending} onSend={send} />
            )}
          </View>
          {toast.element}
        </View>
      ) : null}
    </BottomSheet>
  );
}

interface ListProps {
  sendingKey: string | null;
  busy: boolean;
  onSend: (key: string, input: SendCardInput) => void;
}

/** Loading, failed, empty, or the rows. */
function ListBody({
  isLoading,
  loadFailed,
  what,
  onRetry,
  empty,
  emptyIcon: Icon,
  emptyBody,
  children,
  count,
}: {
  isLoading: boolean;
  loadFailed: boolean;
  /** For "Could not load …". */
  what: string;
  onRetry: () => void;
  empty: string;
  emptyIcon: LucideIcon;
  emptyBody?: string;
  count: number;
  children: ReactNode;
}) {
  const { isDark } = useTheme();
  if (count === 0 && isLoading) {
    return (
      <View className="items-center py-10">
        <ActivityIndicator size="small" color={(isDark ? PALETTES.dark : PALETTES.light).primary} />
      </View>
    );
  }
  if (count === 0 && loadFailed) return <LoadFailed compact what={what} onRetry={onRetry} />;
  if (count === 0) {
    return (
      <View className="items-center px-10 py-8">
        <View className="w-12 h-12 rounded-full bg-primary/10 items-center justify-center">
          <Icon size={22} className="text-primary" />
        </View>
        <Text className="text-foreground text-[15px] font-bold text-center mt-3">{empty}</Text>
        {emptyBody ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px] text-center mt-1">{emptyBody}</Text>
        ) : null}
      </View>
    );
  }
  return (
    <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
      {children}
    </ScrollView>
  );
}

function Row({
  title,
  detail,
  lead,
  sending,
  disabled,
  onPress,
  label,
}: {
  title: string;
  detail: string | null;
  lead?: ReactNode;
  sending: boolean;
  disabled: boolean;
  onPress: () => void;
  label: string;
}) {
  const { isDark } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Sends it in this chat"
      accessibilityState={{ busy: sending, disabled }}
      className="min-h-[60px] px-5 py-2.5 flex-row items-center gap-3 active:bg-muted/60"
      style={{ opacity: disabled && !sending ? 0.5 : 1 }}
    >
      {lead}
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={2}>
          {title}
        </Text>
        {detail ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {sending ? (
        <ActivityIndicator size="small" color={(isDark ? PALETTES.dark : PALETTES.light).primary} />
      ) : (
        <ChevronRightIcon size={16} className="text-muted-foreground/60" />
      )}
    </Pressable>
  );
}

function KindTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <View className="w-10 h-10 rounded-xl bg-muted items-center justify-center">
      <Icon size={18} className="text-foreground" />
    </View>
  );
}

// ─── Bookings ────────────────────────────────────────────────────────────────

function bookingDetail(b: Booking): string {
  return [
    b.cancelledAt ? 'Cancelled' : b.confirmed ? 'Agreed' : 'Not agreed yet',
    planDayLabel(b.eventDate),
    `with ${b.otherParty.displayName}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function BookingList({ sendingKey, busy, onSend }: ListProps) {
  const { bookings, isLoading, loadFailed, refetch } = useBookings();
  return (
    <ListBody
      isLoading={isLoading}
      loadFailed={loadFailed}
      what="your bookings"
      onRetry={() => void refetch()}
      empty="You have no bookings yet"
      emptyBody="A booking is made when you hire someone, or are hired, from a job post."
      emptyIcon={CARD_ICON.booking}
      count={bookings.length}
    >
      {bookings.map((b) => {
        const key = `booking:${b.id}`;
        const title = [b.role, b.postTitle].filter(Boolean).join(' · ');
        const detail = bookingDetail(b);
        return (
          <Row
            key={b.id}
            title={title}
            detail={detail}
            lead={<KindTile icon={CARD_ICON.booking} />}
            sending={sendingKey === key}
            disabled={busy}
            label={`${title}, ${detail}`}
            onPress={() => onSend(key, { kind: 'booking', bookingId: b.id })}
          />
        );
      })}
    </ListBody>
  );
}

// ─── Job posts ───────────────────────────────────────────────────────────────

const JOB_STATUS: Record<JobPost['status'], string> = {
  open: 'Open',
  filled: 'Filled',
  closed: 'Closed',
  expired: 'Expired',
};

function JobList({ sendingKey, busy, onSend }: ListProps) {
  const { jobs, isLoading, loadFailed, refetch } = useMyJobs();
  return (
    <ListBody
      isLoading={isLoading}
      loadFailed={loadFailed}
      what="your job posts"
      onRetry={() => void refetch()}
      empty="You have no job posts yet"
      emptyBody="Post a job from Jobs, and you can share it here."
      emptyIcon={CARD_ICON['job-post']}
      count={jobs.length}
    >
      {jobs.map((j) => {
        const key = `job:${j.id}`;
        const detail = [JOB_STATUS[j.status], planDayLabel(j.eventDate), j.location].filter(Boolean).join(' · ');
        return (
          <Row
            key={j.id}
            title={j.title}
            detail={detail}
            lead={<KindTile icon={CARD_ICON['job-post']} />}
            sending={sendingKey === key}
            disabled={busy}
            label={`${j.title}, ${detail}`}
            onPress={() => onSend(key, { kind: 'job-post', postId: j.id })}
          />
        );
      })}
    </ListBody>
  );
}

// ─── Posts ───────────────────────────────────────────────────────────────────

function PostThumb({ post }: { post: Showcase }) {
  const first = post.pieces[0];
  return (
    <View className="w-10 h-[50px] rounded-lg bg-muted overflow-hidden">
      {first?.url ? (
        <RemoteImage source={{ uri: first.url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
      ) : null}
      {first?.kind === 'video' ? (
        <View className="absolute bottom-0.5 left-0.5">
          <FilmIcon size={11} color={PALETTES.light.actionForeground} />
        </View>
      ) : null}
    </View>
  );
}

function likes(n: number): string {
  return `${n} like${n === 1 ? '' : 's'}`;
}

function PostList({ sendingKey, busy, onSend }: ListProps) {
  const { showcases, isLoading, loadFailed, refetch } = useMyShowcases();
  // Only what is up: a draft or a post taken down cannot be shared.
  const live = showcases.filter((s) => showcaseStatus(s) === 'live');
  return (
    <ListBody
      isLoading={isLoading}
      loadFailed={loadFailed}
      what="your posts"
      onRetry={() => void refetch()}
      empty="You have no published posts yet"
      emptyBody="Posts you publish from your profile can be shared here."
      emptyIcon={CARD_ICON.post}
      count={live.length}
    >
      {live.map((s) => {
        const key = `post:${s.id}`;
        const title = s.title?.trim() || 'Untitled post';
        const detail = [likes(s.likeCount), s.pieces.length > 1 ? `${s.pieces.length} pieces` : null]
          .filter(Boolean)
          .join(' · ');
        return (
          <Row
            key={s.id}
            title={title}
            detail={detail}
            lead={<PostThumb post={s} />}
            sending={sendingKey === key}
            disabled={busy}
            label={`${title}, ${detail}`}
            onPress={() => onSend(key, { kind: 'post', showcaseId: s.id })}
          />
        );
      })}
    </ListBody>
  );
}

// ─── Packages ────────────────────────────────────────────────────────────────

function packageDetail(p: MoneyPackage): string {
  const money = p.paidInFull
    ? `Paid in full · ${formatMoney(p.totalMinor)}`
    : `Paid ${formatMoney(p.receivedMinor)} · ${formatMoney(p.balanceMinor)} left`;
  return [p.clientName, money].filter(Boolean).join(' · ');
}

function PackageList({ sendingKey, busy, onSend }: ListProps) {
  const { packages, isLoading, loadFailed, refetch } = useMoneyPackages('all');
  return (
    <ListBody
      isLoading={isLoading}
      loadFailed={loadFailed}
      what="your packages"
      onRetry={() => void refetch()}
      empty="You have no packages yet"
      emptyBody="Add a package in Money to track what a client has paid."
      emptyIcon={CARD_ICON.package}
      count={packages.length}
    >
      {packages.map((p) => {
        const key = `package:${p.id}`;
        const detail = packageDetail(p);
        return (
          <Row
            key={p.id}
            title={p.title}
            detail={detail}
            lead={<KindTile icon={CARD_ICON.package} />}
            sending={sendingKey === key}
            disabled={busy}
            label={`${p.title}, ${detail}`}
            onPress={() => onSend(key, { kind: 'package', packageId: p.id })}
          />
        );
      })}
    </ListBody>
  );
}
