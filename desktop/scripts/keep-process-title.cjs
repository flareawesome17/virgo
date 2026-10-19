/*
 * Loaded ahead of the Next server with `node --require`, on macOS only.
 *
 * Next names its process on start (`process.title = 'next-server (v…)'`). On
 * macOS, libuv carries that out by checking the process in with Launch
 * Services as an application, using the info of the bundle the executable
 * sits in — and the bundled `node` sits in Virgo.app/Contents/MacOS. So the
 * server checked in as a second app: a "node" tile with the blank exec icon
 * appeared in the Dock beside Virgo every time the app opened.
 *
 * Assigning the title now only remembers it. Nothing reads it back except
 * Next itself, and Activity Monitor goes on showing "node", which is what the
 * process is.
 */
'use strict';

let title = process.title;

Object.defineProperty(process, 'title', {
  configurable: true,
  enumerable: true,
  get() {
    return title;
  },
  set(value) {
    title = String(value);
  },
});
