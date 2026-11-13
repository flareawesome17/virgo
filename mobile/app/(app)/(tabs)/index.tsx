import { useEffect, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useComposedEventHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth, useProfileSettings, usePromoOffers, useTheme } from '@/src/hooks';
import { useChromeScroll } from '@/src/providers/ChromeProvider';
import { TabScreen, useTabBottomInset } from '@/components';
import { ProfileWorkTaste } from '@/components/ProfileWorkTaste';
import { SettingsList } from '@/components/SettingsList';
import { HomeHeader } from '@/components/home/HomeHeader';
import { ProfileAbout } from '@/components/home/ProfileAbout';
import { TodayTab } from '@/components/home/TodayTab';
import { HOME_TABS, HomeTabBar, type HomeTab } from '@/components/home/HomeTabBar';
import { DashboardMark } from '@/components/home/DashboardMark';
import { PALETTES } from '@/theme';

/**
 * Where the top bar's mark turns into your name, counted back from where the
 * tabs reach the top: over the last of the greeting going under the bar, so
 * one name hands over to the other. The row above the tabs is about 76pt
 * tall, so this has to be well inside that.
 */
const NAME_FADE = { from: 36, to: 4 };

const isHomeTab = (value: string | undefined): value is HomeTab =>
  !!value && (HOME_TABS as readonly string[]).includes(value);

/**
 * The Dashboard, which is also your profile.
 *
 * The day, a greeting and your photo in one row, then four tabs: Home (your
 * day), Work (what you posted and kept), About (your profile, as a card),
 * and Settings. The row scrolls away and the tabs stay under the top bar.
 * Your photo left the top bar for this — it opened your profile and
 * settings, and both are here — and "Your profile" and the Settings tab
 * became these tabs.
 *
 * The top was the whole profile at first: cover, a large photo and three
 * counts, which left the day starting two thirds of the way down the screen.
 *
 * `?tab=work|about|settings` opens a tab, so the old /profile and /settings
 * addresses land on theirs.
 */
export default function DashboardScreen() {
  const chromeScroll = useChromeScroll();
  const bottomInset = useTabBottomInset();
  const queryClient = useQueryClient();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { user } = useAuth();
  const { settings } = useProfileSettings();
  const { offers: rewards } = usePromoOffers(!!user?.id);

  const params = useLocalSearchParams<{ tab?: string }>();
  const requested: HomeTab = isHomeTab(params.tab) ? params.tab : 'home';
  const [tab, setTab] = useState<HomeTab>(requested);
  useEffect(() => {
    setTab(requested);
  }, [requested]);

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(0);
  const heroHeight = useSharedValue(0);
  // Where the tabs reach the top: the profile's height.
  const [stickAt, setStickAt] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const trackScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const onScroll = useComposedEventHandler([chromeScroll, trackScroll]);

  const revealName = useDerivedValue(() => {
    if (heroHeight.value === 0) return 0;
    const stick = heroHeight.value;
    return interpolate(
      scrollY.value,
      [stick - NAME_FADE.from, stick - NAME_FADE.to],
      [0, 1],
      Extrapolation.CLAMP,
    );
  });

  // Kept in the address as well as in state, as Settings did with its
  // halves: otherwise a link asking for a tab you had already left by hand
  // would carry the same param as before, change nothing, and leave you where
  // you were.
  const show = (next: HomeTab) => {
    // With the profile scrolled away, the next tab opens at its own top,
    // under the tabs, instead of wherever the last one had been read to.
    if (stickAt > 0 && scrollY.value > stickAt) {
      scrollRef.current?.scrollTo({ y: stickAt, animated: false });
    }
    setTab(next);
    router.setParams({ tab: next === 'home' ? undefined : next });
  };

  // Everything on screen, the profile included: a bio or a photo changed on
  // the web shows once the session is fetched again too.
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: 'active' });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <TabScreen leading={<DashboardMark reveal={revealName} />}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // A style, not className: NativeWind does not reach Reanimated's
        // components.
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[1]}
        onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
        contentContainerStyle={{ paddingBottom: bottomInset }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.primary} />
        }
      >
        <HomeHeader
          onPressPhoto={() => show('about')}
          onLayout={(event) => {
            const height = event.nativeEvent.layout.height;
            heroHeight.value = height;
            setStickAt(height);
          }}
        />

        <HomeTabBar value={tab} onChange={show} rewards={rewards.length} />

        {/* At least a screen tall, so even a short tab can scroll the profile
            away and keep the tabs where they were. */}
        <View style={{ minHeight: viewport }}>
          {tab === 'home' ? (
            <TodayTab />
          ) : tab === 'work' ? (
            <ProfileWorkTaste
              handle={settings?.handle ?? undefined}
              isSelf
              firstName="You"
              workLabel="Posts"
              className="mt-5"
            />
          ) : tab === 'about' ? (
            <ProfileAbout />
          ) : (
            <SettingsList />
          )}
        </View>
      </Animated.ScrollView>
    </TabScreen>
  );
}
