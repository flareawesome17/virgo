import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRightIcon, type LucideIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';
import { useKeyboardReveal } from '@/components/KeyboardForm';

cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * The parts every form is made of.
 *
 * Each form drew its own: a label in small capitals here and in bold there, a
 * field on a shadow with large corners or flat with small ones, placeholder
 * text in three greys, the chosen chip in the button's own terracotta, and a
 * Cancel beside the X that already closed the form. These are the one set.
 *
 *   FormField    a label, what it labels, and a line under it
 *   FormInput    the text field: a hairline, terracotta while typed in
 *   ChoiceChip   one of several; the chosen one is dark, never terracotta
 *   FormCard     rows that open something (FormRow) or switch (FormSwitchRow)
 *   FormSection  a titled group of the above
 *   FormFooter   the one filled button, pinned to the bottom
 */

/** Placeholder text, in the theme's quiet ink. One grey, not three. */
export function usePlaceholderColor(): string {
  const { isDark } = useTheme();
  return isDark ? '#8A7A70' : '#A08D82';
}

export function FormLabel({ children, optional }: { children: ReactNode; optional?: boolean }) {
  return (
    <Text className="text-foreground text-[15px] leading-5 font-semibold">
      {children}
      {optional ? <Text className="text-muted-foreground font-normal"> optional</Text> : null}
    </Text>
  );
}

/** A line under a field: what it is for, or, in red, what is wrong with it. */
export function FormHint({ children, wrong }: { children: ReactNode; wrong?: boolean }) {
  return (
    <Text
      className={`text-[13px] leading-[18px] ${wrong ? 'text-destructive' : 'text-muted-foreground'}`}
      accessibilityLiveRegion={wrong ? 'polite' : undefined}
    >
      {children}
    </Text>
  );
}

export function FormField({
  label,
  optional,
  hint,
  wrong,
  children,
}: {
  label: string;
  optional?: boolean;
  /** Under the field. With `wrong`, it is the sentence that says what is. */
  hint?: ReactNode;
  wrong?: boolean;
  children: ReactNode;
}) {
  return (
    <View className="gap-2">
      <FormLabel optional={optional}>{label}</FormLabel>
      {children}
      {hint ? <FormHint wrong={wrong}>{hint}</FormHint> : null}
    </View>
  );
}

/**
 * The text field.
 *
 * Flat on the page with a hairline, so it reads as a place to type rather
 * than a card to tap; the hairline turns terracotta while it has the
 * keyboard, and red when what is in it is wrong. 52 points high, 16 point
 * text: iOS zooms the page for anything smaller.
 */
export function FormInput({
  wrong,
  lead,
  multiline,
  minHeight = 96,
  onFocus,
  onBlur,
  onContentSizeChange,
  style,
  ...props
}: TextInputProps & {
  wrong?: boolean;
  /** Before the text: a peso sign, a glyph. */
  lead?: ReactNode;
  /** For a multiline field. */
  minHeight?: number;
}) {
  const [focused, setFocused] = useState(false);
  const placeholder = usePlaceholderColor();
  // Inside a KeyboardFrame: kept above the keyboard while typed in.
  const keyboard = useKeyboardReveal();
  return (
    <View
      className={`flex-row gap-2.5 px-4 rounded-[14px] bg-card ${multiline ? 'items-start' : 'items-center'} ${
        wrong ? 'border-[1.5px] border-destructive' : focused ? 'border-[1.5px] border-primary' : 'border border-border'
      }`}
      style={{ minHeight: multiline ? minHeight : 52 }}
    >
      {lead}
      <TextInput
        placeholderTextColor={placeholder}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          keyboard.onFocus?.(event);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        onContentSizeChange={(event) => {
          // A note's new line can drop below the keyboard as it is typed.
          if (multiline && focused) keyboard.onGrow?.();
          onContentSizeChange?.(event);
        }}
        className="flex-1 min-w-0 text-foreground text-[16px] leading-[22px]"
        style={[{ paddingVertical: multiline ? 14 : 0, minHeight: multiline ? minHeight - 2 : 50 }, style]}
      />
    </View>
  );
}

/**
 * One choice among several, or one of several that can each be on.
 *
 * Dark when chosen. Terracotta is the button's, and a row of chips with one in
 * terracotta put a second "do this" on the screen above the real one.
 */
export function ChoiceChip({
  label,
  selected,
  onPress,
  icon: Icon,
  multiple,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: LucideIcon;
  /** Several can be on at once: announced as a checkbox, not a radio. */
  multiple?: boolean;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      className={`h-10 px-4 rounded-full flex-row items-center gap-1.5 active:opacity-80 ${
        selected ? 'bg-foreground' : 'bg-muted'
      }`}
    >
      {Icon ? <Icon size={15} color={selected ? palette.background : palette.foreground} /> : null}
      <Text className={`text-[14px] font-semibold ${selected ? 'text-background' : 'text-foreground'}`}>{label}</Text>
    </Pressable>
  );
}

