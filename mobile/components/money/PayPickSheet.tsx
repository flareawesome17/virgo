import { ActivityIndicator, Pressable, Text, useWindowDimensions, View } from 'react-native';
import { ChevronRightIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { payMethodName, type MoneyPayMethod } from '@/src/api';
import { BottomSheet } from '@/components/BottomSheet';
import { PayQr } from '@/components/money/PayQr';
import { useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** "ends in 4567", from the number's digits; nothing for a number too short to end anyhow. */
function endingOf(m: MoneyPayMethod): string | null {
  const digits = (m.accountNumber ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? `ends in ${digits.slice(-4)}` : m.accountNumber;
}

/**
 * Show a QR, from Money: every saved way to pay as a large tile, the main one
 * first, so a quick send is two taps from anywhere in Money. An account with
 * no QR says "Number only", and still opens: the number shows large instead.
 */
export function PayPickSheet({
  visible,
  payMethods,
  onClose,
  onClosed,
  onPick,
  onEdit,
  title = 'Show a QR',
  hint = 'Tap one to show it',
  footnote = 'With just one saved, Show QR opens it straight away.',
  loading = false,
}: {
  visible: boolean;
  payMethods: MoneyPayMethod[];
  /** The sheet's name, its hint and the line at its foot: a chat sends one rather than shows it. */
  title?: string;
  hint?: string;
  footnote?: string;
  /** The list is still on its way: a spinner in place of the tiles. */
  loading?: boolean;
  onClose: () => void;
  /**
   * Once the sheet has fully gone: where to open the next screen. iOS will
   * not present the full-screen QR over a sheet that is still leaving.
   */
  onClosed?: () => void;
  onPick: (method: MoneyPayMethod) => void;
  onEdit: () => void;
}) {
  const { width } = useWindowDimensions();
  const { isDark } = useTheme();
  // Two columns inside 20pt margins and a 12pt gap; the tile pads by 14.
  const tile = Math.floor((Math.min(width, 480) - 40 - 12) / 2);
  const qrSize = Math.min(tile - 28, 140);

  return (
    <BottomSheet visible={visible} onClose={onClose} onClosed={onClosed}>
      <View className="flex-row items-baseline justify-between px-5">
        <Text className="text-foreground text-[18px] font-bold" accessibilityRole="header">
          {title}
        </Text>
        <Text className="text-muted-foreground text-[13px]">{hint}</Text>
      </View>

      {loading && payMethods.length === 0 ? (
        <View className="items-center py-10">
          <ActivityIndicator size="small" color={(isDark ? PALETTES.dark : PALETTES.light).primary} />
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-3 px-5 pt-4">
        {payMethods.map((m, i) => (
          <Pressable
            key={m.id}
            onPress={() => onPick(m)}
            accessibilityRole="button"
            accessibilityLabel={`Show ${payMethodName(m)}${i === 0 ? ', your main way to pay' : ''}`}
            className={`rounded-[20px] p-3.5 gap-2.5 active:opacity-70 ${
              i === 0 ? 'border-[1.5px] border-foreground' : 'border border-border'
            }`}
            style={{ width: tile }}
          >
            <View className="items-center">
              <PayQr method={m} size={qrSize} radius={14} label="Number only" />
            </View>
            <View>
              <View className="flex-row items-center gap-1.5">
                <Text className="text-foreground text-[15px] font-bold" numberOfLines={1}>
                  {payMethodName(m)}
                </Text>
                {i === 0 ? (
                  <View className="rounded-full bg-action/10 px-1.5 py-px">
                    <Text className="text-action text-[10px] font-bold uppercase tracking-[0.8px]">Main</Text>
                  </View>
                ) : null}
              </View>
              {endingOf(m) ? (
                <Text className="text-muted-foreground text-[13px]" numberOfLines={1}>
                  {endingOf(m)}
                </Text>
              ) : null}
            </View>
          </Pressable>
        ))}
      </View>

      <View className="flex-row items-center justify-between px-5 pt-3">
        <Text className="flex-1 text-muted-foreground text-[12px] leading-4 pr-3">
          {footnote}
        </Text>
        <Pressable
          onPress={onEdit}
          accessibilityRole="button"
          className="h-11 flex-row items-center gap-1 active:opacity-60"
        >
          <Text className="text-action text-[14px] font-semibold">Edit ways to pay</Text>
          <ChevronRightIcon size={15} className="text-action" />
        </Pressable>
      </View>
    </BottomSheet>
  );
}
