import { createContext, useContext, type ReactNode, type Ref } from 'react';
import { ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useKeyboardAwareScroll } from '@/src/lib/keyboard';

type Keyboard = ReturnType<typeof useKeyboardAwareScroll>;

const KeyboardContext = createContext<Keyboard | null>(null);

/**
 * What a field calls when it takes focus or grows a line, so the form keeps it
 * above the keyboard. Outside a KeyboardFrame, nothing. FormInput and the
 * other shared fields call it themselves; a screen's own TextInput gives
 * `onFocus={reveal.onFocus}`.
 */
export function useKeyboardReveal() {
  const keyboard = useContext(KeyboardContext);
  return {
    onFocus: keyboard?.onFocus,
    onGrow: keyboard?.onGrow,
  };
}

/**
 * In place of KeyboardAvoidingView around a form: the scrolling part and the
 * footer under it (a FormFooter, an AuthFrame's buttons) rise with the
 * keyboard, and whatever field is being typed in scrolls clear of it.
 *
 * KeyboardAvoidingView lifted the footer on iOS, but never scrolled the field
 * into what was left: the Notes on a new event, last on the form, stayed under
 * the keyboard. On Android, drawing edge to edge, it often did not lift at all.
 * Put a KeyboardScroll inside, where the ScrollView was.
 */
export function KeyboardFrame({
  children,
  className = 'flex-1',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  // A screen pushed over this one keeps it mounted: only the one in front moves.
  const navigation = useContext(NavigationContext);
  const keyboard = useKeyboardAwareScroll({
    lifts: true,
    active: () => navigation?.isFocused?.() ?? true,
  });
  return (
    <KeyboardContext.Provider value={keyboard}>
      <View
        ref={keyboard.frameRef}
        onLayout={keyboard.onFrameLayout}
        className={className}
        style={[style, { paddingBottom: keyboard.lift }]}
      >
        {children}
      </View>
    </KeyboardContext.Provider>
  );
}

/**
 * The form's ScrollView, inside a KeyboardFrame. Takes everything a ScrollView
 * does; scrolls itself to the field being typed in.
 */
export function KeyboardScroll({
  onScroll,
  scrollRef,
  ...props
}: ScrollViewProps & { scrollRef?: Ref<ScrollView> }) {
  const keyboard = useContext(KeyboardContext);
  if (!keyboard) {
    return <ScrollView ref={scrollRef} onScroll={onScroll} {...props} />;
  }
  return (
    <View ref={keyboard.viewportRef} className="flex-1">
      <ScrollView
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        {...props}
        ref={(node) => {
          (keyboard.scrollRef as { current: ScrollView | null }).current = node;
          if (typeof scrollRef === 'function') scrollRef(node);
          else if (scrollRef) (scrollRef as { current: ScrollView | null }).current = node;
        }}
        scrollEventThrottle={props.scrollEventThrottle ?? keyboard.scrollEventThrottle}
        onScroll={(event) => {
          keyboard.onScroll(event);
          onScroll?.(event);
        }}
      />
    </View>
  );
}
