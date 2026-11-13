import { Text, View } from 'react-native';

/**
 * The square that starts a row about a day or an hour: "MON" over "16", or
 * "4:00" over "PM".
 *
 * Every list of dated things starts with one — the Dashboard's Coming up, the
 * Schedule, a job's day — so dates line up down the left edge and can be read
 * without reading the rows. The large line is the one you look for; the small
 * one says what kind of number it is.
 */
export function DateTile({
  small,
  large,
  largeFirst = false,
  wide = false,
}: {
  /** "MON", "NOV", "PM". */
  small: string;
  /** 16, "4:00". */
  large: string | number;
  /** The time reads "4:00" then "PM"; a date reads "MON" then "16". */
  largeFirst?: boolean;
  /** 52pt across, for "12:30". */
  wide?: boolean;
}) {
  const smallLine = (
    <Text
      allowFontScaling={false}
      className="text-muted-foreground text-[10px] leading-[12px] font-bold tracking-wider"
    >
      {small}
    </Text>
  );
  const largeLine = (
    <Text
      allowFontScaling={false}
      className={`text-foreground font-bold ${largeFirst ? 'text-[15px] leading-[18px]' : 'text-[17px] leading-5'}`}
      style={{ fontVariant: ['tabular-nums'] }}
    >
      {large}
    </Text>
  );
  return (
    <View className={`${wide ? 'w-[52px]' : 'w-11'} h-11 rounded-xl bg-muted items-center justify-center`}>
      {largeFirst ? largeLine : smallLine}
      {largeFirst ? smallLine : largeLine}
    </View>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "4:00" and "PM" from "16:00:00", for a tile that leads with the hour. */
export function timeParts(time: string): { clock: string; half: string } {
  const [h, m] = time.split(':').map(Number);
  const hour = ((h + 11) % 12) + 1;
  return { clock: `${hour}:${pad(m || 0)}`, half: h >= 12 ? 'PM' : 'AM' };
}
