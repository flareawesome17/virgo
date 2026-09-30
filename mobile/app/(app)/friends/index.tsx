import { Redirect } from 'expo-router';

/**
 * Connections live on Connect, People.
 *
 * This was an older list of the same people, still reached from the in-app
 * notifications for friend requests and from the accepted screen. Its Message
 * and Mail buttons had no handler and its search box was text drawn to look
 * like one — while Connect had working versions of all three.
 *
 * Kept as a route, not deleted, so a link or a notification already out there
 * still lands somewhere.
 */
export default function FriendsScreen() {
  return <Redirect href="/(app)/(tabs)/connect?view=people" />;
}
