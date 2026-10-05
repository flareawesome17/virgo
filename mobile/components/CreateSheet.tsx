import { useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, type Href } from 'expo-router';
import {
  AlarmClockIcon,
  BriefcaseIcon,
  CalendarPlusIcon,
  FolderPlusIcon,
  ImagePlusIcon,
  ImagesIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { usePlanLimits } from '@/src/hooks';

for (const Icon of [
  AlarmClockIcon, BriefcaseIcon, CalendarPlusIcon, FolderPlusIcon, ImagePlusIcon, ImagesIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** Everything the + in the top bar can start. */
export type CreateKind = 'showcase' | 'job' | 'workspace' | 'album' | 'event' | 'reminder';

interface CreateItem {
  kind: CreateKind;
  label: string;
  /** One line saying what it is, for somebody who has never made one. */
  detail: string;
  icon: LucideIcon;
}

/**
 * In three groups, by what the thing is for: putting work and needs in front
 * of other people, keeping a client's work together, and the calendar.
 *
 * The order never changes with the screen — the same thing is always in the
 * same place for the thumb. The screen you are on marks its own item instead.
 */
const GROUPS: { title: string; items: CreateItem[] }[] = [
  {
    title: 'Share',
    items: [
      { kind: 'showcase', label: 'Showcase', detail: 'Post your work to the Feed', icon: ImagePlusIcon },
      { kind: 'job', label: 'Job', detail: 'Hire people for a shoot', icon: BriefcaseIcon },
    ],
  },
  {
    title: 'Organize',
    items: [
      { kind: 'workspace', label: 'Workspace', detail: 'A home for one client', icon: FolderPlusIcon },
      { kind: 'album', label: 'Album', detail: 'Photos and films, in a workspace', icon: ImagesIcon },
    ],
  },
  {
    title: 'Plan',
    items: [
      { kind: 'event', label: 'Event', detail: 'A shoot, review or deadline', icon: CalendarPlusIcon },
      { kind: 'reminder', label: 'Reminder', detail: 'A nudge at a set time', icon: AlarmClockIcon },
    ],
  },
];

const ROUTES: Record<CreateKind, Href> = {
  showcase: '/showcase/new',
  job: '/jobs/new',
  workspace: '/workspaces/create',
  album: '/albums/create',
  event: '/schedule/create',
  reminder: '/schedule/reminders/create',
};

/**
 * The one way to start something new, from anywhere: what the four separate
 * + buttons — Feed, Jobs, Workspaces, Schedule, each its own shape — and the
 * Dashboard's quick-create row used to do between them.
 *
 * The choice is acted on once the sheet has gone, not as it is tapped: the
 * forms open as full-screen modals, and iOS will not present one over a sheet
 * that is still leaving. The plan limits are checked at the same moment, so
 * their explanation is not drawn under a sheet on its way out.
 */
export function CreateSheet({
  visible,
  onClose,
  current,
}: {
  visible: boolean;
  onClose: () => void;
  /** The screen's own kind, marked in the list. */
  current?: CreateKind;
}) {
  const { guardWorkspaceCreate, guardAlbumCreate } = usePlanLimits();
  const chosen = useRef<CreateKind | null>(null);

  const go = (kind: CreateKind) => {
    const open = () => router.push(ROUTES[kind]);
    if (kind === 'workspace') guardWorkspaceCreate(open)();
    else if (kind === 'album') guardAlbumCreate(open)();
    else open();
  };

  const onClosed = () => {
    const kind = chosen.current;
    chosen.current = null;
    if (kind) go(kind);
  };

  const pick = (kind: CreateKind) => {
    chosen.current = kind;
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed} closeLabel="Close, create nothing">
      <View className="px-5 pt-1 pb-2">
        <Text accessibilityRole="header" className="text-foreground text-[20px] font-bold tracking-tight">
          Create
        </Text>
      </View>
      {GROUPS.map((group) => (
        <View key={group.title} className="pt-2">
          <Text className="px-5 pb-1 text-muted-foreground text-[11px] font-bold uppercase tracking-[1.5px]">
            {group.title}
          </Text>
          {group.items.map((item) => {
            const Icon = item.icon;
            const here = item.kind === current;
            return (
              <Pressable
                key={item.kind}
                onPress={() => pick(item.kind)}
                accessibilityRole="button"
                accessibilityLabel={`${item.label}. ${item.detail}`}
                accessibilityHint={here ? 'For the screen you are on' : undefined}
                className={`mx-2 min-h-14 flex-row items-center gap-3.5 rounded-2xl px-3 py-2.5 active:bg-muted ${
                  here ? 'bg-primary/10' : ''
                }`}
              >
                <View
                  className={`h-10 w-10 items-center justify-center rounded-xl ${
                    here ? 'bg-primary' : 'bg-primary/10'
                  }`}
                >
                  <Icon size={20} className={here ? 'text-primary-foreground' : 'text-primary'} />
                </View>
                <View className="flex-1 min-w-0">
                  <Text className="text-foreground text-[15px] font-bold">{item.label}</Text>
                  <Text className="text-muted-foreground text-[13px] mt-0.5" numberOfLines={1}>
                    {item.detail}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      <View className="h-3" />
    </BottomSheet>
  );
}
