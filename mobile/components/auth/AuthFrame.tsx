import type { ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeftIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { InsetFrame } from '@/components/InsetFrame';
import { PALETTES } from '@/theme';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * The frame every signed-out screen sits in.
 *
 * Welcome, sign in, the code, the three steps of joining, the inbox and the
 * two password screens each drew their own: a back arrow in a tile here and in
 * a shadowed card there, a title beside the arrow or under an icon, fields on
 * grey or on a shadow, a button with an arrow on it. This is the one frame.
 *
 *   AuthFrame        a bar with the back arrow, the page, and the footer
 *   AuthTitle        the title and the sentence under it
 *   AuthFooter       what sits above the keyboard: buttons, then a line
 *   AuthButton       one full-width button, filled or quiet
 *   AuthFooterLine   "New to Virgo? Create an account"
 *
 * No icons but the ones that do something: the owner asked for that. The back
 * arrow goes back; nothing sits above a title or inside a field to decorate it.
 */
export function AuthFrame({
  onBack,
  backLabel = 'Go back',
  progress,
  footer,
  children,
}: {
  /** Without it there is no bar at all: the welcome screen. */
  onBack?: () => void;
  backLabel?: string;
  /** Joining: "Step 2 of 3" on the bar's right and a line of segments under it. */
  progress?: { step: number; of: number };
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <InsetFrame edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        {onBack ? (
          <View className="h-12 flex-row items-center justify-between px-2">
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              <ArrowLeftIcon size={22} className="text-foreground" />
            </Pressable>
            {progress ? (
              <Text className="pr-3 text-muted-foreground text-[13px] leading-[18px]">
                Step {progress.step} of {progress.of}
              </Text>
            ) : null}
          </View>
        ) : null}

        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: progress ? 4 : 12,
            paddingBottom: 32,
            gap: 24,
          }}
        >
          {/* How far in. A bare line now: the bar says the number, and each
              step's own title says what it asks for, which the three small
              labels under the old markers were repeating. */}
          {progress ? (
            <View
              className="flex-row gap-1.5"
              accessibilityRole="progressbar"
              accessibilityLabel={`Step ${progress.step} of ${progress.of}`}
              accessibilityValue={{ min: 0, max: progress.of, now: progress.step }}
            >
              {Array.from({ length: progress.of }, (_, i) => (
                <View
                  key={i}
                  className={`flex-1 h-1 rounded-full ${i < progress.step ? 'bg-foreground' : 'bg-border'}`}
                />
              ))}
            </View>
          ) : null}
          {children}
        </ScrollView>

        {footer}
      </KeyboardAvoidingView>
    </InsetFrame>
  );
}

/** The title, and the one sentence that says what the screen is for. */
export function AuthTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text
        accessibilityRole="header"
        className="text-foreground text-[26px] leading-8 font-bold tracking-[-0.5px]"
      >
        {title}
      </Text>
      {children ? <Text className="text-muted-foreground text-[15px] leading-[22px]">{children}</Text> : null}
    </View>
  );
}

/**
 * What sits above the keyboard.
 *
 * In the layout, under the scroller, as the form kit's footer is: the last
 * field is never under the button and the keyboard lifts both. A plain column,
 * so a second full-width button (another way to sign in) is one more child
 * above or below the first, with nothing else to move.
 */
export function AuthFooter({
  note,
  children,
}: {
  /** Above the buttons: what is still missing. */
  note?: string | null;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View className="px-5 pt-3 bg-background gap-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
      {note ? <Text className="text-muted-foreground text-[13px] leading-[18px] text-center">{note}</Text> : null}
      {children}
    </View>
  );
}

/** One full-width button. Filled is the screen's one action; quiet is the other way on. */
export function AuthButton({
  label,
  onPress,
  disabled,
  busy,
  quiet,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  quiet?: boolean;
}) {
  const off = disabled || busy;
  const fill = quiet ? 'bg-secondary active:opacity-80' : disabled ? 'bg-muted' : 'bg-action active:opacity-85';
  const ink = quiet ? 'text-foreground' : disabled ? 'text-muted-foreground' : 'text-action-foreground';
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      className={`h-[52px] rounded-[14px] flex-row items-center justify-center gap-2 ${fill}`}
    >
      {busy && !quiet && !disabled ? (
        <ActivityIndicator size="small" color={PALETTES.light.actionForeground} />
      ) : null}
      <Text className={`text-[16px] font-semibold ${ink}`}>{label}</Text>
    </Pressable>
  );
}

/** The line under the button: a few quiet words, then the ones that go somewhere. */
export function AuthFooterLine({
  lead,
  action,
  onPress,
}: {
  lead: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${lead} ${action}`}
      hitSlop={12}
      className="self-center active:opacity-60"
    >
      <Text className="text-muted-foreground text-[15px] leading-5 text-center">
        {lead} <Text className="text-primary font-semibold">{action}</Text>
      </Text>
    </Pressable>
  );
}
