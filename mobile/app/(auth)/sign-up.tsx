import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { KEYBOARD_DONE } from '@/components/KeyboardDoneBar';
import { useAuth, useRoles, useTheme } from '@/src/hooks';
import { Redirect, router, useNavigation } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { useState } from 'react';
import { CheckIcon } from 'lucide-react-native';
import { PALETTES } from '@/theme';
import { LoadFailed } from '@/components/LoadFailed';
import { CitySuggestions } from '@/components/LocationField';
import { useHoldUpdates } from '@/src/lib/ota-updates';
import { ChoiceChips, FormField, FormHint, FormInput, FormLabel, FormNotice } from '@/components/Form';
import { AuthButton, AuthFooter, AuthFooterLine, AuthFrame, AuthTitle } from '@/components/auth/AuthFrame';
import { PasswordInput, RoleChip } from '@/components/auth/AuthFields';

/**
 * Signing up, in three steps.
 *
 * It was one screen asking for everything at once, and it was about to get a
 * postal address on top. Splitting it is not decoration: a form's cost is what
 * you see before you start, and three short screens read as less work than one
 * long one even when the fields are identical. On a phone it matters more than
 * on the web — the old form was well past a screen height before the address
 * fields existed.
 *
 * The account is created once, on the last step. The steps are progressive
 * disclosure of a single form, not three saves: abandoning halfway leaves no
 * half-made account behind and nobody wondering whether they have one.
 *
 * Mirrors `web/src/components/sign-up-wizard.tsx` step for step. The phone
 * asks for the password once, with an eye to look at it, and takes roles in
 * somebody's own words; otherwise the same account and the same questions,
 * whichever client somebody starts on.
 */

const STEP_COUNT = 3;

/** Roles in somebody's own words: how many, and how long each may be. */
const CUSTOM_ROLE_LIMIT = 3;
const CUSTOM_ROLE_MIN = 2;
const CUSTOM_ROLE_MAX = 40;

