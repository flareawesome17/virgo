import { Redirect } from 'expo-router';

/**
 * People live on Connect.
 *
 * This route drew its own "Network" header with a count of collaborators,
 * which only ever showed if something opened /network directly — nothing in
 * the app did. The screen itself is Connect's People half now
 * (components/connect/PeopleView). Kept as a route, not deleted, so a link
 * already out there still lands somewhere.
 */
export default function NetworkScreen() {
  return <Redirect href="/(app)/(tabs)/connect?view=people" />;
}
