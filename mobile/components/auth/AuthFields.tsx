import { useEffect, useState, type Ref } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
import { EyeIcon, EyeOffIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { FormInput } from '@/components/Form';
import { useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeOffIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * A password field: the form kit's text field with an eye at its right end.
 *
 * The eye is why joining and resetting ask for the password once. Typing it
 * twice was there to catch a typo; being able to look at it catches the same
 * typo, in one field.
 */
export function PasswordInput({
  inputRef,
  wrong,
  style,
  ...props
}: TextInputProps & {
  inputRef?: Ref<TextInput>;
  wrong?: boolean;
}) {
  const [shown, setShown] = useState(false);
  // The kit's field hands whatever it is given to its TextInput, and React 19
  // passes a ref along as a prop, so this reaches the input itself. Spread as
  // a plain object because the kit's props do not name `ref`.
  const refProp: object = inputRef ? { ref: inputRef } : {};
  return (
    <View>
      <FormInput
        {...props}
        {...refProp}
        wrong={wrong}
        secureTextEntry={!shown}
        autoCapitalize="none"
        // Clear of the eye, which lies over the field's right end.
        style={[{ paddingRight: 36 }, style]}
      />
      <Pressable
        onPress={() => setShown((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={shown ? 'Hide password' : 'Show password'}
        className="absolute right-1 top-1 w-11 h-11 items-center justify-center active:opacity-60"
      >
        {shown ? (
          <EyeOffIcon size={20} className="text-muted-foreground" />
        ) : (
          <EyeIcon size={20} className="text-muted-foreground" />
        )}
      </Pressable>
    </View>
  );
}

/**
 * A six-digit code, as six boxes.
 *
 * One real text field lies over the boxes with its own text and caret made
 * transparent; the boxes only draw what is in it. Six separate fields would
 * break the two things that matter here: iOS offering the code from the
 * message it just arrived in, and pasting all six at once.
 *
 * Transparent ink rather than zero opacity: iOS does not deliver touches to a
 * view it considers invisible, and the boxes could not then be tapped.
 */
export function CodeBoxes({
  value,
  onChangeText,
  onSubmitEditing,
  wrong,
  accessibilityLabel,
  autoFocus,
}: {
  value: string;
  onChangeText: (next: string) => void;
  onSubmitEditing?: () => void;
  wrong?: boolean;
  accessibilityLabel: string;
  autoFocus?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const cursor = Math.min(value.length, 5);
  return (
    <View className="flex-row gap-2">
      {Array.from({ length: 6 }, (_, i) => (
        <View
          key={i}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className={`flex-1 h-[60px] rounded-[14px] bg-card items-center justify-center ${
            wrong
              ? 'border-[1.5px] border-destructive'
              : focused && i === cursor
                ? 'border-[1.5px] border-primary'
                : 'border border-border'
          }`}
        >
          <Text className="text-foreground text-[24px] leading-[30px] font-bold">{value[i] ?? ''}</Text>
        </View>
      ))}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={6}
        caretHidden
        selectionColor="transparent"
        accessibilityLabel={accessibilityLabel}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          color: 'transparent',
          fontSize: 16,
        }}
      />
    </View>
  );
}

/**
 * A role, as a chip.
 *
 * The form kit's chip at the height this screen needs: these are the main
 * thing on their step and are tapped with a thumb, so 44 points rather than
 * the kit's 40. Dark when chosen, as the kit's is. One typed in by hand
 * carries an X, and tapping it takes it away again.
 */
export function RoleChip({
  label,
  selected,
  onPress,
  removable,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Typed in, not from the list: there is nothing to go back to but gone. */
  removable?: boolean;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={removable ? 'button' : 'checkbox'}
      accessibilityState={removable ? undefined : { checked: selected }}
      accessibilityLabel={removable ? `Remove ${label}` : label}
      className={`h-11 rounded-full flex-row items-center gap-1.5 active:opacity-80 ${
        removable ? 'pl-4 pr-2.5' : 'px-4'
      } ${selected ? 'bg-foreground' : 'bg-muted'}`}
    >
      <Text
        className={`text-[15px] ${selected ? 'text-background font-semibold' : 'text-secondary-foreground font-medium'}`}
        numberOfLines={1}
      >
        {label}
      </Text>
      {removable ? <XIcon size={16} color={palette.background} /> : null}
    </Pressable>
  );
}

/**
 * Seconds left before something can be asked for again, and a way to start
 * the wait over. Counts on the clock rather than on ticks, so a phone that
 * slept through half of it does not make anybody wait the whole of it again.
 */
export function useCountdown(seconds: number, startNow: boolean): [number, () => void] {
  const [until, setUntil] = useState(() => (startNow ? Date.now() + seconds * 1000 : 0));
  const [left, setLeft] = useState(startNow ? seconds : 0);
  useEffect(() => {
    const remaining = () => Math.max(0, Math.ceil((until - Date.now()) / 1000));
    setLeft(remaining());
    if (remaining() === 0) return;
    const timer = setInterval(() => {
      const now = remaining();
      setLeft(now);
      if (now === 0) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [until]);
  return [left, () => setUntil(Date.now() + seconds * 1000)];
}

/** 42 → "0:42". */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
