import { View, Text, ScrollView, RefreshControl, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth, useTheme } from '@/src/hooks';
import { useState } from 'react';
import {
  HardDriveIcon,
  ImageIcon,
  ClockIcon,
  CalendarIcon,
  WifiIcon,
  WifiOffIcon,
  PlusIcon,
  UploadIcon,
  UserPlusIcon,
  FolderPlusIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  CircleIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LinearGradient } from 'expo-linear-gradient';

cssInterop(HardDriveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(WifiIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(WifiOffIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UploadIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FolderPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArrowUpRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const QUICK_ACTIONS = [
  { key: 'workspace', label: 'New Workspace', icon: FolderPlusIcon },
  { key: 'album', label: 'Create Album', icon: PlusIcon },
  { key: 'upload', label: 'Upload', icon: UploadIcon },
  { key: 'invite', label: 'Invite', icon: UserPlusIcon },
];

const EVENT_TYPE_COLORS: Record<string, string> = {
  shoot: '#B66A40',
  editing: '#C17745',
  review: '#8B5E3C',
  delivery: '#6B8E4E',
  meeting: '#5B7B9A',
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function StorageBar({ used, total }: { used: number; total: number }) {
  const pct = Math.min((used / total) * 100, 100);
  return (
    <View className="h-2 bg-muted rounded-full overflow-hidden">
      <View className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#B66A40' }} />
    </View>
  );
}

function AvatarStack({ urls, count }: { urls: string[]; count: number }) {
  const display = urls.slice(0, 3);
  const extra = count - display.length;
  return (
    <View className="flex-row">
      {display.map((url, i) => (
        <Image
          key={i}
          source={{ uri: url }}
          style={{ width: 28, height: 28, borderRadius: 14, marginLeft: i > 0 ? -10 : 0, borderWidth: 2, borderColor: '#FFFFFF' }}
        />
      ))}
      {extra > 0 && (
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            marginLeft: -10,
            borderWidth: 2,
            borderColor: '#FFFFFF',
            backgroundColor: '#FAF2EC',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text className="text-[10px] font-bold text-muted-foreground">+{extra}</Text>
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const { client } = useApp();
  const { user } = useAuth();
  const { isDark } = useTheme();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: workspaces = [], isLoading: wsLoading } = useQuery({
    queryKey: ['workspaces', user?.id],
    queryFn: async () => {
      const { data, error } = await client
        .from('workspaces')
        .select('*')
        .eq('user_id', user?.id)
        .order('updated_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: albums = [] } = useQuery({
    queryKey: ['albums', user?.id],
    queryFn: async () => {
      const { data, error } = await client
        .from('albums')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['schedule_events', user?.id],
    queryFn: async () => {
      const { data, error } = await client
        .from('schedule_events')
        .select('*')
        .eq('user_id', user?.id)
        .order('event_date', { ascending: true })
        .limit(4);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    await queryClient.invalidateQueries({ queryKey: ['albums'] });
    await queryClient.invalidateQueries({ queryKey: ['schedule_events'] });
    setRefreshing(false);
  };

  const totalMedia = workspaces.reduce((s, w) => s + (w.media_count || 0), 0);
  const totalAlbums = albums.length;
  const storageUsedGB = 128.4;
  const storageTotalGB = 512;

  const todayEvent = events.length > 0 ? events[0] : null;
  const upcomingEvents = events.slice(0, 3);

  const workspaceNameById = Object.fromEntries(workspaces.map((w) => [w.id, w.name]));

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={isDark ? '#C17745' : '#B66A40'}
          />
        }
      >
        {/* ── Header ── */}
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <View>
            <Text className="text-muted-foreground text-sm font-medium">Good morning</Text>
            <Text className="text-foreground text-[28px] font-bold tracking-tight leading-[34px]">
              Riya
            </Text>
          </View>
          <Pressable className="active:scale-[0.96]">
            <Image
              source={{ uri: 'https://picsum.photos/seed/virgo-user/100/100' }}
              style={{ width: 44, height: 44, borderRadius: 22 }}
            />
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#6B8E4E',
                borderWidth: 2,
                borderColor: '#FFF8F4',
              }}
            />
          </Pressable>
        </View>

        {/* ── Storage + Activity Hero Row ── */}
        <View className="px-5 pt-3 flex-row gap-3">
          {/* Storage card */}
          <View className="flex-1 bg-card rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}>
            <View className="flex-row items-center gap-2 mb-3">
              <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center">
                <HardDriveIcon size={16} className="text-primary" />
              </View>
              <Text className="text-foreground text-xs font-semibold">Storage</Text>
            </View>
            <Text className="text-foreground text-[26px] font-extrabold tracking-tight">
              {storageUsedGB}
              <Text className="text-muted-foreground text-sm font-medium"> / {storageTotalGB} GB</Text>
            </Text>
            <View className="mt-3">
              <StorageBar used={storageUsedGB} total={storageTotalGB} />
            </View>
            <Text className="text-muted-foreground text-[11px] mt-2 font-medium">
              {Math.round((storageUsedGB / storageTotalGB) * 100)}% used · {storageTotalGB - storageUsedGB} GB free
            </Text>
          </View>

          {/* Today activity */}
          <View className="flex-1 bg-card rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 }}>
            <View className="flex-row items-center gap-2 mb-3">
              <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center">
                <ClockIcon size={16} className="text-primary" />
              </View>
              <Text className="text-foreground text-xs font-semibold">Today</Text>
            </View>
            {todayEvent ? (
              <>
                <Text className="text-foreground text-base font-bold" numberOfLines={1}>
                  {todayEvent.title}
                </Text>
                <Text className="text-muted-foreground text-xs mt-1">
                  {formatTime(todayEvent.event_time)}
                </Text>
              </>
            ) : (
              <Text className="text-muted-foreground text-sm">No events today</Text>
            )}
            <View className="flex-row items-center gap-1 mt-3">
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#6B8E4E' }} />
              <Text className="text-muted-foreground text-[11px] font-medium">
                {totalMedia.toLocaleString()} assets · {totalAlbums} albums
              </Text>
            </View>
          </View>
        </View>

        {/* ── Quick Actions ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingVertical: 16 }}
        >
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <Pressable
                key={action.key}
                className="bg-card rounded-2xl px-5 py-3 flex-row items-center gap-2 active:scale-[0.96]"
                style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
              >
                <Icon size={16} className="text-primary" />
                <Text className="text-foreground text-sm font-semibold">{action.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Upcoming Schedule ── */}
        <View className="px-5">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-lg font-bold tracking-tight">Upcoming</Text>
            <Pressable className="flex-row items-center gap-1 active:opacity-60">
              <Text className="text-primary text-sm font-semibold">See all</Text>
              <ChevronRightIcon size={14} className="text-primary" />
            </Pressable>
          </View>

          {upcomingEvents.length === 0 ? (
            <View className="bg-card rounded-2xl p-8 items-center gap-3">
              <View className="w-12 h-12 rounded-full bg-muted items-center justify-center">
                <CalendarIcon size={22} className="text-muted-foreground" />
              </View>
              <Text className="text-muted-foreground text-sm font-medium">No upcoming events</Text>
            </View>
          ) : (
            <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}>
              {upcomingEvents.map((event, i) => (
                <Pressable
                  key={event.id}
                  className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                  style={i < upcomingEvents.length - 1 ? { borderBottomWidth: 1, borderBottomColor: '#F0E8E2' } : undefined}
                >
                  <View style={{ width: 3, height: 36, borderRadius: 2, backgroundColor: EVENT_TYPE_COLORS[event.event_type] || '#B66A40' }} />
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                      {event.title}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {event.workspace_id && workspaceNameById[event.workspace_id]
                        ? `${workspaceNameById[event.workspace_id]} · `
                        : ''}
                      {event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1)}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-foreground text-xs font-bold">{formatDate(event.event_date)}</Text>
                    {event.event_time && (
                      <Text className="text-muted-foreground text-xs mt-0.5">{formatTime(event.event_time)}</Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ── Active Workspaces ── */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-lg font-bold tracking-tight">Active Workspaces</Text>
            <Pressable className="flex-row items-center gap-1 active:opacity-60">
              <Text className="text-primary text-sm font-semibold">See all</Text>
              <ChevronRightIcon size={14} className="text-primary" />
            </Pressable>
          </View>

          {wsLoading ? (
            <View className="gap-3">
              {[1, 2].map((i) => (
                <View key={i} className="bg-card rounded-2xl p-4 h-[72px]" style={{ opacity: 0.5 }} />
              ))}
            </View>
          ) : workspaces.length === 0 ? (
            <View className="bg-card rounded-2xl p-8 items-center gap-3">
              <View className="w-12 h-12 rounded-full bg-muted items-center justify-center">
                <FolderPlusIcon size={22} className="text-muted-foreground" />
              </View>
              <Text className="text-muted-foreground text-sm font-medium">No workspaces yet</Text>
              <Pressable className="bg-primary rounded-xl px-4 py-2 active:scale-[0.96]">
                <Text className="text-white text-sm font-semibold">Create your first workspace</Text>
              </Pressable>
            </View>
          ) : (
            <View className="gap-3">
              {workspaces.map((ws) => (
                <Pressable
                  key={ws.id}
                  className="bg-card rounded-2xl p-4 flex-row items-center gap-4 active:scale-[0.98]"
                  style={{
                    shadowColor: '#000',
                    shadowOpacity: 0.04,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: 3,
                  }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      backgroundColor: ws.accent_color ? `${ws.accent_color}18` : '#B66A4018',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 18, fontWeight: '700', color: ws.accent_color || '#B66A40' }}>
                      {ws.name.charAt(0)}
                    </Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-base font-semibold" numberOfLines={1}>
                      {ws.name}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {ws.media_count.toLocaleString()} assets · {ws.collaborator_count} collaborators
                    </Text>
                  </View>
                  <ArrowUpRightIcon size={16} className="text-muted-foreground" />
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ── Recent Albums ── */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-foreground text-lg font-bold tracking-tight">Recent Albums</Text>
            <Pressable className="flex-row items-center gap-1 active:opacity-60">
              <Text className="text-primary text-sm font-semibold">See all</Text>
              <ChevronRightIcon size={14} className="text-primary" />
            </Pressable>
          </View>

          {albums.length === 0 ? (
            <View className="bg-card rounded-2xl p-8 items-center gap-3">
              <View className="w-12 h-12 rounded-full bg-muted items-center justify-center">
                <ImageIcon size={22} className="text-muted-foreground" />
              </View>
              <Text className="text-muted-foreground text-sm font-medium">No albums yet</Text>
            </View>
          ) : (
            <View className="gap-3">
              {albums.map((album) => (
                <Pressable
                  key={album.id}
                  className="bg-card rounded-2xl overflow-hidden flex-row active:scale-[0.98]"
                  style={{
                    shadowColor: '#000',
                    shadowOpacity: 0.04,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: 3,
                  }}
                >
                  <Image
                    source={{ uri: album.cover_url || 'https://picsum.photos/seed/virgo-default/200/200' }}
                    style={{ width: 80, height: 80 }}
                  />
                  <View className="flex-1 p-3 justify-center min-w-0">
                    <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                      {album.name}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {album.item_count} items · {album.status.charAt(0).toUpperCase() + album.status.slice(1)}
                    </Text>
                    <View className="flex-row items-center gap-1.5 mt-2">
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: album.status === 'delivered' ? '#6B8E4E' : album.status === 'review' ? '#C17745' : '#A89489',
                        }}
                      />
                      <Text className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">
                        {album.status}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* ── Offline Sync Status ── */}
        <View className="px-5 mt-6 mb-2">
          <View className="bg-card rounded-2xl px-4 py-3 flex-row items-center gap-3" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <WifiIcon size={16} className="text-[#6B8E4E]" />
            <View className="flex-1">
              <Text className="text-foreground text-xs font-semibold">Offline sync active</Text>
              <Text className="text-muted-foreground text-[10px] mt-0.5">3 workspaces synced · Last sync 2 min ago</Text>
            </View>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#6B8E4E' }} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}