export function ChoiceChips({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}

/** The card that holds a form's rows. */
export function FormCard({ children }: { children: ReactNode }) {
  return <View className="rounded-[20px] border border-border/40 bg-card overflow-hidden">{children}</View>;
}

const ROW = 'min-h-[52px] flex-row items-center gap-3 pl-4 pr-3.5';

/**
 * A row that opens something: a date, a workspace, a receipt. What is chosen
 * sits on the right, in bold; nothing chosen yet is said in grey.
 */
export function FormRow({
  icon: Icon,
  label,
  value,
  empty,
  first,
  onPress,
  trailing,
  accessibilityHint,
}: {
  icon?: LucideIcon;
  label: string;
  value?: string;
  /** `value` is a prompt ("Nobody yet"), not a choice. */
  empty?: boolean;
  first?: boolean;
  onPress?: () => void;
  /** After the value, in place of the chevron. */
  trailing?: ReactNode;
  accessibilityHint?: string;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${label}${value ? `, ${value}` : ''}`}
      accessibilityHint={accessibilityHint}
      className={`${ROW} active:opacity-70 ${first ? '' : 'border-t border-border/40'}`}
    >
      {Icon ? <Icon size={19} color={palette.secondaryForeground} /> : null}
      <Text className="text-foreground text-[15px] font-medium">{label}</Text>
      <Text
        className={`flex-1 text-right text-[15px] ${empty ? 'text-muted-foreground' : 'text-foreground font-semibold'}`}
        numberOfLines={1}
      >
        {value}
      </Text>
      {trailing ?? (onPress ? <ChevronRightIcon size={16} className="text-muted-foreground/60" /> : null)}
    </Pressable>
  );
}

/** A row that is on or off. */
export function FormSwitchRow({
  icon: Icon,
  label,
  value,
  onValueChange,
  first,
  disabled,
}: {
  icon?: LucideIcon;
  label: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  first?: boolean;
  disabled?: boolean;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  return (
    <View className={`${ROW} ${first ? '' : 'border-t border-border/40'}`}>
      {Icon ? <Icon size={19} color={palette.secondaryForeground} /> : null}
      <Text className="flex-1 text-foreground text-[15px] font-medium">{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: palette.action }}
      />
    </View>
  );
}

/**
 * Something the form has to say before it can be filled in: a plan's limit
 * reached. One quiet card with the fact in bold and, where there is one, the
 * way out as a word on the right. It was an amber block with an amber button.
 */
export function FormNotice({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="flex-row items-start gap-3 rounded-2xl border border-border/40 bg-card px-4 py-3.5" accessibilityRole="alert">
      <View className="flex-1 gap-0.5">
        <Text className="text-foreground text-[14px] leading-5 font-semibold">{title}</Text>
        <Text className="text-muted-foreground text-[13px] leading-[18px]">{body}</Text>
      </View>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button" hitSlop={10} className="active:opacity-60">
          <Text className="text-primary text-[14px] font-semibold">{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A titled group: "When", "Where it goes". */
export function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-2.5">
      <Text className="text-foreground text-[17px] leading-6 font-bold tracking-[-0.2px]" accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/**
 * The one button, across the bottom of the form.
 *
 * In the layout, under the scroller, not floating over it: the last field is
 * never under the button, and the keyboard lifts both. There is no Cancel
 * beside it. The X in the header closes the form, and asks first when
 * something has been typed.
 */
export function FormFooter({
  label,
  onPress,
  disabled,
  busy,
  note,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Above the button: what is still missing, or what happens next. */
  note?: string;
}) {
  const insets = useSafeAreaInsets();
  const off = disabled || busy;
  return (
    <View
      className="px-5 pt-3 bg-background border-t border-border/50 gap-2"
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
    >
      {note ? <Text className="text-muted-foreground text-[13px] leading-[18px] text-center">{note}</Text> : null}
      <Pressable
        onPress={onPress}
        disabled={off}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!off, busy: !!busy }}
        className={`h-[52px] rounded-[14px] flex-row items-center justify-center gap-2 ${
          disabled ? 'bg-muted' : 'bg-action active:opacity-85'
        }`}
      >
        {busy ? <ActivityIndicator size="small" color={PALETTES.light.actionForeground} /> : null}
        <Text className={`text-[16px] font-semibold ${disabled ? 'text-muted-foreground' : 'text-action-foreground'}`}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}
