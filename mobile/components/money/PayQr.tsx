import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LandmarkIcon, QrCodeIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import type { MoneyPayMethod } from '@/src/api';

for (const Icon of [LandmarkIcon, QrCodeIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * A way to pay's QR code, on white whatever the theme: a scanner needs the
 * quiet light border round a code, and a dark screen would take it away.
 *
 * Without a QR it is a tile that says so, with a bank or a QR mark, so a
 * method with a number only still has a face in a list or a picker.
 */
export function PayQr({
  method,
  size,
  padding = Math.round(size * 0.06),
  radius = 14,
  label,
}: {
  method: MoneyPayMethod;
  /** The whole square, padding included. */
  size: number;
  padding?: number;
  radius?: number;
  /** Shown on the no-QR tile when there is room for words. */
  label?: string;
}) {
  if (method.qr?.url) {
    return (
      <View
        className="bg-white border border-border/60 items-center justify-center"
        style={{ width: size, height: size, borderRadius: radius, padding }}
        accessible
        accessibilityRole="image"
        accessibilityLabel={`QR code for ${method.accountName ?? 'this way to pay'}`}
      >
        <Image
          source={{ uri: method.qr.url, cacheKey: `pay-qr-${method.qr.id}` }}
          style={{ width: size - padding * 2, height: size - padding * 2 }}
          contentFit="contain"
          transition={120}
        />
      </View>
    );
  }
  const Icon = method.kind === 'bank' ? LandmarkIcon : QrCodeIcon;
  return (
    <View
      className="bg-muted items-center justify-center gap-1.5"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <Icon size={Math.max(18, Math.round(size * 0.18))} className="text-muted-foreground" />
      {label && size >= 96 ? (
        <Text className="text-muted-foreground text-[12px] font-semibold">{label}</Text>
      ) : null}
    </View>
  );
}
