/**
 * Device frames and the depth primitives (storyboard §1.13, B9).
 * Server components: no hooks, no 'use client', no data.
 */
export { Perspective, PERSPECTIVE, MAX_TILT } from './perspective';
export { Slab, sheenOpacity, shadowPose, type SlabEdge, type SlabShadow } from './slab';
export { PhoneFrame, PHONE_RADIUS, PHONE_FONT, type SignalBars } from './phone-frame';
export { BrowserFrame, BROWSER_RADIUS, WindowDots, WINDOW_DOTS } from './browser-frame';
export { DesktopWindow, desktopRadius, type DesktopOS } from './desktop-window';
export { LockScreen, LockNotification, LOCK_WALLPAPER, lockDate, lockTime } from './lock-screen';
export { VirgoMark, AppIconTile } from './mark';
