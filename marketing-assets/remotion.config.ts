/**
 * Remotion CLI and Studio config for the story site's stills and videos.
 *
 * The Node APIs ignore this file, so scripts/render-*.mjs drive the CLI
 * (`remotion bundle`, then `remotion still` / `remotion render` against that
 * bundle), and everything below applies to every render.
 *
 * All configuration options: https://remotion.dev/docs/config
 */
import fs from "node:fs";
import path from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

/**
 * The CLI evaluates this file with the working directory set to the Remotion
 * root (marketing-assets/), and calls the bundler override later from
 * wherever it was started, so the paths are fixed now.
 */
const ROOT = process.cwd();
const WEB_SRC = path.resolve(ROOT, "..", "web", "src");
const MODULES = path.join(ROOT, "node_modules");

Config.setRspack(true);
/** PNG frames: JPEG frames put 8×8 blocks into the near-black haze before any encode. */
Config.setVideoImageFormat("png");
Config.setOverwriteOutput(true);

/**
 * The browser for renders. Remotion downloads Chrome Headless Shell into
 * node_modules/.remotion on first use; until someone runs
 * `npx remotion browser ensure`, use the Playwright headless shell already on
 * this machine, so a render never has to download anything.
 * scripts/render-all.mjs makes the same choice (and honours REMOTION_BROWSER).
 */
const playwrightShell = (): string | null => {
  const base = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright");
  if (!process.env.LOCALAPPDATA || !fs.existsSync(base)) return null;
  const shells = fs
    .readdirSync(base)
    .filter((d) => /^chromium_headless_shell-\d+$/.test(d))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  for (const d of shells) {
    const exe = path.join(base, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe");
    if (fs.existsSync(exe)) return exe;
  }
  return null;
};
const BROWSER = process.env.REMOTION_BROWSER ?? (fs.existsSync(path.join(MODULES, ".remotion")) ? null : playwrightShell());
if (BROWSER) Config.setBrowserExecutable(BROWSER);

Config.overrideBundlerConfig((current) => {
  // `@` is the web app's alias: the sky lab's choreography and the story's
  // components import each other through it. React, React DOM and the JSX
  // runtime always come from this package, so a module imported from ../web
  // can never pull in web/node_modules' copy (two Reacts break hooks).
  const one = (request: string) => require.resolve(request, { paths: [MODULES] });
  const withSite = {
    ...current,
    resolve: {
      ...current.resolve,
      alias: {
        ...(current.resolve?.alias as Record<string, string | false | string[]>),
        "@": WEB_SRC,
        "react/jsx-runtime": one("react/jsx-runtime"),
        "react/jsx-dev-runtime": one("react/jsx-dev-runtime"),
        "react-dom/client": one("react-dom/client"),
        "react-dom$": one("react-dom"),
        react$: one("react"),
      },
    },
  };
  return enableTailwind(withSite);
});
