// Run: node --experimental-strip-types --test src/lib/alerts.test.mjs
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

/*
 * A browser, faked on globalThis: `window` is the global object, as it is in a
 * page, so `'Notification' in window` and `'__TAURI__' in window` read what
 * each test puts there.
 */
const shown = [];
let requests = 0;
let answer = 'granted';
class FakeNotification {
  static permission = 'default';
  static async requestPermission() {
    requests++;
    FakeNotification.permission = answer;
    return answer;
  }
  constructor(title, options) {
    shown.push({ title, ...options });
  }
  close() {}
}
const page = { visibilityState: 'visible', focused: true };
globalThis.window = globalThis;
globalThis.Notification = FakeNotification;
globalThis.document = {
  get visibilityState() {
    return page.visibilityState;
  },
  hasFocus: () => page.focused,
  title: 'Virgo',
};
globalThis.focus = () => {};

const { ensureDesktopNotificationPermission, messageAlertPlan, notifyMessage } = await import(
  './alerts.ts'
);

beforeEach(() => {
  shown.length = 0;
  requests = 0;
  answer = 'granted';
  FakeNotification.permission = 'default';
  page.visibilityState = 'visible';
  page.focused = true;
  delete globalThis.__TAURI__;
});

describe('ensureDesktopNotificationPermission', () => {
  it('asks by itself inside the desktop app, where the answer is the system’s and costs nothing', async () => {
    globalThis.__TAURI__ = {};
    assert.equal(await ensureDesktopNotificationPermission(), true);
    assert.equal(requests, 1);
    assert.equal(Notification.permission, 'granted');
  });

  it('asks again even after a "denied" there: no browser is keeping score', async () => {
    globalThis.__TAURI__ = {};
    FakeNotification.permission = 'denied';
    assert.equal(await ensureDesktopNotificationPermission(), true);
    assert.equal(requests, 1);
  });

  it('does not ask when it already has it', async () => {
    globalThis.__TAURI__ = {};
    FakeNotification.permission = 'granted';
    assert.equal(await ensureDesktopNotificationPermission(), true);
    assert.equal(requests, 0);
  });

  it('never prompts in a browser, which penalises a site that asks unprompted', async () => {
    assert.equal(await ensureDesktopNotificationPermission(), false);
    assert.equal(requests, 0);
  });
});

describe('notifyMessage', () => {
  const alert = () => notifyMessage({ title: 'Ana', body: 'hi', tag: 'c1' });

  it('shows a system alert while the window is behind another app', () => {
    FakeNotification.permission = 'granted';
    page.focused = false;
    alert();
    assert.deepEqual(shown.map((n) => n.title), ['Ana']);
  });

  it('shows one while minimised', () => {
    FakeNotification.permission = 'granted';
    page.visibilityState = 'hidden';
    page.focused = false;
    alert();
    assert.equal(shown.length, 1);
  });

  it('stays quiet for someone looking straight at it', () => {
    FakeNotification.permission = 'granted';
    alert();
    assert.equal(shown.length, 0);
  });

  it('stays quiet without permission', () => {
    page.focused = false;
    alert();
    assert.equal(shown.length, 0);
  });
});

describe('messageAlertPlan', () => {
  it('raises the system alert for the open conversation too — notifyMessage decides by focus', () => {
    // The desktop app is usually left on a chat while its owner works in
    // something else; a reply in that very chat raised no alert at all.
    assert.deepEqual(messageAlertPlan({ mine: false, looking: true, muted: false }), {
      chime: true,
      buzz: false,
      system: true,
    });
  });

  it('alerts every way for another conversation', () => {
    assert.deepEqual(messageAlertPlan({ mine: false, looking: false, muted: false }), {
      chime: true,
      buzz: true,
      system: true,
    });
  });

  it('says nothing for your own message or a muted chat', () => {
    const none = { chime: false, buzz: false, system: false };
    assert.deepEqual(messageAlertPlan({ mine: true, looking: false, muted: false }), none);
    assert.deepEqual(messageAlertPlan({ mine: false, looking: false, muted: true }), none);
  });
});
