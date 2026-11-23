import { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  FlagIcon,
  MessageCircleIcon,
  ShieldIcon,
  ShieldOffIcon,
  UserIcon,
  UserMinusIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { titleFromRoles, type Participant } from '@/src/api';
import { ChatAvatar } from './ChatAvatar';
import { firstNameOf } from './chat-words';

for (const Icon of [FlagIcon, MessageCircleIcon, ShieldIcon, ShieldOffIcon, UserIcon, UserMinusIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** "Videographer", "Photographer & Editor", from what they put on their profile. */
export function memberRoles(p: Participant): string {
  return titleFromRoles([...(p.roles ?? []), ...(p.custom_roles ?? [])]);
}

/** "Videographer · in this group since Nov 12". */
function memberLine(p: Participant): string {
  const roles = memberRoles(p);
  const since = p.joined_at
    ? new Date(p.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;
  if (roles && since) return `${roles} · in this group since ${since}`;
  if (since) return `In this group since ${since}`;
  return roles;
}

export type MemberAction = 'message' | 'profile' | 'admin' | 'remove' | 'report';

function Row({
  Icon,
  label,
  caption,
  destructive = false,
  onPress,
}: {
  Icon: LucideIcon;
  label: string;
  caption?: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={caption ? `${label}. ${caption}` : label}
      className={`${caption ? 'min-h-[64px]' : 'min-h-[56px]'} px-5 py-2 flex-row items-center gap-3.5 active:bg-muted/40`}
    >
      <View
        className={`w-10 h-10 rounded-xl items-center justify-center ${destructive ? 'bg-destructive/10' : 'bg-muted'}`}
      >
        <Icon size={19} className={destructive ? 'text-destructive' : 'text-foreground'} />
      </View>
      <View className="flex-1 min-w-0">
        <Text
          className={`text-[15px] leading-5 font-semibold ${destructive ? 'text-destructive' : 'text-foreground'}`}
        >
          {label}
        </Text>
        {caption ? (
          <Text className="text-muted-foreground text-[13px] leading-[18px]">{caption}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Tapping somebody in a group's info: message them, their profile, and for
 * an admin, making them one and taking them out of the group. Report or
 * block is for everyone.
 *
 * The choice runs once the sheet has gone: what follows is often an alert or
 * another sheet, which iOS will not show over one still leaving. Removing
 * somebody asks first, on the sheet itself.
 */
export function GroupMemberSheet({
  member,
  iAmAdmin,
  onClose,
  onAction,
}: {
  member: Participant | null;
  iAmAdmin: boolean;
  onClose: () => void;
  onAction: (action: MemberAction, member: Participant) => void;
}) {
  const chosen = useRef<{ action: MemberAction; member: Participant } | null>(null);
  /** Whose removal is being asked about. A new member starts on the menu. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const asking = !!member && confirming === member.id;
  const pick = (action: MemberAction) => {
    if (!member) return;
    chosen.current = { action, member };
    onClose();
  };
  const runChosen = () => {
    const next = chosen.current;
    chosen.current = null;
    setConfirming(null);
    if (next) onAction(next.action, next.member);
  };

  const p = member;
  const first = p ? firstNameOf(p.name) : '';
  const line = p ? memberLine(p) : '';

  return (
    <BottomSheet visible={!!member} onClose={onClose} onClosed={runChosen}>
      {p && asking ? (
        <View className="px-5 pt-1 pb-2">
          <Text className="text-foreground text-[18px] leading-[26px] font-bold" accessibilityRole="header">
            Remove {first} from the group?
          </Text>
          <Text className="text-muted-foreground text-[14px] leading-5 mt-1">
            {`${first} won't see new messages. The chat says ${first} was removed.`}
          </Text>
          <Pressable
            onPress={() => pick('remove')}
            accessibilityRole="button"
            className="mt-4 h-11 rounded-[14px] bg-destructive items-center justify-center active:opacity-80"
          >
            <Text className="text-destructive-foreground text-[15px] font-semibold">Remove {first}</Text>
          </Pressable>
          <Pressable
            onPress={() => setConfirming(null)}
            accessibilityRole="button"
            className="mt-2 h-11 rounded-[14px] bg-muted items-center justify-center active:opacity-70"
          >
            <Text className="text-foreground text-[15px] font-semibold">Cancel</Text>
          </Pressable>
        </View>
      ) : p ? (
        <View className="pb-2">
          <View className="mx-5 mt-1.5 mb-2.5 flex-row items-center gap-3">
            <ChatAvatar name={p.name} url={p.avatar_url} size={48} />
            <View className="flex-1 min-w-0">
              <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
                {p.name}
              </Text>
              {line ? (
                <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={2}>
                  {line}
                </Text>
              ) : null}
            </View>
          </View>

          {!p.blocked_by_me ? (
            <Row Icon={MessageCircleIcon} label={`Message ${first}`} onPress={() => pick('message')} />
          ) : null}
          {p.handle ? <Row Icon={UserIcon} label="View profile" onPress={() => pick('profile')} /> : null}
          {iAmAdmin ? (
            p.is_admin ? (
              <Row
                Icon={ShieldOffIcon}
                label="Remove admin"
                caption={`${first} stays in the group, without an admin's controls`}
                onPress={() => pick('admin')}
              />
            ) : (
              <Row
                Icon={ShieldIcon}
                label="Make admin"
                caption="Can add and remove people, and change the photo"
                onPress={() => pick('admin')}
              />
            )
          ) : null}
          {iAmAdmin ? (
            <Row
              Icon={UserMinusIcon}
              label="Remove from group"
              caption={`${first} won't see new messages. The chat says ${first} was removed.`}
              destructive
              onPress={() => setConfirming(p.id)}
            />
          ) : null}
          <Row Icon={FlagIcon} label="Report or block" onPress={() => pick('report')} />

          <View className="px-5 pt-2">
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              className="h-11 rounded-[14px] bg-muted items-center justify-center active:opacity-70"
            >
              <Text className="text-foreground text-[15px] font-semibold">Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}
