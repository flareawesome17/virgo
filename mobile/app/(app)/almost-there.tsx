import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useAuth, useRoles, useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';
import { KEYBOARD_DONE } from '@/components/KeyboardDoneBar';
import { LoadFailed } from '@/components/LoadFailed';
import { CitySuggestions } from '@/components/LocationField';
import { ChoiceChips, FormField, FormInput, FormNotice } from '@/components/Form';
import { AuthButton, AuthFooter, AuthFooterLine, AuthFrame, AuthTitle } from '@/components/auth/AuthFrame';
import { RoleChip } from '@/components/auth/AuthFields';
import { CustomRolesField } from '@/components/auth/CustomRolesField';
import { setAppleFinishing } from '@/src/lib/apple-sign-in';

const STEP_COUNT = 3;

/**
 * What a new account made with Apple is still asked.
 *
 * Apple confirms who somebody is and passes on a name and an address,
 * sometimes a relay one. It knows nothing about what they do on a shoot or
 * where they work, and those are what the job board and Nearby run on, so
 * they are asked here exactly as sign-up asks them: the name to check, then
 * roles, then where.
 *
 * Saved once, at the end. Leaving halfway leaves an account with no roles,
 * which the roles prompt every such account gets will pick up next launch.
 */
export default function AlmostThere() {
  const { profile, updateProfile, signOut } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const navigation = useNavigation();
  const [step, setStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const [name, setName] = useState('');
  const [named, setNamed] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [cityFocused, setCityFocused] = useState(false);
  const [province, setProvince] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('PH');

  // The name Apple passed on, once it has arrived, and never over typing.
  useEffect(() => {
    if (named || !profile) return;
    setName(profile.displayName ?? '');
    setNamed(true);
  }, [profile, named]);

  const rolesQuery = useRoles();
  const roleList = rolesQuery.data;
  const rolesFailed = !roleList && rolesQuery.loadFailed;

  // Back, by the arrow, a swipe or Android's button, is the step before. On
  // the first step there is nowhere back to but signed out, and that has its
  // own line under the button.
  usePreventRemove(true, ({ data }) => {
    if (data.action.type !== 'GO_BACK' && data.action.type !== 'POP') {
      navigation.dispatch(data.action);
      return;
    }
    setErrorMsg('');
    setStep((s) => Math.max(0, s - 1));
  });

  const missing: string[][] = [
    [!name.trim() && 'your name'].filter(Boolean) as string[],
    [roles.length + customRoles.length === 0 && 'at least one role'].filter(Boolean) as string[],
    [
      !line1.trim() && 'a street address',
      !city.trim() && 'a city or municipality',
      !province.trim() && 'a province or region',
      country.trim().length !== 2 && 'a two-letter country code',
    ].filter(Boolean) as string[],
  ];
  const stepReady = missing[step].length === 0;
  const isLast = step === STEP_COUNT - 1;

  const advance = () => {
    if (!stepReady || updateProfile.isPending) return;
    setErrorMsg('');
    if (!isLast) {
      setStep((s) => s + 1);
      return;
    }
    updateProfile.mutate(
      {
        displayName: name.trim(),
        roles,
        customRoles,
        addressLine1: line1.trim(),
        addressCity: city.trim(),
        addressProvince: province.trim(),
        addressCountry: country.trim().toUpperCase(),
        ...(postal.trim() ? { addressPostal: postal.trim() } : {}),
      },
      {
        onSuccess: () => {
          // First, so the layout stops sending everything back here.
          setAppleFinishing(false);
          router.replace('/(app)/(tabs)');
        },
        onError: (err: any) =>
          setErrorMsg(err?.reason || err?.message || 'That did not save. Try again.'),
      },
    );
  };

  const email = profile?.email ?? '';
  const relay = /@privaterelay\.appleid\.com$/i.test(email);

  return (
    <AuthFrame
      onBack={step > 0 ? () => setStep((s) => s - 1) : undefined}
      progress={{ step: step + 1, of: STEP_COUNT }}
      footer={
        <AuthFooter note={!stepReady ? `Still needed: ${missing[step].join(', ')}.` : null}>
          {errorMsg ? <FormNotice title="That did not save" body={errorMsg} /> : null}
          <AuthButton
            label={updateProfile.isPending ? 'Saving…' : isLast ? 'Finish' : 'Next'}
            onPress={advance}
            disabled={!stepReady}
            busy={updateProfile.isPending}
          />
          {step === 0 ? (
            <AuthFooterLine
              lead="Not you?"
              action={signOut.isPending ? 'Signing out…' : 'Use another account'}
              onPress={() => signOut.mutate()}
            />
          ) : null}
        </AuthFooter>
      }
    >
      {step === 0 && (
        <>
          <AuthTitle title="Almost there">
            Apple has confirmed it is you. Check what it passed on, then two short steps.
          </AuthTitle>

          <FormField label="Your name" hint="As clients and other photographers will see it.">
            <FormInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
              maxLength={120}
            />
          </FormField>

          <View className="rounded-[20px] border border-border/40 bg-card overflow-hidden">
            <View className="min-h-[60px] justify-center px-4 py-2">
              <Text className="text-foreground text-[15px] leading-5 font-semibold">Signed in with Apple</Text>
              <Text className="text-muted-foreground text-[13px] leading-[18px]">
                No password to remember. Face ID or your passcode signs you in.
              </Text>
            </View>
            <View className="min-h-[60px] justify-center px-4 py-2 border-t border-border/40">
              <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
                {relay ? 'Email hidden by Apple' : email}
              </Text>
              <Text className="text-muted-foreground text-[13px] leading-[18px]">
                {relay
                  ? 'Mail from Virgo reaches you through Apple’s relay address.'
                  : 'Mail from Virgo goes to this address.'}
              </Text>
            </View>
          </View>
        </>
      )}

      {step === 1 && (
        <>
          <AuthTitle title="What do you do?">
            Pick every role you take work for. The job board shows you shoots that need them.
          </AuthTitle>

          {rolesFailed ? (
            <LoadFailed what="the list of roles" onRetry={() => rolesQuery.refetch()} compact />
          ) : !roleList ? (
            <ActivityIndicator color={palette.action} style={{ paddingVertical: 24 }} />
          ) : null}

          {rolesQuery.roles.length > 0 ? (
            <ChoiceChips>
              {rolesQuery.roles.map((role) => (
                <RoleChip
                  key={role}
                  label={role}
                  selected={roles.includes(role)}
                  onPress={() =>
                    setRoles((prev) =>
                      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
                    )
                  }
                />
              ))}
            </ChoiceChips>
          ) : null}

          <CustomRolesField value={customRoles} onChange={setCustomRoles} listed={roles} onListed={setRoles} />
        </>
      )}

      {step === 2 && (
        <>
          <AuthTitle title="Where do you work?">
            Your town puts nearby jobs and people first. Your street is never shown.
          </AuthTitle>

          <FormField label="City or town">
            <View>
              <FormInput
                value={city}
                onChangeText={setCity}
                placeholder="Cebu City"
                maxLength={120}
                onFocus={() => setCityFocused(true)}
                // A beat late, so a tap on a suggestion lands first.
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
            </View>
          </FormField>

          <View className="flex-row gap-3">
            <View style={{ flex: 1.4 }}>
              <FormField label="Province">
                <FormInput value={province} onChangeText={setProvince} placeholder="Cebu" maxLength={120} />
              </FormField>
            </View>
            <View className="flex-1">
              <FormField label="Postal code">
                <FormInput
                  value={postal}
                  onChangeText={setPostal}
                  placeholder="Optional"
                  keyboardType="number-pad"
                  inputAccessoryViewID={KEYBOARD_DONE}
                  maxLength={20}
                />
              </FormField>
            </View>
          </View>

          <FormField
            label="Street"
            hint="Private. Only your city and province show on your profile, and you can hide from Nearby in Privacy."
          >
            <FormInput
              value={line1}
              onChangeText={setLine1}
              placeholder="123 Rizal Street, Barangay San Roque"
              maxLength={200}
            />
          </FormField>

          <FormField label="Country" hint="Two letters. PH is the Philippines.">
            <FormInput
              value={country}
              onChangeText={(v) => setCountry(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={2}
            />
          </FormField>
        </>
      )}
    </AuthFrame>
  );
}
