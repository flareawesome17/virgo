import { View, Text, TextInput, Pressable } from 'react-native';
import { useState } from 'react';
import { MapPinIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useTheme } from '@/src/hooks';
import { suggestLocations } from '@/src/lib/ph-locations';

cssInterop(MapPinIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * A place, with suggestions.
 *
 * Still free text: shoots happen at resorts, churches and barangays as often
 * as in a city, and forcing a pick from a list would make the common case
 * harder than the plain box it replaces.
 *
 * What the suggestions buy is spelling. The board searches on the string, so
 * "Ozamis" and "Ozamiz" are two different places to it, and a post using the
 * less common one is invisible to anyone searching the other.
 */
export function LocationField({
  value,
  onChange,
  placeholder = 'Cebu City',
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const { isDark } = useTheme();
  const [focused, setFocused] = useState(false);

  const suggestions = focused ? suggestLocations(value, 4) : [];

  return (
    <View>
      <View className="bg-card rounded-xl px-3.5 flex-row items-center gap-2">
        <MapPinIcon size={14} className="text-muted-foreground" />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#9ca3af"
          maxLength={120}
          onFocus={() => setFocused(true)}
          // Not onBlur: tapping a suggestion blurs the input first, and hiding
          // the list on blur means the tap lands on nothing. The list closes
          // when something is chosen instead.
          className="text-foreground text-sm flex-1 py-3"
        />
      </View>

      {suggestions.length > 0 && (
        <View
          className="bg-card rounded-xl mt-1 overflow-hidden"
          style={{
            borderWidth: 1,
            borderColor: isDark ? '#2A2522' : '#F0E8E2',
          }}
        >
          {suggestions.map((city, i) => (
            <Pressable
              key={city}
              onPress={() => {
                onChange(city);
                setFocused(false);
              }}
              className="px-3.5 py-2.5 flex-row items-center gap-2 active:bg-muted/40"
              style={
                i < suggestions.length - 1
                  ? {
                      borderBottomWidth: 1,
                      borderBottomColor: isDark ? '#2A2522' : '#F0E8E2',
                    }
                  : undefined
              }
            >
              <MapPinIcon size={12} className="text-muted-foreground" />
              <Text className="text-foreground text-[13px]">{city}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
