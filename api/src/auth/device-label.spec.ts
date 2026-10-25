import { describeDevice, sessionClient } from './device-label';

/**
 * The words a person uses to decide "that one isn't mine", for the sign-in
 * email and the Devices list alike.
 */

const IOS_APP = 'Virgo/9 CFNetwork/3896.100.1.2.1 Darwin/27.0.0';
const ANDROID_APP = 'okhttp/4.12.0';
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';

describe('sessionClient', () => {
  it('knows the phone apps by their HTTP stacks', () => {
    expect(sessionClient(IOS_APP)).toBe('ios');
    expect(sessionClient(ANDROID_APP)).toBe('android');
  });

  it('tells the desktop app from Edge by the origin it serves the app from', () => {
    expect(sessionClient(EDGE_WINDOWS, 'http://127.0.0.1:41730')).toBe('desktop');
    expect(sessionClient(EDGE_WINDOWS, 'https://web.virgo.ph')).toBe('web');
    expect(sessionClient(EDGE_WINDOWS)).toBe('web');
  });

  it('says nothing rather than guess', () => {
    expect(sessionClient('curl/8.4.0')).toBeNull();
    expect(sessionClient(undefined)).toBeNull();
  });
});

describe('describeDevice', () => {
  it('names the phone app, and admits an iPhone and an iPad look alike', () => {
    expect(describeDevice(IOS_APP, 'ios')).toEqual({ device: 'iPhone or iPad', app: 'Virgo app' });
    expect(describeDevice(ANDROID_APP, 'android')).toEqual({
      device: 'Android phone',
      app: 'Virgo app',
    });
  });

  it('calls the desktop app what it is, not "Edge"', () => {
    expect(describeDevice(EDGE_WINDOWS, 'desktop')).toEqual({
      device: 'Windows',
      app: 'Virgo desktop app',
    });
    expect(describeDevice(SAFARI_MAC, 'desktop')).toEqual({ device: 'Mac', app: 'Virgo desktop app' });
  });

  it('names a browser and the machine it is on', () => {
    expect(describeDevice(CHROME_WINDOWS, 'web')).toEqual({
      device: 'Windows',
      app: 'Chrome, on the web',
    });
    expect(describeDevice(SAFARI_IPHONE, 'web')).toEqual({
      device: 'iPhone',
      app: 'Safari, on the web',
    });
  });

  it('works out a session recorded before clients were, from its User-Agent', () => {
    expect(describeDevice(IOS_APP, null)).toEqual({ device: 'iPhone or iPad', app: 'Virgo app' });
    expect(describeDevice(EDGE_WINDOWS, null)).toEqual({
      device: 'Windows',
      app: 'Edge, on the web',
    });
    expect(describeDevice(null, null)).toEqual({
      device: 'Unknown device',
      app: 'Signed in to Virgo',
    });
  });
});
