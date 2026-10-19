import { Redirect } from 'expo-router';

/**
 * Connection requests and connections live on Connect, People.
 *
 * This screen was only reachable from its sibling (requests and accepted
 * linked to each other and nothing else did), and kept a second copy of
 * lists People already shows. Kept as a route so an old link still lands.
 */
export default function FriendsRedirect() {
  return <Redirect href="/(app)/(tabs)/connect?view=people" />;
}
