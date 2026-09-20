import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppTopBar } from '@/components';
import { router, useLocalSearchParams } from 'expo-router';
import { MapPinIcon, MessageCircleIcon, UsersIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useIncomingFriendRequests, useUnreadCount } from '@/src/hooks';
import ChatScreen from './chat';
import NetworkScreen from './network';

cssInterop(MapPinIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MessageCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

type ConnectView = 'messages' | 'people';

/**
 * One primary destination for conversations and professional relationships.
 * The original /chat and /network routes remain intact for deep links.
 */
export default function ConnectScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const requestedView: ConnectView = params.view === 'people' ? 'people' : 'messages';
  const [view, setView] = useState<ConnectView>(requestedView);
  const unread = useUnreadCount();
  const { count: requests } = useIncomingFriendRequests();

  useEffect(() => {
    setView(requestedView);
  }, [requestedView]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <AppTopBar />
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <View>
          <Text className="text-foreground text-[28px] font-bold tracking-tight">Connect</Text>
          <Text className="text-muted-foreground text-sm mt-1">
            Messages, people, and requests
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/discover/nearby')}
          accessibilityRole="button"
          accessibilityLabel="Find people nearby"
          className="w-11 h-11 rounded-xl bg-secondary items-center justify-center active:scale-[0.96]"
        >
          <MapPinIcon size={18} className="text-primary" />
        </Pressable>
      </View>

      <View
        accessibilityRole="tablist"
        className="mx-5 mt-3 mb-1 flex-row rounded-xl bg-secondary p-1"
      >
        <ConnectTab
          label="Messages"
          icon={MessageCircleIcon}
          active={view === 'messages'}
          badge={unread}
          onPress={() => setView('messages')}
        />
        <ConnectTab
          label="People"
          icon={UsersIcon}
          active={view === 'people'}
          badge={requests}
          onPress={() => setView('people')}
        />
      </View>

      {view === 'messages' ? <ChatScreen embedded /> : <NetworkScreen embedded />}
    </SafeAreaView>
  );
}

function ConnectTab({
  label,
  icon: Icon,
  active,
  badge,
  onPress,
}: {
  label: string;
  icon: typeof MessageCircleIcon;
  active: boolean;
  badge: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={badge > 0 ? `${label}, ${badge} unread` : label}
      className={`min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-lg px-3 active:scale-[0.98] ${
        active ? 'bg-card' : 'bg-transparent'
      }`}
    >
      <Icon size={17} className={active ? 'text-primary' : 'text-muted-foreground'} />
      <Text className={`text-sm font-semibold ${active ? 'text-foreground' : 'text-muted-foreground'}`}>
        {label}
      </Text>
      {badge > 0 && (
        <View className="min-w-[20px] rounded-full bg-action px-1.5 py-0.5">
          <Text className="text-action-foreground text-[11px] font-bold text-center">
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
