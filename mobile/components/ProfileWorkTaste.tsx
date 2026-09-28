import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BookmarkIcon, ImageIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { useProfileTaste, useProfileWork, useTheme } from '@/src/hooks';
import { PALETTES } from '@/theme';

for (const Icon of [BookmarkIcon, ImageIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * The two halves of a creative: what they made, and what they respond to.
 *
 * One component for both profiles, so the page somebody visits and the page you
 * see of yourself are drawn from the same shape — the old profile had three
 * screens claiming to show the same thing and disagreeing about it.
 *
 * Neither half is the portfolio. `portfolio_items` still exists and still
 * renders below this; showcases are a different object and both are shown until
 * the old one is migrated across.
 */
export function ProfileWorkTaste({
  handle,
  isSelf,
  firstName,
}: {
  handle: string | undefined;
  isSelf: boolean;
  firstName: string;
}) {
  const [tab, setTab] = useState<'work' | 'taste'>('work');
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;

  const work = useProfileWork(handle);
  const taste = useProfileTaste(handle);

  return (
    <View className="mt-6">
      <View accessibilityRole="tablist" className="flex-row border-b border-border mx-5">
        <Tab label="Work" on={tab === 'work'} onPress={() => setTab('work')} />
        <Tab label="Taste" on={tab === 'taste'} onPress={() => setTab('taste')} />
      </View>

      {tab === 'work' ? (
        work.isLoading ? (
          <Spinner colour={palette.primary} />
        ) : work.loadFailed && work.showcases.length === 0 ? (
          <View className="px-5 pt-4">
            <LoadFailed what="this work" onRetry={() => work.refetch()} compact />
          </View>
        ) : work.showcases.length === 0 ? (
          <Empty
            icon="work"
            title={isSelf ? 'You have not posted anything yet' : `${firstName} has not posted yet`}
            body={
              isSelf
                ? 'A showcase is a piece of work and a note on how you made it. It goes on your profile and into the feed.'
                : 'When they post work, it will show up here.'
            }
            action={isSelf ? { label: 'Post a showcase', to: '/showcase/new' } : undefined}
          />
        ) : (
          <View className="flex-row flex-wrap gap-2 px-5 pt-4">
            {work.showcases.map((showcase) => (
              <Pressable
                key={showcase.id}
                onPress={() => router.push(`/showcase/${showcase.id}`)}
                accessibilityRole="button"
                accessibilityLabel={showcase.title ?? 'Open this showcase'}
                style={{ width: '48%' }}
              >
                <View className="rounded-xl overflow-hidden bg-muted" style={{ height: 132 }}>
                  <RemoteImage
                    source={{ uri: showcase.pieces[0]?.url }}
                    style={{ width: '100%', height: 132 }}
                    contentFit="cover"
                  />
                  {showcase.pieces.length > 1 && (
                    <View className="absolute right-1.5 top-1.5 rounded-full bg-foreground/55 px-2 py-0.5">
                      <Text className="text-background text-[10px] font-bold">
                        {showcase.pieces.length}
                      </Text>
                    </View>
                  )}
                </View>
                {showcase.title ? (
                  <Text className="text-foreground text-[12px] font-bold mt-1.5" numberOfLines={1}>
                    {showcase.title}
                  </Text>
                ) : null}
                <Text className="text-muted-foreground text-[10.5px]" numberOfLines={1}>
                  {[showcase.category, showcase.keptCount > 0 ? `${showcase.keptCount} kept` : null]
                    .filter(Boolean)
                    .join(' · ') || 'Showcase'}
                </Text>
              </Pressable>
            ))}
          </View>
        )
      ) : taste.isLoading ? (
        <Spinner colour={palette.primary} />
      ) : taste.loadFailed && taste.shelves.length === 0 ? (
        <View className="px-5 pt-4">
          <LoadFailed what="these shelves" onRetry={() => taste.refetch()} compact />
        </View>
      ) : taste.shelves.length === 0 ? (
        <Empty
          icon="taste"
          title={isSelf ? 'Nothing kept yet' : `${firstName} has not kept anything yet`}
          body={
            isSelf
              ? 'Keep work you respond to from the feed. What you keep says as much about you as what you make.'
              : 'What somebody keeps says as much about them as what they make.'
          }
          action={isSelf ? { label: 'Open the feed', to: '/feed' } : undefined}
        />
      ) : (
        <View className="flex-row flex-wrap gap-2 px-5 pt-4">
          {taste.shelves.map((shelf) => (
            <Pressable
              key={shelf.id}
              onPress={() => router.push(`/shelf/${shelf.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${shelf.name}, ${shelf.count} kept`}
              style={{ width: '48%' }}
            >
              <View className="rounded-xl overflow-hidden bg-muted" style={{ height: 112 }}>
                {shelf.coverUrl ? (
                  <RemoteImage
                    source={{ uri: shelf.coverUrl }}
                    style={{ width: '100%', height: 112 }}
                    contentFit="cover"
                  />
                ) : (
                  <View className="flex-1 items-center justify-center">
                    <BookmarkIcon size={20} className="text-muted-foreground" />
                  </View>
                )}
              </View>
              <Text className="text-foreground text-[12px] font-bold mt-1.5" numberOfLines={1}>
                {shelf.name}
              </Text>
              <Text className="text-muted-foreground text-[10.5px]">
                {shelf.count} kept{shelf.isPublic ? '' : ' · Private'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function Tab({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      className="flex-1 min-h-11 items-center justify-center"
    >
      <Text className={`text-[13.5px] ${on ? 'text-foreground font-bold' : 'text-muted-foreground font-semibold'}`}>
        {label}
      </Text>
      {on && <View className="absolute left-0 right-0 bottom-0 h-[2.5px] bg-primary" />}
    </Pressable>
  );
}

function Spinner({ colour }: { colour: string }) {
  return (
    <View className="py-10 items-center">
      <ActivityIndicator color={colour} />
    </View>
  );
}

function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: 'work' | 'taste';
  title: string;
  body: string;
  action?: { label: string; to: string };
}) {
  const Icon = icon === 'work' ? ImageIcon : BookmarkIcon;
  return (
    <View className="items-center px-8 py-10">
      <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-4">
        <Icon size={24} className="text-primary" />
      </View>
      <Text className="text-foreground text-[15px] font-bold text-center">{title}</Text>
      <Text className="text-muted-foreground text-[13px] text-center mt-2 leading-5">{body}</Text>
      {action && (
        <Pressable
          onPress={() => router.push(action.to)}
          accessibilityRole="button"
          className="mt-5 min-h-11 bg-action rounded-xl px-6 items-center justify-center active:scale-[0.98]"
        >
          <Text className="text-action-foreground text-[13px] font-bold">{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}
