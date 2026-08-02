import { View, Text, Pressable, Image, Alert } from 'react-native';
import { useState } from 'react';
import {
  CalendarDaysIcon,
  CameraIcon,
  CheckIcon,
  EyeIcon,
  MailIcon,
  PackageIcon,
  PresentationIcon,
  ScissorsIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { router } from 'expo-router';
import {
  useEventAttendees,
  useEventInvitations,
  useFriends,
  useInviteToEvent,
  useRespondToEventInvitation,
  useTheme,
  useUninviteFromEvent,
} from '@/src/hooks';
import { formatTime, labelForDateKey } from '@/src/lib/calendar';
import type { AttendeeStatus } from '@/src/api';

cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** Same mapping the schedule screens use, so an invitation looks like the
 *  event it will become once accepted. */
const EVENT_ICONS: Record<string, React.ComponentType<any>> = {
  shoot: CameraIcon,
  editing: ScissorsIcon,
  review: EyeIcon,
  delivery: PackageIcon,
  meeting: PresentationIcon,
};
const EVENT_COLORS: Record<string, string> = {
  shoot: '#B66A40',
  editing: '#C17745',
  review: '#8B5E3C',
  delivery: '#6B8E4E',
  meeting: '#5B7B9A',
};

const STATUS_LABEL: Record<AttendeeStatus, string> = {
  pending: 'Invited',
  accepted: 'Going',
  declined: 'Not going',
};

const STATUS_COLOR: Record<AttendeeStatus, string> = {
  pending: '#A89489',
  accepted: '#6B8E4E',
  declined: '#C4776A',
};

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/** A face or its fallback. Shared by the picker and the roster. */
function PersonAvatar({
  name,
  avatarUrl,
  size = 34,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#B66A4022',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#B66A40', fontSize: size * 0.35, fontWeight: '700' }}>
        {initials(name)}
      </Text>
    </View>
  );
}

/**
 * Picks people to invite.
 *
 * Only accepted friends are offered, which is also the server's rule. Showing
 * the constraint here means the user chooses from what is possible rather than
 * discovering it as a rejection after the fact.
 */
export function InvitePeoplePicker({
  selected,
  onChange,
  /** Already invited; shown as such rather than offered again. */
  disabledIds = [],
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabledIds?: string[];
}) {
  const { friends, isLoading } = useFriends({ status: 'accepted', limit: 100 });
  const invitable = friends.filter((f) => f.friend_user_id);

  if (isLoading) {
    return <Text className="text-muted-foreground text-sm">Loading…</Text>;
  }

  if (invitable.length === 0) {
    return (
      <Pressable
        onPress={() => router.push('/(app)/(tabs)/network')}
        className="bg-card rounded-2xl px-4 py-4 active:opacity-70"
      >
        <Text className="text-muted-foreground text-sm">
          Add friends from the Network tab to invite them to events.
        </Text>
      </Pressable>
    );
  }

  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );

  return (
    <View
      className="bg-card rounded-2xl overflow-hidden"
      style={{
        shadowColor: '#000',
        shadowOpacity: 0.03,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      {invitable.map((friend, i) => {
        const id = friend.friend_user_id!;
        const already = disabledIds.includes(id);
        const isSelected = selected.includes(id);

        return (
          <Pressable
            key={friend.id}
            disabled={already}
            onPress={() => toggle(id)}
            className="flex-row items-center gap-3 px-4 py-3 active:bg-muted/30"
            style={{
              opacity: already ? 0.45 : 1,
              ...(i < invitable.length - 1
                ? { borderBottomWidth: 1, borderBottomColor: '#F0E8E2' }
                : {}),
            }}
          >
            <PersonAvatar
              name={friend.friend_name}
              avatarUrl={friend.friend_avatar_url}
            />
            <Text className="text-foreground text-sm font-semibold flex-1" numberOfLines={1}>
              {friend.friend_name}
            </Text>
            {already ? (
              <Text className="text-muted-foreground text-xs">Invited</Text>
            ) : (
              <View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: isSelected ? '#B66A40' : '#D9C9BF',
                  backgroundColor: isSelected ? '#B66A40' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* className, not style={{color}}: cssInterop routes it to the
                    icon's color prop, and the style form does not typecheck. */}
                {isSelected && <CheckIcon size={12} className="text-white" />}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The guest list on an event you organise.
 *
 * Rendered only for the organiser: an attendee can see who else is coming from
 * the same endpoint, but has nothing here to change.
 */
export function EventAttendeesSection({ eventId }: { eventId: string }) {
  const { isDark } = useTheme();
  const { attendees } = useEventAttendees(eventId);
  const invite = useInviteToEvent();
  const uninvite = useUninviteFromEvent();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const send = () => {
    if (picked.length === 0) return;
    invite.mutate(
      { eventId, userIds: picked },
      {
        onSuccess: () => {
          setPicked([]);
          setPicking(false);
        },
        onError: (err: any) =>
          Alert.alert(
            'Could not send the invitations',
            err?.message || 'Please try again.',
          ),
      },
    );
  };

  const remove = (userId: string, name: string) =>
    Alert.alert('Remove from event', `Withdraw ${name}’s invitation?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => uninvite.mutate({ eventId, userId }),
      },
    ]);

  return (
    <View className="px-5 mt-5">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-foreground text-base font-bold tracking-tight">
          Who’s coming
        </Text>
        <Pressable
          onPress={() => setPicking((open) => !open)}
          className="flex-row items-center gap-1 active:opacity-60"
        >
          <UserPlusIcon size={13} className="text-primary" />
          <Text className="text-primary text-sm font-semibold">
            {picking ? 'Close' : 'Invite'}
          </Text>
        </Pressable>
      </View>

      {attendees.length === 0 && !picking ? (
        <View className="bg-card rounded-2xl p-6 items-center gap-2">
          <UsersIcon size={18} className="text-muted-foreground" />
          <Text className="text-muted-foreground text-sm">Nobody invited yet</Text>
        </View>
      ) : attendees.length > 0 ? (
        <View
          className="bg-card rounded-2xl overflow-hidden"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.04,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          {attendees.map((person, i) => (
            <View
              key={person.id}
              className="flex-row items-center gap-3 px-4 py-3"
              style={
                i < attendees.length - 1
                  ? {
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? '#2A2522' : '#F0E8E2',
                    }
                  : undefined
              }
            >
              <PersonAvatar name={person.name} avatarUrl={person.avatar_url} />
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                  {person.name}
                </Text>
                <Text style={{ color: STATUS_COLOR[person.status], fontSize: 11, fontWeight: '600', marginTop: 1 }}>
                  {STATUS_LABEL[person.status]}
                </Text>
              </View>
              <Pressable
                onPress={() => remove(person.user_id, person.name)}
                className="w-8 h-8 items-center justify-center active:opacity-60"
              >
                <XIcon size={14} className="text-muted-foreground" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {picking && (
        <View className="mt-3">
          <InvitePeoplePicker
            selected={picked}
            onChange={setPicked}
            disabledIds={attendees.map((a) => a.user_id)}
          />
          <Pressable
            onPress={send}
            disabled={picked.length === 0 || invite.isPending}
            className={`mt-3 rounded-2xl py-3 items-center active:scale-[0.97] ${
              picked.length > 0 ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <Text
              className={`text-sm font-bold ${
                picked.length > 0 ? 'text-white' : 'text-muted-foreground'
              }`}
            >
              {invite.isPending
                ? 'Sending…'
                : `Send ${picked.length > 0 ? `${picked.length} ` : ''}invitation${picked.length === 1 ? '' : 's'}`}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * Event invitations waiting on an answer.
 *
 * A full-width stacked list rather than a horizontal carousel. An invitation
 * is a decision with a deadline attached, and a card you have to swipe
 * sideways to find is the wrong shape for that — the date, the organiser and
 * the two buttons all need to be legible without scrolling.
 *
 * Renders nothing when there are none, so the usual day is unchanged.
 */
export function EventInvitationsCard() {
  const { isDark } = useTheme();
  const { invitations } = useEventInvitations();
  const respond = useRespondToEventInvitation();
  /** Which one is mid-flight, so only its buttons go quiet. */
  const [answering, setAnswering] = useState<string | null>(null);

  if (invitations.length === 0) return null;

  const answer = (eventId: string, accept: boolean) => {
    setAnswering(eventId);
    respond.mutate(
      { eventId, accept },
      {
        onError: (err: any) =>
          Alert.alert(
            'Could not send your answer',
            err?.message || 'Please try again.',
          ),
        onSettled: () => setAnswering(null),
      },
    );
  };

  return (
    <View className="px-5 mt-6">
      <View className="flex-row items-center gap-2 mb-3">
        <MailIcon size={15} className="text-primary" />
        <Text className="text-foreground text-base font-bold tracking-tight">
          Invitations
        </Text>
        <View className="bg-primary rounded-full px-2 py-0.5 min-w-[20px] items-center">
          <Text className="text-white text-[10px] font-bold">
            {invitations.length}
          </Text>
        </View>
      </View>

      <View className="gap-3">
        {invitations.map((invitation) => {
          const color = EVENT_COLORS[invitation.event_type] ?? '#B66A40';
          const Icon = EVENT_ICONS[invitation.event_type] ?? CalendarDaysIcon;
          const busy = answering === invitation.event_id;

          return (
            <View
              key={invitation.id}
              className="bg-card rounded-2xl overflow-hidden"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.06,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              }}
            >
              {/* A colour rail rather than a full tinted card: it reads as
                  "needs attention" without shouting over the agenda below. */}
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: 4, backgroundColor: color }} />

                <View className="flex-1 p-4">
                  <View className="flex-row items-start gap-3">
                    <View
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 12,
                        backgroundColor: `${color}18`,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon size={17} style={{ color }} />
                    </View>

                    <View className="flex-1 min-w-0">
                      <Text
                        className="text-foreground text-[15px] font-bold"
                        numberOfLines={1}
                      >
                        {invitation.title}
                      </Text>
                      <Text className="text-muted-foreground text-xs mt-1">
                        {labelForDateKey(invitation.event_date)}
                        {invitation.event_time
                          ? ` · ${formatTime(invitation.event_time)}`
                          : ' · All day'}
                      </Text>
                    </View>

                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                        backgroundColor: `${color}18`,
                      }}
                    >
                      <Text
                        style={{
                          color,
                          fontSize: 10,
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          letterSpacing: 0.4,
                        }}
                      >
                        {invitation.event_type}
                      </Text>
                    </View>
                  </View>

                  {invitation.description ? (
                    <Text
                      className="text-muted-foreground text-xs mt-2.5 leading-5"
                      numberOfLines={2}
                    >
                      {invitation.description}
                    </Text>
                  ) : null}

                  <View
                    className="flex-row items-center gap-2 mt-3 pt-3"
                    style={{
                      borderTopWidth: 1,
                      borderTopColor: isDark ? '#2A2522' : '#F0E8E2',
                    }}
                  >
                    <PersonAvatar name={invitation.inviter_name} size={22} />
                    <Text
                      className="text-muted-foreground text-xs flex-1"
                      numberOfLines={1}
                    >
                      {invitation.inviter_name} invited you
                    </Text>
                  </View>

                  <View className="flex-row gap-2 mt-3">
                    <Pressable
                      onPress={() => answer(invitation.event_id, false)}
                      disabled={busy}
                      className="flex-1 rounded-xl py-3 items-center justify-center active:scale-[0.97]"
                      style={{
                        borderWidth: 1,
                        borderColor: isDark ? '#3A322D' : '#E8DAD1',
                        opacity: busy ? 0.5 : 1,
                      }}
                    >
                      <Text className="text-foreground text-[13px] font-bold">
                        Decline
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => answer(invitation.event_id, true)}
                      disabled={busy}
                      className="flex-[1.4] bg-primary rounded-xl py-3 flex-row items-center justify-center gap-1.5 active:scale-[0.97]"
                      style={{ opacity: busy ? 0.5 : 1 }}
                    >
                      <CheckIcon size={14} className="text-white" />
                      <Text className="text-white text-[13px] font-bold">
                        {busy ? 'Sending…' : 'Accept'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
