import { View, Text, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth } from '@/src/hooks';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon, CameraIcon, ScissorsIcon, EyeIcon, PackageIcon, PresentationIcon,
  CalendarDaysIcon, ClockIcon, CheckIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CameraIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ScissorsIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(EyeIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PackageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PresentationIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ClockIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const EVENT_TYPES = [
  { key: 'shoot', label: 'Shoot', icon: CameraIcon, color: '#B66A40' },
  { key: 'editing', label: 'Editing', icon: ScissorsIcon, color: '#C17745' },
  { key: 'review', label: 'Review', icon: EyeIcon, color: '#8B5E3C' },
  { key: 'delivery', label: 'Delivery', icon: PackageIcon, color: '#6B8E4E' },
  { key: 'meeting', label: 'Meeting', icon: PresentationIcon, color: '#5B7B9A' },
];

function todayStr(): string { return new Date().toISOString().slice(0, 10); }

export default function CreateEventScreen() {
  const { date: initialDate } = useLocalSearchParams<{ date?: string }>();
  const { client } = useApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [eventType, setEventType] = useState('shoot');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState(initialDate || todayStr());
  const [eventTime, setEventTime] = useState('09:00');
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [showWsPicker, setShowWsPicker] = useState(false);

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces', user?.id],
    queryFn: async () => {
      const { data, error } = await client.from('workspaces').select('id, name, accent_color').eq('user_id', user?.id).order('name', { ascending: true });
      if (error) throw error; return data ?? [];
    },
    enabled: !!user?.id,
  });

  const selectedWs = workspaces.find(w => w.id === selectedWsId);
  const canSave = title.trim().length > 0;

  const createEvent = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const id = 'event-' + Date.now();
      const { error } = await client.from('schedule_events').insert({
        id, title: title.trim(), description: description.trim() || null,
        event_date: eventDate, event_time: eventTime, event_type: eventType,
        workspace_id: selectedWsId, user_id: user?.id, created_at: now,
      });
      if (error) throw error;
      return id;
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ['schedule_events'] });
      router.replace(`/schedule/${newId}`);
    },
    onError: () => Alert.alert('Error', 'Could not create event.'),
  });

  const activeType = EVENT_TYPES.find(t => t.key === eventType) || EVENT_TYPES[0];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[22px] font-bold tracking-tight">New Event</Text>
        </View>

        {/* Event Type */}
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">Event Type</Text>
          <View className="flex-row flex-wrap gap-2">
            {EVENT_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <Pressable key={t.key} onPress={() => setEventType(t.key)}
                  className={`rounded-xl px-4 py-2.5 flex-row items-center gap-2 active:scale-[0.96] ${eventType === t.key ? 'bg-primary' : 'bg-card'}`}
                  style={eventType !== t.key ? { shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : undefined}>
                  <Icon size={14} className={eventType === t.key ? 'text-white' : 'text-foreground'} />
                  <Text className={`text-sm font-semibold ${eventType === t.key ? 'text-white' : 'text-foreground'}`}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Title */}
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Title</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Look 2 — Studio Session" placeholderTextColor="#A89489"
            className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }} autoFocus />
        </View>

        {/* Description */}
        <View className="px-5 mt-4">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Description <Text className="font-medium normal-case tracking-normal">(optional)</Text></Text>
          <TextInput value={description} onChangeText={setDescription} placeholder="Details, location, notes..." placeholderTextColor="#A89489"
            multiline numberOfLines={3} textAlignVertical="top"
            className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2, minHeight: 72 }} />
        </View>

        {/* Date & Time */}
        <View className="px-5 mt-5 flex-row gap-3">
          <View className="flex-1">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Date</Text>
            <View className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-2" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <CalendarDaysIcon size={15} className="text-muted-foreground" />
              <TextInput value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DD" placeholderTextColor="#A89489"
                className="text-foreground text-sm flex-1" />
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Time</Text>
            <View className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-2" style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <ClockIcon size={15} className="text-muted-foreground" />
              <TextInput value={eventTime} onChangeText={setEventTime} placeholder="09:00" placeholderTextColor="#A89489"
                className="text-foreground text-sm flex-1" />
            </View>
          </View>
        </View>

        {/* Workspace */}
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Workspace <Text className="font-medium normal-case tracking-normal">(optional)</Text></Text>
          <Pressable onPress={() => setShowWsPicker(!showWsPicker)}
            className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:scale-[0.98]"
            style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            {selectedWs ? (
              <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: `${selectedWs.accent_color}22`, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: selectedWs.accent_color }}>{selectedWs.name.charAt(0)}</Text>
              </View>
            ) : null}
            <Text className="text-foreground text-sm flex-1">{selectedWs ? selectedWs.name : 'None'}</Text>
          </Pressable>
          {showWsPicker && (
            <View className="mt-2 bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <Pressable onPress={() => { setSelectedWsId(null); setShowWsPicker(false); }} className="px-4 py-3 active:bg-muted/30 flex-row items-center gap-3" style={{ borderBottomWidth: 1, borderBottomColor: '#F0E8E2' }}>
                <Text className="text-muted-foreground text-sm flex-1">None</Text>
                {!selectedWsId && <CheckIcon size={14} className="text-primary" />}
              </Pressable>
              {workspaces.map(w => (
                <Pressable key={w.id} onPress={() => { setSelectedWsId(w.id); setShowWsPicker(false); }} className="px-4 py-3 active:bg-muted/30 flex-row items-center gap-3">
                  <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: `${w.accent_color}22`, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: w.accent_color }}>{w.name.charAt(0)}</Text>
                  </View>
                  <Text className="text-foreground text-sm flex-1">{w.name}</Text>
                  {w.id === selectedWsId && <CheckIcon size={14} className="text-primary" />}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom actions */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pb-10 pt-4 bg-background flex-row gap-3">
        <Pressable onPress={() => router.back()} className="flex-1 bg-card rounded-2xl py-3.5 items-center active:scale-[0.97]"
          style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <Text className="text-foreground text-base font-semibold">Back</Text>
        </Pressable>
        <Pressable onPress={() => canSave && createEvent.mutate()} className={`flex-[2] rounded-2xl py-3.5 items-center active:scale-[0.97] ${canSave ? 'bg-primary' : 'bg-muted'}`} disabled={!canSave || createEvent.isPending}>
          <Text className={`text-base font-bold ${canSave ? 'text-white' : 'text-muted-foreground'}`}>{createEvent.isPending ? 'Creating...' : 'Create Event'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
