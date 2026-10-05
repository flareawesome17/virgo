import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SegmentedTabs, TabScreen } from '@/components';
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
    <TabScreen title="Connect">
      {/* Nearby sits beside the switch it used to share a title row with: the
          name is in the top bar now, and this is the other way in to people. */}
      <View className="mx-5 mt-2 mb-1 flex-row items-center gap-2">
        <View className="flex-1">
          <SegmentedTabs<typeof view>
            segments={[
              { key: 'messages', label: 'Messages', icon: MessageCircleIcon, badge: unread },
              { key: 'people', label: 'People', icon: UsersIcon, badge: requests },
            ]}
            value={view}
            onChange={setView}
          />
        </View>
        <Pressable
          onPress={() => router.push('/discover/nearby')}
          accessibilityRole="button"
          accessibilityLabel="Find people nearby"
          className="w-[52px] h-[52px] rounded-xl bg-secondary items-center justify-center active:opacity-70"
        >
          <MapPinIcon size={18} className="text-primary" />
        </Pressable>
      </View>

      {view === 'messages' ? <ChatScreen embedded /> : <NetworkScreen embedded />}
    </TabScreen>
  );
}
