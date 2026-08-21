import { View, Text, Modal, Pressable, ScrollView, Alert } from 'react-native';
import { useState } from 'react';
import { SparklesIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAuth } from '@/src/hooks';
import { RolePicker } from '@/components/RolePicker';

cssInterop(SparklesIcon, {
  className: { target: 'style', nativeStyleToProp: { color: true } },
});

/**
 * Asks accounts created before roles existed to pick theirs.
 *
 * Roles are required at sign-up, but everyone who joined before that has an
 * empty array — and an empty array means invisible in Nearby, which is where
 * work comes from. Leaving it to a settings screen would mean it never got
 * filled in.
 *
 * Deliberately not dismissible by tapping outside or by the back button: the
 * whole reason it exists is that the alternative is people never doing it.
 * There is still a "Not now" — a modal with no way out is worse than an empty
 * profile — but it has to be chosen, and it comes back next launch.
 *
 * Mounted once, app-wide, inside the authenticated layout.
 */
export function RolesRequiredSheet() {
  const { profile, isAuthenticated, updateProfile } = useAuth();
  const [picked, setPicked] = useState<string[]>([]);
  const [postponed, setPostponed] = useState(false);

  const needsRoles =
    isAuthenticated && !!profile && (profile.roles ?? []).length === 0;

  if (!needsRoles || postponed) return null;

  const save = () => {
    updateProfile.mutate(
      { roles: picked },
      {
        onError: (err: any) =>
          Alert.alert('Could not save', err?.message || 'Please try again.'),
      },
    );
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={() => {}}>
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: '#00000077',
        }}
      >
        <View className="bg-background rounded-t-3xl px-5 pt-5 pb-8">
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: '#B66A4022',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SparklesIcon size={20} className="text-primary" />
          </View>

          <Text className="text-foreground text-[20px] font-bold tracking-tight mt-3">
            What do you do on a shoot?
          </Text>
          <Text className="text-muted-foreground text-sm mt-2 leading-5">
            Your account was made before we asked this. It is how people find
            each other in Nearby — somebody looking to hire a photographer or an
            SDE editor searches by role, so without one you do not appear at
            all. Pick everything that applies.
          </Text>

          <ScrollView
            style={{ maxHeight: 260 }}
            showsVerticalScrollIndicator={false}
            className="mt-4"
          >
            <RolePicker selected={picked} onChange={setPicked} />
          </ScrollView>

          <View className="flex-row gap-3 mt-6">
            <Pressable
              onPress={() => setPostponed(true)}
              className="flex-1 bg-card rounded-2xl py-3.5 items-center active:scale-[0.97]"
            >
              <Text className="text-muted-foreground text-base font-semibold">
                Not now
              </Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={picked.length === 0 || updateProfile.isPending}
              className={`flex-[1.6] rounded-2xl py-3.5 items-center active:scale-[0.97] ${
                picked.length > 0 ? 'bg-action' : 'bg-muted'
              }`}
            >
              <Text
                className={`text-base font-bold ${
                  picked.length > 0 ? 'text-white' : 'text-muted-foreground'
                }`}
              >
                {updateProfile.isPending
                  ? 'Saving…'
                  : `Save${picked.length > 0 ? ` (${picked.length})` : ''}`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
