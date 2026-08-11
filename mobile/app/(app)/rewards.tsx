import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { CheckIcon, CopyIcon, GiftIcon, Share2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  expiryLabel,
  rewardLabel,
  type OfferedPromo,
} from '@/src/api';
import {
  useClaimPromo,
  usePromoOffers,
  useReferralCode,
} from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';

const interop = { className: { target: 'style', nativeStyleToProp: { color: true } } } as const;
cssInterop(CheckIcon, interop);
cssInterop(CopyIcon, interop);
cssInterop(GiftIcon, interop);
cssInterop(Share2Icon, interop);

function OfferCard({ offer }: { offer: OfferedPromo }) {
  const claim = useClaimPromo();
  const expiry = expiryLabel(offer.expiresAt);

  const take = () => {
    claim.mutate(offer.grantId, {
      onSuccess: (result) => {
        Alert.alert('Claimed', `${result.reward} has been added to your account.`);
      },
      onError: () => {
        Alert.alert(
          'Could not claim that',
          'It may have expired. Pull down to refresh and try again.',
        );
      },
    });
  };

  return (
    <View className="mb-3 rounded-2xl border border-border bg-card p-5">
      <View className="flex-row items-start gap-4">
        <View className="size-11 items-center justify-center rounded-xl bg-primary/10">
          <GiftIcon size={20} className="text-primary" />
        </View>

        <View className="flex-1">
          <Text className="text-[16px] font-bold text-foreground">
            {offer.name}
          </Text>
          <Text className="mt-1 text-[14px] font-semibold text-primary">
            {rewardLabel(offer)}
          </Text>

          {!!offer.description && (
            <Text className="mt-2 text-[13px] leading-5 text-muted-foreground">
              {offer.description}
            </Text>
          )}

          {!!offer.referredName && (
            <Text className="mt-2 text-[13px] leading-5 text-muted-foreground">
              You earned this when {offer.referredName} joined with your code.
            </Text>
          )}

          <View className="mt-4 flex-row items-center gap-3">
            <Pressable
              onPress={take}
              disabled={claim.isPending}
              className="rounded-xl px-5 py-2.5"
              style={{ backgroundColor: '#B66A40', opacity: claim.isPending ? 0.6 : 1 }}
            >
              {claim.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-[14px] font-bold text-white">Claim</Text>
              )}
            </Pressable>
            {!!expiry && (
              <Text className="text-[12px] text-muted-foreground">{expiry}</Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * The code to share, and what sharing it is worth.
 *
 * Deliberately vague about the reward: what a referral pays is whatever promo
 * is active at the time, and it can be switched off entirely. Promising a
 * specific number here would be a promise the console can revoke.
 */
function ReferralCard() {
  const { code, isLoading } = useReferralCode();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View className="rounded-2xl border border-border bg-card p-5">
      <View className="flex-row items-start gap-4">
        <View className="size-11 items-center justify-center rounded-xl bg-muted">
          <Share2Icon size={20} className="text-muted-foreground" />
        </View>

        <View className="flex-1">
          <Text className="text-[16px] font-bold text-foreground">
            Invite other creatives
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Share your code. When someone signs up with it and confirms their
            email address, any reward we are running lands here for you to claim.
          </Text>

          <View className="mt-4 flex-row items-center gap-3">
            <View className="rounded-xl border border-border bg-muted px-4 py-2.5">
              <Text className="text-[18px] font-bold tracking-[4px] text-foreground">
                {isLoading ? '······' : (code ?? '—')}
              </Text>
            </View>
            <Pressable
              onPress={() => void copy()}
              disabled={!code}
              className="flex-row items-center gap-2 rounded-xl border border-border px-4 py-2.5"
              style={{ opacity: code ? 1 : 0.5 }}
            >
              {copied ? (
                <CheckIcon size={16} className="text-foreground" />
              ) : (
                <CopyIcon size={16} className="text-foreground" />
              )}
              <Text className="text-[13px] font-semibold text-foreground">
                {copied ? 'Copied' : 'Copy'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

/**
 * Rewards waiting to be claimed, and the code that earns more of them.
 *
 * Claiming is explicit rather than automatic on purpose: somebody who was
 * given storage should know they have it, and a limit that silently changed
 * is indistinguishable from a bug.
 */
export default function RewardsScreen() {
  const { offers, isLoading, loadFailed, refetch, isRefetching } =
    usePromoOffers();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <Stack.Screen options={{ title: 'Rewards', headerBackTitle: 'Back' }} />

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : loadFailed ? (
        <LoadFailed what="your rewards" onRetry={() => void refetch()} />
      ) : (
        <ScrollView
          contentContainerClassName="p-5 pb-16"
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => void refetch()}
            />
          }
        >
          {offers.length === 0 ? (
            <View className="mb-3 items-center rounded-2xl border border-dashed border-border py-12">
              <GiftIcon size={24} className="text-muted-foreground" />
              <Text className="mt-3 text-[14px] font-semibold text-foreground">
                Nothing waiting right now
              </Text>
              <Text className="mt-1 px-8 text-center text-[12px] leading-5 text-muted-foreground">
                Rewards show up here when we send one your way, or when someone
                joins with your code below.
              </Text>
            </View>
          ) : (
            offers.map((offer) => (
              <OfferCard key={offer.grantId} offer={offer} />
            ))
          )}

          <ReferralCard />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
