import { useEffect } from 'react';
import { View } from 'react-native';
import { goToTab } from '@/src/lib/navigation';

/**
 * Old address of "Your profile".
 *
 * Your profile is the Dashboard now. Links here come from your own posts —
 * your name on a showcase, a private one just saved — so they open its Work
 * tab, where those posts are.
 */
export default function YourProfileRedirect() {
  useEffect(() => {
    goToTab('/?tab=work');
  }, []);
  return <View className="flex-1 bg-background" />;
}
