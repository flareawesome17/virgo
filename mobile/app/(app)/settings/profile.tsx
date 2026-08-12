import { View, Text, ScrollView, Pressable, TextInput, Image, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { useAuth, useUpload } from '@/src/hooks';
import { titleFromRoles } from '@/src/api';
import { RolePicker } from '@/components';
import {
  ArrowLeftIcon, CameraIcon, UserIcon, MailIcon, BriefcaseIcon, PhoneIcon,
  GlobeIcon, MapPinIcon, ChevronRightIcon, CheckIcon, LockIcon, HashIcon,
  Building2Icon, AtSignIcon, HomeIcon,
  type LucideIcon,
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
cssInterop(LockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HashIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Building2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(AtSignIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HomeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

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
  const [roles, setRoles] = useState<string[]>([]);
  const [studioName, setStudioName] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('');
  const [hydrated, setHydrated] = useState(false);

  /*
   * Whether Title is still tracking the roles.
   *
   * True until somebody types their own. Leaving Title blank is the common
   * case, and a profile with no title reads as unfinished when the person has
   * already said exactly what they do one field below.
   */
  const [titleFollowsRoles, setTitleFollowsRoles] = useState(true);

  useEffect(() => {
    if (!profile || hydrated) return;
    setName(profile.displayName ?? '');
    setTitle(profile.title ?? '');
    setPhone(profile.phone ?? '');
    setWebsite(profile.website ?? '');
    setLocation(profile.location ?? '');
    setBio(profile.bio ?? '');
    setRoles(profile.roles ?? []);

    /*
     * Does the saved title look like one the roles produced?
     *
     * If it does — or there is none — Title keeps tracking the roles, so adding
     * Videographer later updates it. Anything else was written deliberately and
     * stays: changing a role must not rewrite "Wedding & lifestyle
     * photographer".
     */
    const savedTitle = (profile.title ?? '').trim();
    setTitleFollowsRoles(
      savedTitle === '' || savedTitle === titleFromRoles(profile.roles ?? []),
    );

    setStudioName(profile.studioName ?? '');
    setSocialHandle(profile.socialHandle ?? '');
    setLine1(profile.addressLine1 ?? '');
    setLine2(profile.addressLine2 ?? '');
    setCity(profile.addressCity ?? '');
    setProvince(profile.addressProvince ?? '');
    setPostal(profile.addressPostal ?? '');
    setCountry(profile.addressCountry ?? '');
    setHydrated(true);
  }, [profile, hydrated]);

  /** "Photographer & Videographer", from whatever is selected below. */
  const derivedTitle = titleFromRoles(roles);

  // Keeps Title in step with the roles until somebody writes their own.
  useEffect(() => {
    if (!titleFollowsRoles) return;
    setTitle((current) => (current === derivedTitle ? current : derivedTitle));
  }, [derivedTitle, titleFollowsRoles]);

  const [saved, setSaved] = useState(false);

  // Empty string means "cleared", which the API models as null.
  const orNull = (v: string) => (v.trim() ? v.trim() : null);

  /*
   * The address is all-or-nothing.
   *
   * Untouched, it is left out of the save entirely — that is what lets the
   * accounts made before it was collected edit the rest of their profile
   * without being made to invent one. Touched, it has to be complete: half an
   * address is worse than none, because it looks filled in.
   */
  const address = {
    addressLine1: line1.trim(),
    addressCity: city.trim(),
    addressProvince: province.trim(),
    addressCountry: country.trim().toUpperCase(),
  };
  const addressStarted =
    Object.values(address).some(Boolean) || !!line2.trim() || !!postal.trim();
  const addressMissing = !addressStarted
    ? []
    : ([
        !address.addressLine1 && 'a street address',
        !address.addressCity && 'a city or municipality',
        !address.addressProvince && 'a province or region',
        address.addressCountry.length !== 2 && 'a two-letter country code',
      ].filter(Boolean) as string[]);

  const handleSave = () => {
    updateProfile.mutate(
      {
        displayName: orNull(name),
        title: orNull(title),
        phone: orNull(phone),
        website: orNull(website),
        location: orNull(location),
        bio: orNull(bio),
        studioName: orNull(studioName),
        socialHandle: orNull(socialHandle),
        // Omitted when empty: the API requires at least one, and an empty
        // array would fail the whole save rather than just leaving roles be.
        ...(roles.length > 0 ? { roles } : {}),
        ...(addressStarted
          ? { ...address, addressLine2: orNull(line2), addressPostal: orNull(postal) }
          : {}),
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
  const blocked = roles.length === 0 || addressMissing.length > 0;

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
          {/* Typing takes ownership: it stops tracking the roles from here. */}
          <FieldRow
            icon={BriefcaseIcon}
            label="Title"
            value={title}
            onChange={(v) => {
              setTitleFollowsRoles(false);
              setTitle(v);
            }}
            placeholder={derivedTitle || 'Wedding photographer'}
            color="#C17745"
          />
          {/* Read-only: changing the login address needs a verification flow
              that does not exist yet, so editing it here would be a lie. */}
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Email</Text>
            <View className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <MailIcon size={15} color="#8B5E3C" />
              <Text className="text-muted-foreground text-base flex-1">{user?.email ?? ''}</Text>
            </View>
          </View>
          <FieldRow icon={PhoneIcon} label="Phone" value={phone} onChange={setPhone} color="#6B8E4E" keyboardType="phone-pad" />
          <FieldRow icon={GlobeIcon} label="Website" value={website} onChange={setWebsite} color="#5B7B9A" />
          {/* Both collected at sign-up and both optional there, so they are
              optional here too — plenty of people freelance under the name on
              their passport. */}
          <FieldRow icon={Building2Icon} label="Studio Name" value={studioName} onChange={setStudioName} color="#8B5E3C" />
          <FieldRow icon={AtSignIcon} label="Social" value={socialHandle} onChange={setSocialHandle} color="#5B7B9A" />
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

          {/* Roles */}
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-1 ml-1">
              What you do{' '}
              <Text style={{ color: '#C4776A' }}>· required</Text>
            </Text>
            <Text className="text-muted-foreground text-xs mb-2.5 ml-1 leading-4">
              This is what people search for in Nearby. Somebody looking to hire
              a photographer finds you by this and nothing else, so an account
              with none is invisible to them.
            </Text>
            <RolePicker selected={roles} onChange={setRoles} />
            {roles.length === 0 && (
              <Text style={{ color: '#C4776A' }} className="text-xs font-semibold mt-2 ml-1">
                Choose at least one.
              </Text>
            )}
          </View>

          {/* Everything above this line is how you appear to other people.
              Everything below it is not, and saying so is the point — a
              postal address sitting unmarked among the fields that go on a
              profile reads like a promise to publish it. */}
          <View className="mt-2">
            <View className="h-px bg-border mb-4" />
            <View className="flex-row items-center gap-2 ml-1">
              <LockIcon size={13} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
                Address
              </Text>
              <View className="bg-muted rounded-full px-2 py-0.5">
                <Text className="text-muted-foreground text-[10px] font-bold">Private</Text>
              </View>
            </View>
            <Text className="text-muted-foreground text-xs mt-1.5 ml-1 leading-4">
              Only you can see this. It is never shown on your profile, on a
              job post, or to anyone you work with.
            </Text>
          </View>

          <FieldRow icon={MapPinIcon} label="Street Address" value={line1} onChange={setLine1} color="#C17745" />
          <FieldRow icon={HomeIcon} label="Apartment, Unit, Floor · optional" value={line2} onChange={setLine2} color="#8B5E3C" />
          <FieldRow icon={MapPinIcon} label="City" value={city} onChange={setCity} color="#C17745" />
          <FieldRow icon={MapPinIcon} label="Province" value={province} onChange={setProvince} color="#C17745" />
          {/* Optional on purpose, as at sign-up: plenty of Philippine
              addresses have no ZIP. */}
          <FieldRow icon={HashIcon} label="Postal Code · optional" value={postal} onChange={setPostal} color="#6B8E4E" keyboardType="number-pad" />
          <FieldRow icon={GlobeIcon} label="Country" value={country} onChange={(v) => setCountry(v.toUpperCase())} color="#5B7B9A" maxLength={2} />

          {addressMissing.length > 0 && (
            <Text style={{ color: '#C4776A' }} className="text-xs ml-1 leading-4">
              The address still needs {addressMissing.join(', ')}.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Save FAB */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pt-4 bg-background" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable
          onPress={handleSave}
          // Roles are required and a part-filled address is rejected, so both
          // would fail at the API anyway — better to say so before the round
          // trip than to bounce a save back with a validation error.
          disabled={busy || roles.length === 0 || addressMissing.length > 0}
          className={`rounded-2xl py-3.5 items-center active:scale-[0.97] ${
            blocked ? 'bg-muted' : saved ? 'bg-[#6B8E4E]' : 'bg-primary'
          }`}
        >
          <Text
            className={`text-base font-bold ${
              blocked ? 'text-muted-foreground' : 'text-white'
            }`}
          >
            {roles.length === 0
              ? 'Choose a role to save'
              : addressMissing.length > 0
                ? 'Finish the address to save'
                : saved
                  ? '✓  Saved'
                  : updateProfile.isPending
                    ? 'Saving…'
                    : 'Save Changes'}
          </Text>
        </Pressable>
      </View>
          </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldRow({
  icon: IconComp, label, value, onChange, color, keyboardType, maxLength,
  placeholder,
}: {
  icon: LucideIcon; label: string; value: string;
  onChange: (v: string) => void; color: string; keyboardType?: string;
  maxLength?: number;
  /** Shown when the field is empty. Used by Title to suggest the roles. */
  placeholder?: string;
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
          <IconComp size={13} color={color} />
        </View>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#A89489"
          className="text-foreground text-sm flex-1"
          keyboardType={keyboardType as any}
          maxLength={maxLength}
          autoCapitalize="none"
        />
      </View>
    </View>
  );
}
