import { View, Text, ScrollView, Pressable, TextInput, Image, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useAuth, useUpload } from '@/src/hooks';
import {
  ArrowLeftIcon, CameraIcon, UserIcon, MailIcon, BriefcaseIcon, PhoneIcon,
  GlobeIcon, MapPinIcon, ChevronRightIcon, CheckIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CameraIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(BriefcaseIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PhoneIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(GlobeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MapPinIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function ProfileSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, profile, updateProfile } = useAuth();
  const upload = useUpload();

  // Seeded from the real profile once it loads. Every field was previously
  // hardcoded and Save only raised an alert — nothing persisted.
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');
  const [bio, setBio] = useState('');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!profile || hydrated) return;
    setName(profile.displayName ?? '');
    setTitle(profile.title ?? '');
    setPhone(profile.phone ?? '');
    setWebsite(profile.website ?? '');
    setLocation(profile.location ?? '');
    setBio(profile.bio ?? '');
    setHydrated(true);
  }, [profile, hydrated]);

  const [saved, setSaved] = useState(false);

  // Empty string means "cleared", which the API models as null.
  const orNull = (v: string) => (v.trim() ? v.trim() : null);

  const handleSave = () => {
    updateProfile.mutate(
      {
        displayName: orNull(name),
        title: orNull(title),
        phone: orNull(phone),
        website: orNull(website),
        location: orNull(location),
        bio: orNull(bio),
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
        onError: (err) =>
          Alert.alert('Could not save', err.message || 'Please try again.'),
      },
    );
  };

  /** Picks a photo, uploads it to storage, then saves the returned URL. */
  const handleChangePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set an avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    try {
      const uploaded = await upload.mutateAsync({
        uri: result.assets[0].uri,
        scope: 'avatars',
        mimeType: result.assets[0].mimeType,
      });
      if (!uploaded.publicUrl) {
        Alert.alert('Uploaded', 'No public URL is configured to serve it.');
        return;
      }
      await updateProfile.mutateAsync({ avatarUrl: uploaded.publicUrl });
    } catch (err) {
      Alert.alert(
        'Upload failed',
        err instanceof Error ? err.message : 'Please try again.',
      );
    }
  };

  const busy = updateProfile.isPending || upload.isPending;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Lifts the form above the keyboard. Without this the fields nearest
          the bottom sat underneath it on iOS with no way to scroll to them. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[22px] font-bold tracking-tight">Profile</Text>
        </View>

        {/* Avatar */}
        <View className="items-center mt-6 mb-6">
          <View className="relative">
            {profile?.avatarUrl ? (
              <Image
                source={{ uri: profile.avatarUrl }}
                style={{ width: 88, height: 88, borderRadius: 44 }}
              />
            ) : (
              <View
                style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: '#B66A4018', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#B66A40', fontSize: 32, fontWeight: '700' }}>
                  {(profile?.displayName || user?.email || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Pressable
              onPress={handleChangePhoto}
              disabled={busy}
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary items-center justify-center active:scale-[0.90]"
              style={{ shadowColor: '#B66A40', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}
            >
              <CameraIcon size={14} className="text-white" />
            </Pressable>
          </View>
          <Text className="text-muted-foreground text-xs mt-3">
            {upload.isPending ? 'Uploading…' : 'Tap to change photo'}
          </Text>
        </View>

        {/* Form fields */}
        <View className="px-5 gap-4">
          <FieldRow icon={UserIcon} label="Name" value={name} onChange={setName} color="#B66A40" />
          <FieldRow icon={BriefcaseIcon} label="Title" value={title} onChange={setTitle} color="#C17745" />
          {/* Read-only: changing the login address needs a verification flow
              that does not exist yet, so editing it here would be a lie. */}
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Email</Text>
            <View className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <MailIcon size={15} style={{ color: '#8B5E3C' }} />
              <Text className="text-muted-foreground text-base flex-1">{user?.email ?? ''}</Text>
            </View>
          </View>
          <FieldRow icon={PhoneIcon} label="Phone" value={phone} onChange={setPhone} color="#6B8E4E" keyboardType="phone-pad" />
          <FieldRow icon={GlobeIcon} label="Website" value={website} onChange={setWebsite} color="#5B7B9A" />
          <FieldRow icon={MapPinIcon} label="Location" value={location} onChange={setLocation} color="#C17745" />

          {/* Bio */}
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              placeholder="Tell us about yourself..."
              placeholderTextColor="#A89489"
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-sm"
              style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2, minHeight: 100 }}
            />
          </View>
        </View>
      </ScrollView>

      {/* Save FAB */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pt-4 bg-background" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable
          onPress={handleSave}
          disabled={busy}
          className={`rounded-2xl py-3.5 items-center active:scale-[0.97] ${saved ? 'bg-[#6B8E4E]' : 'bg-primary'}`}
        >
          <Text className="text-white text-base font-bold flex-row items-center">
            {saved ? '✓  Saved' : updateProfile.isPending ? 'Saving…' : 'Save Changes'}
          </Text>
        </Pressable>
      </View>
          </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldRow({
  icon: IconComp, label, value, onChange, color, keyboardType,
}: {
  icon: React.ComponentType<any>; label: string; value: string;
  onChange: (v: string) => void; color: string; keyboardType?: string;
}) {
  return (
    <View>
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
        {label}
      </Text>
      <View
        className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
        style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
      >
        <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: `${color}18`, alignItems: 'center', justifyContent: 'center' }}>
          <IconComp size={13} style={{ color }} />
        </View>
        <TextInput
          value={value}
          onChangeText={onChange}
          className="text-foreground text-sm flex-1"
          keyboardType={keyboardType as any}
          autoCapitalize="none"
        />
      </View>
    </View>
  );
}
