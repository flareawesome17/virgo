import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { MessageCircleIcon, UsersIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { SegmentedTabs, TabScreen } from '@/components';
import { PeopleView } from '@/components/connect/PeopleView';
import { useMarkPeopleSeen, usePeopleUnseen, useUnreadCount } from '@/src/hooks';
import ChatScreen from './chat';

cssInterop(MessageCircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

type ConnectView = 'messages' | 'people';

/**
 * Conversations and the people you work with, as one destination.
 *
 * Which half shows is the address, not state kept beside it. The switch
 * writes it (setParams), and a link — a notification, "Find people", the
 * Dashboard's Connections tile — sets it. With state that only followed the
 * address when the address changed, switching to Messages by hand and then
 * following a second link to People left you on Messages.
 *
 * Both halves stay mounted once they have been shown, so switching keeps a
 * typed search and the scroll position, and does not refetch everything on
 * every switch.
 */
export default function ConnectScreen() {
  const params = useLocalSearchParams<{ view?: string }>();
  const view: ConnectView = params.view === 'people' ? 'people' : 'messages';
  const setView = (next: ConnectView) => router.setParams({ view: next });

  const unread = useUnreadCount();
  const unseen = usePeopleUnseen();
  const markSeen = useMarkPeopleSeen();
  const focused = useIsFocused();

  // People is mounted the first time it is shown, and kept from then on.
  const [peopleMounted, setPeopleMounted] = useState(view === 'people');
  useEffect(() => {
    if (view === 'people') setPeopleMounted(true);
  }, [view]);

  /*
   * Opening People is seeing what is waiting there: the requests stay listed
   * until they are answered, but they stop lighting the Messages dot. On
   * arriving, and again if one lands while you are looking at the list.
   */
  const lookingAtPeople = focused && view === 'people';
  const waitingUnseen = unseen.count;
  const wasLooking = useRef(false);
  useEffect(() => {
    const arrived = lookingAtPeople && !wasLooking.current;
    wasLooking.current = lookingAtPeople;
    // Not again on an API without the marker: its count only falls by
    // answering, and marking again on every refetch would never stop.
    if (arrived || (lookingAtPeople && waitingUnseen > 0 && unseen.supported)) markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookingAtPeople, waitingUnseen]);

  return (
    <TabScreen title="Connect">
      <View className="mx-5 mt-2 mb-1">
        <SegmentedTabs<ConnectView>
          segments={[
            { key: 'messages', label: 'Messages', icon: MessageCircleIcon, badge: unread },
            { key: 'people', label: 'People', icon: UsersIcon, badge: lookingAtPeople ? 0 : unseen.count },
          ]}
          value={view}
          onChange={setView}
        />
      </View>

      <View className="flex-1" style={view === 'messages' ? undefined : { display: 'none' }}>
        <ChatScreen embedded />
      </View>
      {peopleMounted && (
        <View className="flex-1" style={view === 'people' ? undefined : { display: 'none' }}>
          <PeopleView />
        </View>
      )}
    </TabScreen>
  );
}