export default function SignUpScreen() {
  // A code fetched from email, or a form half filled: see useHoldUpdates.
  useHoldUpdates();
  const { signUp, user } = useAuth();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  const [step, setStep] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  /*
   * Back, the button or the swipe, steps back through the wizard. It left
   * sign-up altogether from any step, and everything typed went with it.
   * Only going back is held: finishing replaces the screen, and that goes
   * through as asked.
   */
  const navigation = useNavigation();
  usePreventRemove(step > 0, ({ data }) => {
    if (data.action.type !== 'GO_BACK' && data.action.type !== 'POP') {
      navigation.dispatch(data.action);
      return;
    }
    setErrorMsg('');
    setStep((s) => Math.max(0, s - 1));
  });

  // Step 1
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');

  // Step 2
  const [roles, setRoles] = useState<string[]>([]);
  // Typed in, for what the list lacks. Kept apart from `roles`: those are the
  // server's own words and are checked against its list; these are not.
  const [customRoles, setCustomRoles] = useState<string[]>([]);
  const [customDraft, setCustomDraft] = useState('');
  const [customError, setCustomError] = useState('');

  // Step 3
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [cityFocused, setCityFocused] = useState(false);
  const [province, setProvince] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('PH');
  const [studioName, setStudioName] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  /**
   * The roles come from the server, not a copy in this file — the same list
   * the register endpoint validates against, so the form cannot offer
   * something that will be rejected.
   */
  const rolesQuery = useRoles();
  const roleList = rolesQuery.data;
  // Failed or paused (offline): either way there are no chips to pick, and
  // this step used to be a blank that could not be finished or retried.
  const rolesFailed = !roleList && rolesQuery.loadFailed;

  // <Redirect> rather than router.replace(): navigating during render mutates
  // the navigation container mid-render and triggers React's
  // "Cannot update a component while rendering a different component" error.
  if (process.env.EXPO_PUBLIC_RAPIDNATIVE_MODE !== 'designer' && user) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  const chosenCount = roles.length + customRoles.length;

  /**
   * What each step is still missing, named rather than implied.
   *
   * A greyed-out button with no explanation is the worst version of a required
   * field — you are told no and not told why. One list per step, so the button
   * can be disabled *and* the reason given.
   */
  const missing: string[][] = [
    [
      !name.trim() && 'your name',
      !email.trim() && 'an email address',
      password.length < 8 && 'a password of at least 8 characters',
    ].filter(Boolean) as string[],
    // One of either kind: somebody whose work is not on the list has still
    // said what they do.
    [chosenCount === 0 && 'at least one role'].filter(Boolean) as string[],
    [
      !line1.trim() && 'a street address',
      !city.trim() && 'a city or municipality',
      !province.trim() && 'a province or region',
      country.trim().length !== 2 && 'a two-letter country code',
      !acceptedTerms && 'the Terms and Privacy Policy',
    ].filter(Boolean) as string[],
  ];

  const stepReady = missing[step].length === 0;
  const isLast = step === STEP_COUNT - 1;

  const toggleRole = (role: string) =>
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );

  const addCustomRole = () => {
    const typed = customDraft.trim().replace(/\s+/g, ' ');
    setCustomError('');
    if (!typed) return;
    const same = (other: string) => other.toLowerCase() === typed.toLowerCase();
    // Typing a role the list already has is choosing it: one "Photographer",
    // spelled the list's way, rather than two.
    const listed = rolesQuery.roles.find(same);
    if (listed) {
      setRoles((prev) => (prev.includes(listed) ? prev : [...prev, listed]));
      setCustomDraft('');
      return;
    }
    if (customRoles.some(same)) {
      setCustomDraft('');
      return;
    }
    if (typed.length < CUSTOM_ROLE_MIN || typed.length > CUSTOM_ROLE_MAX) {
      setCustomError(`Use ${CUSTOM_ROLE_MIN} to ${CUSTOM_ROLE_MAX} characters.`);
      return;
    }
    if (customRoles.length >= CUSTOM_ROLE_LIMIT) {
      setCustomError('Three is the most. Remove one to add another.');
      return;
    }
    setCustomRoles((prev) => [...prev, typed]);
    setCustomDraft('');
  };

  const goBack = () => {
    setErrorMsg('');
    if (step === 0) router.back();
    else setStep((s) => s - 1);
  };

  const advance = () => {
    // The button and a keyboard's Go both land here.
    if (!stepReady || signUp.isPending) return;
    setErrorMsg('');
    if (!isLast) { setStep((s) => s + 1); return; }
    signUp.mutate(
      {
        email: email.trim(),
        password,
        displayName: name.trim(),
        roles,
        customRoles,
        addressLine1: line1.trim(),
        addressCity: city.trim(),
        addressProvince: province.trim(),
        addressPostal: postal.trim() || undefined,
        addressCountry: country.trim().toUpperCase(),
        studioName: studioName.trim() || undefined,
        socialHandle: socialHandle.trim() || undefined,
        referralCode: referralCode.trim() || undefined,
      },
      {
        // With the address: there is no session after signing up, so the
        // next screen has nothing to name unless it is passed one.
        onSuccess: () =>
          router.push(`/check-inbox?email=${encodeURIComponent(email.trim())}`),
        onError: (err: any) => {
          const message = err?.reason || err?.message || 'Sign up failed. Please try again.';
          setErrorMsg(message);
          // A taken email or a rejected password belongs to step one, and
          // leaving somebody on the address step with an error about their
          // email is how a form becomes a maze.
          if (/email|password/i.test(message)) setStep(0);
        },
      },
    );
  };

  // Where the server's answer is shown. One about the email or the password
  // sits under that field, on the step it sent everybody back to; anything
  // else is about no field in particular and goes above the button.
  const emailError = step === 0 && /email/i.test(errorMsg) ? errorMsg : '';
  const passwordError = step === 0 && !emailError && /password/i.test(errorMsg) ? errorMsg : '';
  const generalError = emailError || passwordError ? '' : errorMsg;

  return (
    <AuthFrame
      onBack={goBack}
      progress={{ step: step + 1, of: STEP_COUNT }}
      footer={
        // Says what is still missing rather than leaving a dead button to be
        // puzzled over.
        <AuthFooter note={!stepReady ? `Still needed: ${missing[step].join(', ')}.` : null}>
          {generalError ? <FormNotice title="That did not go through" body={generalError} /> : null}
          <AuthButton
            label={signUp.isPending ? 'Creating account…' : isLast ? 'Create account' : 'Next'}
            onPress={advance}
            disabled={!stepReady}
            busy={signUp.isPending}
          />
          {step === 0 ? (
            <AuthFooterLine lead="Have an account?" action="Sign in" onPress={() => router.push('/sign-in')} />
          ) : null}
        </AuthFooter>
      }
    >
      {step === 0 && (
        <>
          <AuthTitle title="Create your account">It takes about a minute.</AuthTitle>

          <FormField label="Your name">
            <FormInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              autoCapitalize="words"
              textContentType="name"
              autoComplete="name"
            />
          </FormField>

          <FormField label="Email" hint={emailError || undefined} wrong={!!emailError}>
            <FormInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@studio.com"
              wrong={!!emailError}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              autoComplete="email"
            />
          </FormField>

          {/* Asked for once. There was a second box to retype it in, because
              a typo in the only one locked people out of an account they had
              just made; the eye lets them read what they typed instead. */}
          <FormField
            label="Password"
            hint={passwordError || 'At least 8 characters. Longer is stronger.'}
            wrong={!!passwordError}
          >
            <PasswordInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 8 characters"
              wrong={!!passwordError}
              textContentType="newPassword"
              autoComplete="new-password"
              passwordRules="minlength: 8;"
            />
          </FormField>

          {/* On the first step rather than with the other optional fields
              two screens later: somebody who was sent a code is holding it
              now, and a field they have to go looking for is a referral
              that never pays. */}
          <FormField label="Invite code" optional>
            <FormInput
              value={referralCode}
              onChangeText={(v) => setReferralCode(v.toUpperCase())}
              placeholder="From whoever invited you"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={32}
            />
          </FormField>
        </>
      )}

      {/* Roles. Chips rather than a picker: several apply at once — a
          photographer who also cuts the SDE holds both — and a one-of
          control would force people to misrepresent themselves. */}
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

          {rolesQuery.roles.length > 0 || customRoles.length > 0 ? (
            <ChoiceChips>
              {rolesQuery.roles.map((role) => (
                <RoleChip key={role} label={role} selected={roles.includes(role)} onPress={() => toggleRole(role)} />
              ))}
              {customRoles.map((role) => (
                <RoleChip
                  key={`own:${role}`}
                  label={role}
                  selected
                  removable
                  onPress={() => {
                    setCustomError('');
                    setCustomRoles((prev) => prev.filter((r) => r !== role));
                  }}
                />
              ))}
            </ChoiceChips>
          ) : null}

          {/* Free text beside the list, not instead of it: the list is what
              the job board matches on, and this is for the work it has no
              word for yet. */}
          <View className="gap-2">
            <FormLabel optional>Something else</FormLabel>
            <View className="flex-row gap-2">
              <View className="flex-1">
                <FormInput
                  value={customDraft}
                  onChangeText={(v) => {
                    setCustomDraft(v);
                    setCustomError('');
                  }}
                  placeholder="Photo booth operator"
                  wrong={!!customError}
                  maxLength={CUSTOM_ROLE_MAX}
                  autoCapitalize="sentences"
                  returnKeyType="done"
                  onSubmitEditing={addCustomRole}
                  submitBehavior="submit"
                  accessibilityLabel="Something else you do"
                />
              </View>
              <Pressable
                onPress={addCustomRole}
                disabled={!customDraft.trim()}
                accessibilityRole="button"
                accessibilityLabel="Add this role"
                accessibilityState={{ disabled: !customDraft.trim() }}
                className="h-[52px] px-[18px] rounded-[14px] bg-secondary items-center justify-center active:opacity-80"
              >
                <Text
                  className={`text-[15px] font-semibold ${customDraft.trim() ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                  Add
                </Text>
              </Pressable>
            </View>
            <FormHint wrong={!!customError}>
              {customError || 'In your own words, if what you do is not on the list. Up to three.'}
            </FormHint>
          </View>

          {chosenCount > 0 ? (
            <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold">
              {chosenCount} chosen. You can change these later in Settings.
            </Text>
          ) : null}
        </>
      )}

      {step === 2 && (
        <>
          <AuthTitle title="Where do you work?">
            Your town puts nearby jobs and people first. Your street is never shown.
          </AuthTitle>

          {/* Full width, with the suggestions under it: the city is
              what places somebody in Nearby, so the spelling the app
              knows is worth offering. Still free text — a town the list
              lacks is placed by its province. */}
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
            {/* Optional on purpose. Plenty of Philippine addresses have
                no ZIP, and refusing somebody for that is refusing them
                for where they live. Said in the field: the label has no
                room for the word at this width. */}
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

          <FormField label="Studio name" optional hint="If you trade under one.">
            <FormInput value={studioName} onChangeText={setStudioName} placeholder="Northlight Studio" maxLength={120} />
          </FormField>

          <FormField label="Social" optional hint="An @handle, a page, or a link.">
            <FormInput
              value={socialHandle}
              onChangeText={setSocialHandle}
              placeholder="@yourstudio"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={200}
            />
          </FormField>

          {/* Terms. Required, and the links open the same document the
              app shows in Settings. */}
          <Pressable
            onPress={() => setAcceptedTerms((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acceptedTerms }}
            className="flex-row items-start gap-3 rounded-2xl border border-border/40 bg-card px-4 py-3.5 active:opacity-80"
          >
            <View
              className={`w-[22px] h-[22px] items-center justify-center rounded-[7px] mt-px ${
                acceptedTerms ? 'bg-action' : 'border-[1.5px] border-border'
              }`}
            >
              {acceptedTerms ? <CheckIcon size={14} strokeWidth={3} color={palette.actionForeground} /> : null}
            </View>
            <Text className="flex-1 text-secondary-foreground text-[15px] leading-[22px]">
              I agree to the{' '}
              <Text className="text-primary font-semibold" onPress={() => router.push('/legal')}>
                Terms
              </Text>{' '}
              and the{' '}
              <Text className="text-primary font-semibold" onPress={() => router.push('/legal?tab=privacy')}>
                Privacy Policy
              </Text>
              .
            </Text>
          </Pressable>
        </>
      )}
    </AuthFrame>
  );
}
