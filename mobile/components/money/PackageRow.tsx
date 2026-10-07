import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CircleCheckIcon, LinkIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { dayLabel, formatMoney, type MoneyPackage } from '@/src/api';

for (const Icon of [CircleCheckIcon, LinkIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** "₱35,000 left · due Sat, Nov 14", or where it stands when nothing is due. */
export function packageStatus(p: MoneyPackage): string {
  if (p.paidInFull) return `Paid in full · ${formatMoney(p.totalMinor)}`;
  const left = `${formatMoney(p.balanceMinor)} left`;
  if (p.nextDueOn) return `${left} · ${p.overdue ? 'overdue since' : 'due'} ${dayLabel(p.nextDueOn)}`;
  return `${left} · no date set`;
}

/** How much of the total is in, 0 to 1. */
export function packageProgress(p: MoneyPackage): number {
  return p.totalMinor > 0 ? Math.min(1, p.receivedMinor / p.totalMinor) : 0;
}

/**
 * One package in a list: the job, the client, a bar for how much is in, and
 * what is left and when it is due.
 */
export const PackageRow = memo(function PackageRow({
  pkg,
  first,
  last,
  onPress,
}: {
  pkg: MoneyPackage;
  first: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const progress = packageProgress(pkg);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${pkg.title}. ${packageStatus(pkg)}`}
      className={`bg-card px-4 py-3.5 active:opacity-70 ${first ? 'rounded-t-2xl' : ''} ${
        last ? 'rounded-b-2xl' : 'border-b border-border'
      }`}
    >
      <View className="flex-row items-center gap-2">
        <Text className="text-foreground text-[15px] font-semibold flex-1" numberOfLines={1}>
          {pkg.title}
        </Text>
        {pkg.shareUrl ? <LinkIcon size={13} className="text-muted-foreground" /> : null}
        {pkg.paidInFull ? <CircleCheckIcon size={15} className="text-success" /> : null}
      </View>
      {pkg.clientName ? (
        <Text className="text-muted-foreground text-[13px] mt-0.5" numberOfLines={1}>
          {pkg.clientName}
        </Text>
      ) : null}
      <View className="h-1.5 rounded-full bg-muted mt-2.5 overflow-hidden">
        <View
          className={`h-full rounded-full ${pkg.paidInFull ? 'bg-success' : 'bg-primary'}`}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </View>
      <Text
        className={`text-[13px] mt-1.5 ${pkg.overdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}
        numberOfLines={1}
      >
        {packageStatus(pkg)}
      </Text>
    </Pressable>
  );
});
