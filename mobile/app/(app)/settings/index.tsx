import { useEffect } from 'react';
import { View } from 'react-native';
import { goToTab } from '@/src/lib/navigation';

/**
 * Old address of the Settings tab.
 *
 * Settings is a tab of the Dashboard now, under your profile. Anything still
 * sending people to /settings — `?view=app` included, from when it came in
 * two halves — lands there instead of on a screen that no longer exists.
 */
export default function SettingsRedirect() {
  useEffect(() => {
    goToTab('/?tab=settings');
  }, []);
  return <View className="flex-1 bg-background" />;
}
