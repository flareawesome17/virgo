import { Platform } from 'react-native';

/**
 * Whether this build may sell a plan.
 *
 * Not from the App Store or Play builds. A storage plan is a digital service,
 * and both stores require their own billing for those — App Store 3.1.1, Play's
 * Payments policy — so opening PayMongo checkout from the app is a rejection
 * at review, or a removal after it. Neither may the app send people elsewhere
 * to buy one: a link or a "buy it on the web" counts as the same thing.
 *
 * So on a phone the plans are information — what each includes and which one
 * you are on — and a plan bought on the web still shows, and can still be
 * cancelled, here. The web build of this app is a development preview, which
 * is the only place this is true.
 */
export const SELLS_PLANS_HERE = Platform.OS === 'web';
