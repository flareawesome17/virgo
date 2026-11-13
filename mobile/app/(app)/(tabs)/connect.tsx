import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { TabScreen } from '@/components';
import { PageTabs } from '@/components/PageTabs';
import { PeopleView } from '@/components/connect/PeopleView';
import { useMarkPeopleSeen, usePeopleUnseen, useUnreadCount } from '@/src/hooks';
import ChatScreen from './chat';


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
      {/* The screen's two pages, as the Dashboard's and Jobs' are: words
          with a line under the one you are on, each with what is waiting. */}
      <PageTabs<ConnectView>
        tabs={[
          { key: 'messages', label: 'Messages', badge: unread },
          { key: 'people', label: 'People', badge: lookingAtPeople ? 0 : unseen.count },
        ]}
        value={view}
        onChange={setView}
      />

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
