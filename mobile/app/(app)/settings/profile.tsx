import { View, Text, ScrollView, Pressable, TextInput, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
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
  const [name, setName] = useState('Riya Kapoor');
  const [title, setTitle] = useState('Creative Director & Photographer');
  const [email, setEmail] = useState('riya@virgo.studio');
  const [phone, setPhone] = useState('+1 (310) 555-0192');
  const [website, setWebsite] = useState('riyakapoor.com');
  const [location, setLocation] = useState('Los Angeles, CA');
  const [bio, setBio] = useState('Editorial and commercial photographer specializing in fashion, lifestyle, and brand storytelling.');

  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    Alert.alert('Saved', 'Profile updated successfully.');
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
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
            <Image
              source={{ uri: 'https://picsum.photos/seed/virgo-user/200/200' }}
              style={{ width: 88, height: 88, borderRadius: 44 }}
            />
            <Pressable className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary items-center justify-center active:scale-[0.90]"
              style={{ shadowColor: '#B66A40', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}>
              <CameraIcon size={14} className="text-white" />
            </Pressable>
          </View>
          <Text className="text-muted-foreground text-xs mt-3">Tap to change photo</Text>
        </View>

        {/* Form fields */}
        <View className="px-5 gap-4">
          <FieldRow icon={UserIcon} label="Name" value={name} onChange={setName} color="#B66A40" />
          <FieldRow icon={BriefcaseIcon} label="Title" value={title} onChange={setTitle} color="#C17745" />
          <FieldRow icon={MailIcon} label="Email" value={email} onChange={setEmail} color="#8B5E3C" keyboardType="email-address" />
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
      <View className="absolute bottom-0 left-0 right-0 px-5 pb-10 pt-4 bg-background">
        <Pressable
          onPress={handleSave}
          className={`rounded-2xl py-3.5 items-center active:scale-[0.97] ${saved ? 'bg-[#6B8E4E]' : 'bg-primary'}`}
        >
          <Text className="text-white text-base font-bold flex-row items-center">
            {saved ? '✓  Saved' : 'Save Changes'}
          </Text>
        </Pressable>
      </View>
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
