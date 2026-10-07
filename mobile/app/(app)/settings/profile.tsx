import {
  View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform,
  Switch, useWindowDimensions,
} from 'react-native';
import { KEYBOARD_DONE } from '@/components/KeyboardDoneBar';
import { RemoteImage } from '@/components/RemoteImage';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useDiscardGuard } from '@/src/lib/discard-guard';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useTheme, useUpdateProfileFlags } from '@/src/hooks';
import { COVER_ASPECT, queryKeys, titleFromRoles, type AuthUser } from '@/src/api';
import { RolePicker } from '@/components';
import { CitySuggestions } from '@/components/LocationField';
import { useAvatarEditor, useCoverEditor } from '@/components/ProfilePhotoEditors';
import { profileActionMessage } from '@/src/lib/profile-media';
import { CHART_COLORS, PALETTES, type Palette } from '@/theme';
import {
  ArrowLeftIcon, CameraIcon, UserIcon, MailIcon, BriefcaseIcon, PhoneIcon,
  GlobeIcon, MapPinIcon, ChevronRightIcon, CheckIcon, LockIcon, HashIcon,
  Building2Icon, AtSignIcon,
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

export default function ProfileSettingsScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const queryClient = useQueryClient();
  const { user, profile, updateProfile } = useAuth();
  // The photo and the cover each upload and save on their own, so neither
  // puts the form's Save into "Saving…" nor the other into "Uploading…".
  const avatar = useAvatarEditor();
  const cover = useCoverEditor();
  // One per switch: two quick toggles on a shared mutation would only report
  // the second's outcome, and a failed first would never be put back.
  const availabilityFlag = useUpdateProfileFlags();
  const studioFlag = useUpdateProfileFlags();

  // Seeded from the real profile once it loads. Every field was previously
  // hardcoded and Save only raised an alert — nothing persisted.
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [bio, setBio] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [studioName, setStudioName] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [line1, setLine1] = useState('');
  /*
   * A second address line the account already had, kept apart only when it
   * would not fit on the first. Nothing asks for one any more: anything
   * saved there is folded into the street address, so it stays visible and
   * editable instead of sitting in the row where nobody can see it.
   */
  const [keptLine2, setKeptLine2] = useState(false);
  const [city, setCity] = useState('');
  const [cityFocused, setCityFocused] = useState(false);
  const [province, setProvince] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('');
  const [availableForBookings, setAvailableForBookings] = useState(false);
  const [showStudio, setShowStudio] = useState(false);
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
    // The API's limit on the street line. Past it the two stay apart.
    const folded = [profile.addressLine1, profile.addressLine2]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(', ');
    const fits = folded.length <= 200;
    setLine1(fits ? folded : profile.addressLine1 ?? '');
    setKeptLine2(!fits);
    setCity(profile.addressCity ?? '');
    setProvince(profile.addressProvince ?? '');
    setPostal(profile.addressPostal ?? '');
    setCountry(profile.addressCountry ?? '');
    // Off unless the API says otherwise: an older one sends neither key.
    setAvailableForBookings(profile.availableForBookings ?? false);
    setShowStudio(profile.showStudio ?? false);
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
  // The switches save as they move, so they are not changes to lose. A title
  // still following the roles is the roles' doing, not typing.
  const { markSaved } = useDiscardGuard(
    {
      name,
      title: titleFollowsRoles ? null : title,
      phone,
      website,
      bio,
      roles,
      studioName,
      socialHandle,
      line1,
      city,
      province,
      postal,
      country,
    },
    hydrated,
  );

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
  // An address already on the account counts as started even when every
  // field has been emptied: it cannot be removed (the API keeps one, as
  // signup asks for it), and emptying it was left out of the save while the
  // screen said Saved. Now it says what is missing instead.
  const hadAddress = Boolean(profile?.addressLine1);
  const addressStarted =
    hadAddress || Object.values(address).some(Boolean) || !!postal.trim();
  const addressMissing = !addressStarted
    ? []
    : ([
        // The server's own minimums, so Save is refused here with the reason
        // rather than by the API with nothing better than "try again".
        address.addressLine1.length < 4 && 'a street address',
        address.addressCity.length < 2 && 'a city or municipality',
        address.addressProvince.length < 2 && 'a province or region',
        address.addressCountry.length !== 2 && 'a two-letter country code',
      ].filter(Boolean) as string[]);

  const handleSave = () => {
    updateProfile.mutate(
      {
        displayName: orNull(name),
        title: orNull(title),
        phone: orNull(phone),
        website: orNull(website),
        // No location: the API sets it from the address — "Cebu City, Cebu".
        bio: orNull(bio),
        studioName: orNull(studioName),
        socialHandle: orNull(socialHandle),
        // Omitted when empty: the API requires at least one, and an empty
        // array would fail the whole save rather than just leaving roles be.
        ...(roles.length > 0 ? { roles } : {}),
        ...(addressStarted
          ? {
              ...address,
              addressPostal: orNull(postal),
              // Folded into the street above, so emptied here.
              ...(keptLine2 ? {} : { addressLine2: null }),
            }
          : {}),
      },
      {
        onSuccess: () => {
          markSaved();
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
        onError: (err) => Alert.alert('Could not save', profileActionMessage(err, 'setting')),
      },
    );
  };

  /**
   * A switch saves the moment it moves, in a request of its own.
   *
   * Shown moved straight away and put back if the save fails — to what the
   * session holds, not simply to the opposite, so a failure after an earlier
   * toggle that did save lands on the value the server actually has.
   */
  const saveFlag = (key: 'availableForBookings' | 'showStudio', next: boolean) => {
    const set = key === 'availableForBookings' ? setAvailableForBookings : setShowStudio;
    const mutation = key === 'availableForBookings' ? availabilityFlag : studioFlag;
    set(next);
    mutation.mutate(key === 'availableForBookings' ? { availableForBookings: next } : { showStudio: next }, {
      onError: (err) => {
        const saved = queryClient.getQueryData<AuthUser | null>(queryKeys.auth.session);
        set(saved?.[key] ?? false);
        Alert.alert("Couldn't save that setting", profileActionMessage(err, 'setting'));
      },
    });
  };

  /*
   * Where the saved address put them in Nearby, said under the city — but
   * only while the city and province on screen are the saved ones, or it
   * would describe an address that is not there any more. Nothing from an
   * API too old to say.
   */
  const addressSaved =
    !!profile?.addressCity &&
    city.trim() === profile.addressCity.trim() &&
    province.trim() === (profile.addressProvince ?? '').trim();
  const nearbyHint: { text: string; warn: boolean } | null = !addressSaved
    ? null
    : profile?.addressPlace
      ? { text: `Shown in Nearby as ${profile.addressPlace}.`, warn: false }
      : profile?.addressPlace === null
        ? { text: "We couldn't place this city — check the spelling.", warn: true }
        : null;

  const savedStudio = profile?.studioName?.trim() || null;
  const busy = updateProfile.isPending || avatar.busy;
  const blocked = roles.length === 0 || addressMissing.length > 0;
  const coverUrl = profile?.coverUrl ?? null;
  const coverWidth = width - 40;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Lifts the form above the keyboard. Without this the fields nearest
          the bottom sat underneath it on iOS with no way to scroll to them. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >

      <ScrollView keyboardDismissMode="on-drag"
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable accessibilityRole="button" accessibilityLabel="Back"
            onPress={() => router.back()}
            className="w-11 h-11 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[22px] font-bold tracking-tight">Edit profile</Text>
        </View>

        {/* Cover. Chosen and framed on the phone — the crop is baked in
            before upload, so what shows here is exactly what visitors get. */}
        <View className="px-5 mt-4">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            Cover photo
          </Text>
          <View
            className="rounded-2xl overflow-hidden bg-primary/10"
            style={{ width: coverWidth, height: coverWidth / COVER_ASPECT }}
          >
            {coverUrl ? (
              <RemoteImage
                source={{ uri: coverUrl }}
                style={{ width: coverWidth, height: coverWidth / COVER_ASPECT }}
                contentFit="cover"
              />
            ) : (
              <View className="flex-1 items-center justify-center px-6">
                <Text className="text-muted-foreground text-xs text-center">
                  No cover yet. Your work shows here instead.
                </Text>
              </View>
            )}
          </View>
          <View className="flex-row items-center gap-4 mt-2.5">
            <Pressable
              onPress={() => void cover.choose()}
              disabled={cover.busy}
              accessibilityRole="button"
              accessibilityState={{ busy: cover.busy, disabled: cover.busy }}
              className="bg-muted rounded-xl px-4 py-2.5 flex-row items-center gap-2 active:opacity-80"
              style={{ opacity: cover.busy ? 0.6 : 1 }}
            >
              <CameraIcon size={14} className="text-foreground" />
              <Text className="text-foreground text-[13px] font-semibold">
                {cover.busy ? 'Uploading…' : coverUrl ? 'Change cover' : 'Add cover'}
              </Text>
            </Pressable>
            {coverUrl && (
              <Pressable
                onPress={cover.confirmRemove}
                disabled={cover.busy}
                accessibilityRole="button"
                accessibilityLabel="Remove cover"
                hitSlop={13}
                style={{ opacity: cover.busy ? 0.6 : 1 }}
              >
                <Text className="text-destructive text-[13px] font-semibold">Remove</Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Avatar */}
        <View className="items-center mt-6 mb-6">
          <View className="relative">
            {profile?.avatarUrl ? (
              <RemoteImage
                source={{ uri: profile.avatarUrl }}
                style={{ width: 88, height: 88, borderRadius: 44 }}
              />
            ) : (
              <View
                style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: `${palette.primary}18`, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: palette.primary, fontSize: 32, fontWeight: '700' }}>
                  {(profile?.displayName || user?.email || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Pressable hitSlop={8}
              onPress={() => void avatar.choose()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-action items-center justify-center active:scale-[0.90]"
              style={{ shadowColor: palette.primary, shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 }}
            >
              <CameraIcon size={14} className="text-action-foreground" />
            </Pressable>
          </View>
          <Text className="text-muted-foreground text-xs mt-3">
            {avatar.busy ? 'Uploading…' : 'Tap to change photo'}
          </Text>
        </View>

        {/* Form fields */}
        <View className="px-5 gap-4">
          <FieldRow icon={UserIcon} label="Name" value={name} onChange={setName} color="#B66A40" maxLength={120} />
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
            maxLength={160}
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
          <FieldRow icon={PhoneIcon} label="Phone" value={phone} onChange={setPhone} color="#6B8E4E" keyboardType="phone-pad" maxLength={40} />
          <FieldRow icon={GlobeIcon} label="Website" value={website} onChange={setWebsite} color="#5B7B9A" maxLength={255} autoCapitalize="none" keyboardType="url" />
          {/* Both collected at sign-up and both optional there, so they are
              optional here too — plenty of people freelance under the name on
              their passport. */}
          <View>
            <FieldRow icon={Building2Icon} label="Studio name" value={studioName} onChange={setStudioName} color={CHART_COLORS.brown} maxLength={120} />
            <Text className="text-muted-foreground text-xs ml-1 mt-1.5">
              Private unless Show studio on profile is on.
            </Text>
          </View>
          <FieldRow icon={AtSignIcon} label="Social" value={socialHandle} onChange={setSocialHandle} color="#5B7B9A" maxLength={200} autoCapitalize="none" />

          {/* Bio */}
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              maxLength={1000}
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

          {/* Each switch saves on its own the moment it moves, never with the
              form: an older API refuses a key it does not know with a 400,
              and inside Save that would lose every other field with it. */}
          <View className="gap-2.5">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] ml-1">
              On your profile
            </Text>
            <FlagCard
              title="Available for bookings"
              detail="Shows a badge on your profile. People can send enquiries either way."
              value={availableForBookings}
              onChange={(next) => saveFlag('availableForBookings', next)}
              palette={palette}
            />
            {/* Off can always be reached, even with the name cleared: a
                switch stuck on would publish whatever name is typed next. */}
            <FlagCard
              title="Show studio on profile"
              detail={
                savedStudio
                  ? `Shows "${savedStudio}" on your public profile.`
                  : showStudio
                    ? 'Add a studio name above to show it.'
                    : 'Add a studio name above and save, then turn this on.'
              }
              value={showStudio}
              disabled={!savedStudio && !showStudio}
              onChange={(next) => saveFlag('showStudio', next)}
              palette={palette}
            />
          </View>

          {/* Everything above this line is how you appear to other people.
              Below it is the address, and saying exactly what leaves it is
              the point: the street never does, the city and province do —
              as the location on your profile, and as your place in Nearby. */}
          <View className="mt-2">
            <View className="h-px bg-border mb-4" />
            <View className="flex-row items-center gap-2 ml-1">
              <LockIcon size={13} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
                Address
              </Text>
              <View className="bg-muted rounded-full px-2 py-0.5">
                <Text className="text-muted-foreground text-[10px] font-bold">Street kept private</Text>
              </View>
            </View>
            <Text className="text-muted-foreground text-xs mt-1.5 ml-1 leading-4">
              Your street is never shown to anyone. Your city and province
              show as your location, and place you in Nearby — you can hide
              from Nearby in Privacy.
            </Text>
          </View>

          <FieldRow icon={MapPinIcon} label="Street address" value={line1} onChange={setLine1} color="#C17745" maxLength={200} />
          {/* Suggestions so the city is spelt the way Nearby knows it, but
              still free text: a municipality the list lacks is placed by
              its province instead. */}
          <View>
            <FieldRow
              icon={MapPinIcon}
              label="City or municipality"
              value={city}
              onChange={setCity}
              color="#C17745"
              maxLength={120}
              onFocus={() => setCityFocused(true)}
              onBlur={() => setTimeout(() => setCityFocused(false), 200)}
            />
            <CitySuggestions
              query={city}
              visible={cityFocused}
              onPick={(picked) => {
                setCity(picked);
                setCityFocused(false);
              }}
            />
            {nearbyHint && (
              <Text
                className="text-xs ml-1 mt-1.5 leading-4"
                style={{ color: nearbyHint.warn ? '#C4776A' : palette.mutedForeground }}
              >
                {nearbyHint.text}
              </Text>
            )}
          </View>
          <FieldRow icon={MapPinIcon} label="Province" value={province} onChange={setProvince} color="#C17745" maxLength={120} />
          {/* Optional on purpose, as at sign-up: plenty of Philippine
              addresses have no ZIP. */}
          <FieldRow icon={HashIcon} label="Postal Code · optional" value={postal} onChange={setPostal} color="#6B8E4E" keyboardType="number-pad" maxLength={20} />
          <FieldRow icon={GlobeIcon} label="Country" value={country} onChange={(v) => setCountry(v.toUpperCase())} color="#5B7B9A" maxLength={2} autoCapitalize="characters" />

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
            blocked ? 'bg-muted' : saved ? 'bg-[#6B8E4E]' : 'bg-action'
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
                    : 'Save changes'}
          </Text>
        </Pressable>
      </View>
          </KeyboardAvoidingView>
      {cover.dialog}
    </SafeAreaView>
  );
}

/** One profile switch: what it is, what it does, and the switch. */
function FlagCard({
  title, detail, value, onChange, disabled = false, palette,
}: {
  title: string;
  detail: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  palette: Palette;
}) {
  return (
    <View
      className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3"
      style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
    >
      <View className="flex-1">
        <Text className="text-foreground text-sm font-semibold">{title}</Text>
        <Text className="text-muted-foreground text-xs leading-4 mt-0.5">{detail}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        trackColor={{ true: palette.primary, false: palette.muted }}
        ios_backgroundColor={palette.muted}
      />
    </View>
  );
}

function FieldRow({
  icon: IconComp, label, value, onChange, color, keyboardType, maxLength,
  placeholder,
  autoCapitalize = 'words',
  onFocus,
  onBlur,
}: {
  icon: LucideIcon; label: string; value: string;
  onChange: (v: string) => void; color: string; keyboardType?: string;
  maxLength?: number;
  /**
   * Words by default: every field here was "none", so a name, a city or a
   * studio came out lower case unless typed otherwise. Links and handles pass
   * "none"; the country code passes "characters".
   */
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  /** Shown when the field is empty. Used by Title to suggest the roles. */
  placeholder?: string;
  /** For a field with suggestions under it, which open while it has focus. */
  onFocus?: () => void;
  onBlur?: () => void;
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
          // The phone and number pads have no return key on iOS.
          inputAccessoryViewID={keyboardType === 'number-pad' || keyboardType === 'phone-pad' ? KEYBOARD_DONE : undefined}
          maxLength={maxLength}
          autoCapitalize={autoCapitalize}
          onFocus={onFocus}
          onBlur={onBlur}
        />
      </View>
    </View>
  );
}
