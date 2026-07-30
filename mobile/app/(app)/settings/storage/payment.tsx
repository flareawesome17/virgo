import { View, Text, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon, CreditCardIcon, LockIcon, ShieldIcon, CheckIcon,
  CircleIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CreditCardIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ShieldIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function PaymentMethodScreen() {
  const { plan: planKey = 'creator', cycle = 'monthly' } = useLocalSearchParams<{ plan?: string; cycle?: string }>();
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [name, setName] = useState('Riya Kapoor');
  const [saved, setSaved] = useState(false);
  const [processing, setProcessing] = useState(false);

  const canPay = cardNumber.replace(/\s/g, '').length >= 13 && expiry.length >= 4 && cvc.length >= 3 && name.trim().length > 0;

  const handlePay = () => {
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      router.replace(`/settings/storage/success?plan=${planKey}&cycle=${cycle}`);
    }, 1800);
  };

  const formatCard = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">Payment</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">Secure checkout via Stripe</Text>
          </View>
        </View>

        {/* Card preview */}
        <View className="mx-5 mt-5 rounded-2xl p-5" style={{ backgroundColor: '#1E1B18', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
          <View className="flex-row items-center justify-between mb-8">
            <Text className="text-white/60 text-xs font-semibold uppercase tracking-[2px]">Virgo</Text>
            <CreditCardIcon size={16} className="text-white/60" />
          </View>
          <Text className="text-white text-lg font-mono tracking-[2px] mb-6">
            {cardNumber || '···· ···· ···· ····'}
          </Text>
          <View className="flex-row justify-between">
            <View>
              <Text className="text-white/40 text-[9px] font-semibold uppercase tracking-wide">Cardholder</Text>
              <Text className="text-white/80 text-xs mt-0.5">{name || 'Riya Kapoor'}</Text>
            </View>
            <View>
              <Text className="text-white/40 text-[9px] font-semibold uppercase tracking-wide">Expires</Text>
              <Text className="text-white/80 text-xs mt-0.5">{expiry || 'MM/YY'}</Text>
            </View>
          </View>
        </View>

        {/* Form */}
        <View className="px-5 mt-6 gap-4">
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Card Number</Text>
            <TextInput value={cardNumber} onChangeText={(v) => setCardNumber(formatCard(v))}
              placeholder="1234 5678 9012 3456" placeholderTextColor="#A89489" keyboardType="number-pad"
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }} />
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Expiry</Text>
              <TextInput value={expiry} onChangeText={(v) => setExpiry(formatExpiry(v))}
                placeholder="MM/YY" placeholderTextColor="#A89489" keyboardType="number-pad" maxLength={5}
                className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }} />
            </View>
            <View className="flex-1">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">CVC</Text>
              <TextInput value={cvc} onChangeText={(v) => setCvc(v.replace(/\D/g, '').slice(0, 4))}
                placeholder="123" placeholderTextColor="#A89489" keyboardType="number-pad" maxLength={4} secureTextEntry
                className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }} />
            </View>
          </View>
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Name on Card</Text>
            <TextInput value={name} onChangeText={setName}
              placeholder="Riya Kapoor" placeholderTextColor="#A89489"
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }} />
          </View>
        </View>

        {/* Save card toggle */}
        <Pressable onPress={() => setSaved(!saved)} className="mx-5 mt-5 flex-row items-center gap-3">
          {saved ? <CheckIcon size={18} className="text-primary" /> : <CircleIcon size={18} className="text-muted-foreground" />}
          <Text className="text-foreground text-sm">Save card for future payments</Text>
        </Pressable>
      </ScrollView>

      {/* Pay button */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pb-10 pt-4 bg-background">
        <View className="flex-row items-center gap-2 mb-3 justify-center">
          <LockIcon size={11} className="text-muted-foreground" />
          <Text className="text-muted-foreground text-[11px]">Payments are encrypted & secure</Text>
        </View>
        <Pressable onPress={handlePay} disabled={!canPay || processing}
          className={`rounded-2xl py-3.5 items-center active:scale-[0.97] ${canPay ? 'bg-primary' : 'bg-muted'}`}
          style={canPay ? { shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 } : undefined}>
          <Text className={`text-base font-bold ${canPay ? 'text-white' : 'text-muted-foreground'}`}>
            {processing ? 'Processing...' : 'Pay Now'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
