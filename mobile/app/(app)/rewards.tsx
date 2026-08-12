import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import {
  CheckIcon,
  CopyIcon,
  GiftIcon,
  PartyPopperIcon,
  Share2Icon,
  TicketCheckIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  expiryLabel,
  rewardLabel,
  storageLabel,
  type ClaimedPromo,
  type OfferedPromo,
} from '@/src/api';
import {
  useClaimPromo,
  usePromoOffers,
  useRedeemReferral,
  useReferralCode,
} from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';

const interop = { className: { target: 'style', nativeStyleToProp: { color: true } } } as const;
cssInterop(CheckIcon, interop);
cssInterop(CopyIcon, interop);
cssInterop(GiftIcon, interop);
cssInterop(PartyPopperIcon, interop);
cssInterop(Share2Icon, interop);
cssInterop(TicketCheckIcon, interop);

function OfferCard({
  offer,
  onClaimed,
}: {
  offer: OfferedPromo;
  onClaimed: (result: ClaimedPromo) => void;
}) {
  const claim = useClaimPromo();
  const expiry = expiryLabel(offer.expiresAt);

  const take = () => {
    claim.mutate(offer.grantId, {
      onSuccess: onClaimed,
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
 * The moment after claiming.
 *
 * A system Alert was not enough. A promo *adds* to what the plan already
 * gives, and the one thing somebody wants confirmed is the new total — "15 GB"
 * on its own leaves them wondering whether it replaced their allowance. So the
 * new ceilings are stated outright, next to what was just won.
 */
function ClaimedModal({
  result,
  onClose,
}: {
  result: ClaimedPromo | null;
  onClose: () => void;
}) {
  const totals = [
    result?.limits.storageBytes != null && {
      label: 'Storage',
      value: storageLabel(result.limits.storageBytes),
    },
    result?.limits.workspaces != null && {
      label: 'Workspaces',
      value: `${result.limits.workspaces}`,
    },
    result?.limits.albumsPerWorkspace != null && {
      label: 'Albums each',
      value: `${result.limits.albumsPerWorkspace}`,
    },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <Modal
      visible={!!result}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 items-center justify-center bg-black/60 px-8">
        <View className="w-full rounded-3xl bg-card p-6">
          <View className="items-center">
            <View className="size-16 items-center justify-center rounded-2xl bg-primary/10">
              <PartyPopperIcon size={32} className="text-primary" />
            </View>
            <Text className="mt-4 text-[20px] font-extrabold text-foreground">
              You got it!
            </Text>
            <Text className="mt-2 text-center text-[13px] leading-5 text-muted-foreground">
              {result?.reward} has been added to your account.
            </Text>
          </View>

          {totals.length > 0 && (
            <View className="mt-5 rounded-2xl border border-border bg-muted/40 p-4">
              <Text className="text-[11px] font-bold uppercase tracking-[1.5px] text-muted-foreground">
                Your account now has
              </Text>
              <View className="mt-3 flex-row">
                {totals.map((t) => (
                  <View key={t.label} className="flex-1">
                    <Text className="text-[17px] font-extrabold text-foreground">
                      {t.value}
                    </Text>
                    <Text className="text-[11px] text-muted-foreground">
                      {t.label}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Pressable
            onPress={onClose}
            className="mt-5 items-center rounded-xl py-3"
            style={{ backgroundColor: '#B66A40' }}
          >
            <Text className="text-[15px] font-bold text-white">Nice</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Using somebody else's code.
 *
 * The signup form has a field for this too, but most people are handed a code
 * by a friend after they have already joined — and a field only reachable by
 * starting over is a field nobody uses.
 *
 * Hides itself once used: it is once per account, and a control that can only
 * fail is not worth the space.
 */
function RedeemCard() {
  const [code, setCode] = useState('');
  const [done, setDone] = useState(false);
  const redeem = useRedeemReferral();

  const submit = () => {
    redeem.mutate(code.trim(), {
      onSuccess: (result) => {
        setDone(true);
        Alert.alert(
          'Invite code accepted',
          result.rewarded
            ? 'Your reward is waiting above — claim it whenever you like.'
            : 'No reward is running right now, but your invite is recorded.',
        );
      },
      onError: (err) => {
        Alert.alert(
          'Could not use that code',
          err instanceof Error ? err.message : 'Check the code and try again.',
        );
      },
    });
  };

  if (done) return null;

  return (
    <View className="mb-3 rounded-2xl border border-border bg-card p-5">
      <View className="flex-row items-start gap-4">
        <View className="size-11 items-center justify-center rounded-xl bg-muted">
          <TicketCheckIcon size={20} className="text-muted-foreground" />
        </View>

        <View className="flex-1">
          <Text className="text-[16px] font-bold text-foreground">
            Have an invite code?
          </Text>
          <Text className="mt-1 text-[13px] leading-5 text-muted-foreground">
            Enter the code somebody shared with you and you both get the reward.
            One code per account.
          </Text>

          <View className="mt-4 flex-row items-center gap-3">
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              placeholder="ABC1234"
              placeholderTextColor="#A89489"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={32}
              className="flex-1 rounded-xl border border-border bg-muted px-4 py-2.5 text-[15px] font-bold tracking-[2px] text-foreground"
            />
            <Pressable
              onPress={submit}
              disabled={code.trim().length < 4 || redeem.isPending}
              className="rounded-xl border border-border px-4 py-2.5"
              style={{
                opacity: code.trim().length < 4 || redeem.isPending ? 0.5 : 1,
              }}
            >
              {redeem.isPending ? (
                <ActivityIndicator size="small" />
              ) : (
                <Text className="text-[13px] font-semibold text-foreground">
                  Use code
                </Text>
              )}
            </Pressable>
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
            Share your code. When someone joins with it and confirms their email
            address, you both get whatever reward we are running.
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
  const [claimed, setClaimed] = useState<ClaimedPromo | null>(null);

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
              <OfferCard
                key={offer.grantId}
                offer={offer}
                onClaimed={setClaimed}
              />
            ))
          )}

          <RedeemCard />
          <ReferralCard />
        </ScrollView>
      )}

      <ClaimedModal result={claimed} onClose={() => setClaimed(null)} />
    </SafeAreaView>
  );
}
