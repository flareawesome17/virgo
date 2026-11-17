import { Text, View } from 'react-native';
import { ReceiptIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { formatMoney, type PackageCardContext } from '@/src/api';
import { openChatLink } from '../links';
import { CardButton, CardFrame, CardGone, CardKindLabel, holdActions } from './CardFrame';
import type { CardProps } from './types';

cssInterop(ReceiptIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * A package shared in the chat: what has been paid and what is left, as it
 * stands now, and its statement. Costs and profit never reach the card.
 */
export function PackageCard({ message, mine, senderName, meta, cardRef, onHold, pills }: CardProps) {
  const pkg = ((message.context ?? null) as PackageCardContext | null)?.package;

  if (!pkg) {
    const words = "This package isn't available any more.";
    return (
      <CardFrame ref={cardRef} mine={mine} senderName={senderName} meta={meta} onHold={onHold} pills={pills}>
        <View accessible accessibilityLabel={`Package. ${words} ${meta}`} {...holdActions(onHold)} className="gap-1.5">
          <CardKindLabel icon={ReceiptIcon} label="Package" />
          <CardGone words={words} />
        </View>
      </CardFrame>
    );
  }

  const paid = formatMoney(pkg.receivedMinor);
  const left = formatMoney(pkg.balanceMinor);
  const share = pkg.totalMinor > 0 ? Math.min(1, Math.max(0, pkg.receivedMinor / pkg.totalMinor)) : 0;
  const statement = pkg.statementUrl;
  const money = pkg.paidInFull ? `Paid in full, ${formatMoney(pkg.totalMinor)}` : `Paid ${paid}, ${left} left`;

  return (
    <CardFrame ref={cardRef} mine={mine} senderName={senderName} meta={meta} onHold={onHold} pills={pills}>
      <View
        accessible
        accessibilityLabel={['Package', pkg.title, money, meta].join('. ')}
        {...holdActions(onHold)}
        className="gap-1.5"
      >
        <CardKindLabel icon={ReceiptIcon} label="Package" />
        <Text className="text-foreground text-[16px] leading-[22px] font-bold" numberOfLines={2}>
          {pkg.title}
        </Text>
        <View className="h-2 rounded-full bg-muted overflow-hidden">
          <View className="h-2 bg-success" style={{ width: `${Math.round(share * 100)}%` }} />
        </View>
        {pkg.paidInFull ? (
          <View className="flex-row justify-between">
            <Text className="text-success text-[14px] font-bold">Paid in full</Text>
            <Text className="text-foreground text-[14px] font-bold">{formatMoney(pkg.totalMinor)}</Text>
          </View>
        ) : (
          <View className="flex-row justify-between">
            <Text className="text-[14px]">
              <Text className="text-muted-foreground">Paid </Text>
              <Text className="text-foreground font-bold">{paid}</Text>
            </Text>
            <Text className="text-[14px]">
              <Text className="text-muted-foreground">Left </Text>
              <Text className="text-foreground font-bold">{left}</Text>
            </Text>
          </View>
        )}
      </View>
      {statement ? (
        <CardButton label="Open statement" onPress={() => openChatLink(statement)} onHold={onHold} />
      ) : (
        <Text className="mt-2.5 text-muted-foreground text-[13px] leading-[18px] text-center">No longer shared</Text>
      )}
    </CardFrame>
  );
}
