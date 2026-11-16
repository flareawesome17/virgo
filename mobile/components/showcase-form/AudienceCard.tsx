import { Pressable, Text, View } from 'react-native';
import { CheckIcon, GlobeIcon, LockIcon, UsersIcon } from 'lucide-react-native';
import { FormCard } from '@/components/Form';
import { useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

/**
 * Who sees a post. Everyone is the feed, the profile and the link; your
 * connections is their feed alone; only you is the author alone — a post saved
 * and not published, or one taken down.
 *
 * The API has no 'private': that one is an unpublished post, so the form
 * publishes or takes down to make it so.
 */
export type Audience = 'public' | 'connections' | 'private';

const CHOICES: { value: Audience; icon: typeof GlobeIcon; label: string; detail: string }[] = [
  {
    value: 'public',
    icon: GlobeIcon,
    label: 'Everyone',
    detail: 'In the feed, on your profile, and by its link',
  },
  {
    value: 'connections',
    icon: UsersIcon,
    label: 'Your connections',
    detail: 'In their feed only. It has no public link.',
  },
  {
    value: 'private',
    icon: LockIcon,
    label: 'Only you',
    detail: 'It waits on your profile until you post it',
  },
];

/** The three choices as radio rows in one card. `value` is null when there is none to make. */
export function AudienceCard({
  value,
  onChange,
}: {
  value: Audience | null;
  onChange: (next: Audience) => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  return (
    <View accessibilityRole="radiogroup">
      <FormCard>
        {CHOICES.map(({ value: choice, icon: Icon, label, detail }, i) => {
          const on = value === choice;
          return (
            <Pressable
              key={choice}
              onPress={() => onChange(choice)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${label}. ${detail}`}
              className={`min-h-16 flex-row items-center gap-3 px-4 py-2 active:opacity-70 ${i > 0 ? 'border-t border-border/40' : ''}`}
            >
              <Icon size={19} color={palette.secondaryForeground} />
              <View className="flex-1">
                <Text className="text-foreground text-[15px] leading-5 font-semibold">{label}</Text>
                <Text className="text-muted-foreground text-[13px] leading-[18px]">{detail}</Text>
              </View>
              {/* Dark when chosen, like a chip: terracotta is the button's. */}
              <View
                className={`w-[22px] h-[22px] rounded-full items-center justify-center ${on ? 'bg-foreground' : 'border-2 border-border'}`}
              >
                {on ? <CheckIcon size={13} color={palette.background} strokeWidth={3} /> : null}
              </View>
            </Pressable>
          );
        })}
      </FormCard>
    </View>
  );
}
