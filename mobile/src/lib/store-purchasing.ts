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
 * So on a phone there is no plan list at all: the Plans screen becomes "Your
 * plan", the one the account is on and what it includes, and a plan bought on
 * the web still shows, and can still be cancelled, there. Listing tiers that
 * cannot be had in the app — with "Coming soon" on them — is what App Review
 * rejected on 2026-11-04 under 2.2 ("premium plans that users aren't able to
 * use"). The web build of this app is a development preview, which is the only
 * place that compares them.
 */
export const SELLS_PLANS_HERE = Platform.OS === 'web';
