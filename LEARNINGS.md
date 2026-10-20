# Learnings — building a custom launcher on a Samsung Q60D (Tizen 8.0, firmware T-NKLAAKUC-2301.1)

Hard-won facts from developing this launcher on a real TV. Most of these
are firmware-specific and were found by bisection against a known-good
package (TizenBrew's release widget). Documented so nobody has to
re-derive them.

## Installing widgets

- `vd_appinstall` fails with `[118, -19] "Parsing error"` (~0.4 s in) for
  two unrelated reasons on this firmware:
  1. **Package IDs longer than 10 characters.** `SameerTV01` (10) works;
     anything longer is rejected at parse time.
  2. **`required_version="8.0"` (and `"6.5"`) in config.xml.** Use
     `required_version="3.0"` — the value TizenBrew ships.
  Certificate era, signer CLI version, zip layout, icons and content were
  all bisected and exonerated; the original Samsung cert was fine.
- Correct install protocol: push the .wgt to
  `/home/owner/share/tmp/sdk_tools/<name>.wgt`, then
  `sdb shell 0 vd_appinstall <app_id> <remote_path>` — **two arguments**.
  The one-argument form silently does nothing.
- "Permit to install applications" (Device Manager) must be done once so
  the TV registers the signing profile's device profile.
- Keep TV **auto-update off**: a firmware update can change any of the
  behaviors below (and can patch developer vectors you may rely on).

## Launching things from inside a web app

- `tizen.application.launch()` on Samsung's component apps
  (`com.samsung.tv.coba.livetv`, `com.samsung.tv.coba.setting`) reports
  **success but the app never takes the screen**. The success callback
  means "accepted", not "visible". Don't trust it as a visibility signal.
- Live TV the way Samsung Home does it: switch the source to TV first
  (`tvwindow.setSource`), then launch **`org.tizen.tv-viewer`** — the
  TV's own broadcast player (it's the boot/startup app, always resident).
- For Settings, launch `com.samsung.tv.coba.setting` and then **hide your
  own app** (`tizen.application.getCurrentApplication().hide()`) so the
  settings app can come forward.
- `window.webapis` (e.g. `webapis.productinfo` for model/firmware/DUID)
  is undefined unless the page includes
  `<script src="$WEBAPIS/webapis/webapis.js"></script>`.

## Channel tuning

- Samsung's `tvchannel.tune()` wants a **single callback object**
  `{onsuccess, onerror}`. Passing separate function callbacks throws
  `TypeMismatchError: Argument 'callback' should be an object`.
- `getChannelList(..., "AIR")` throws `TypeMismatchError: Cannot convert
  AIR to enum` on this TV — the AIR mode string is invalid here. The
  default (no-mode) list is the tuner's own list and works.
- A successful tune happens *behind* your full-screen app. Hand off to
  the TV viewer (above) to actually show the tuned channel.

## App list hygiene

- `getAppsInfo()` returns a superset of the app drawer (services,
  previews, workers, components). To approximate the drawer: skip
  `show === false` entries (except your home defaults/pins), skip names
  matching /(service|worker|preview|promotion|plugin|test|sdk|factory|daemon)/i,
  and skip the `com.samsung.tv.cobalt-yt` decoy.
- Resolve home tiles by **verified app ID first**; name matching alone
  grabs wrong entries (e.g. "Disney Plus Preview Service").
- Some apps' `iconPath` values are broken on this TV (YouTube rendered a
  wrong swirl; Prime Video rendered blank). Bundle fallback icons for
  apps whose TV-provided icon misbehaves.

## Rendering

- The wallpaper must be a **baseline (non-progressive) JPEG at exactly
  1920×1080**, loaded via an `<img>` element. A progressive JPEG as a CSS
  background rendered as a black screen on the TV while working fine in
  desktop Chrome.
- The app may be granted a stage smaller than 1920 CSS px at launch, and
  a resize event is not guaranteed when it settles. Lay out at
  1920×1080 and `transform: scale()` the root to the measured stage;
  re-run the fit on an interval for the first seconds and on view
  changes.
- Icon repaints on focus: avoid transitions on focus changes; scale
  instantly and set `backface-visibility: hidden` on icon images.

## Moving files to the build machine

- Large file transfers over an SSH/Tailscale proxy can truncate
  mid-file (a ~900 KB file repeatedly arrived cut at exactly 229,376
  bytes). Split big files into sub-200 KB chunks, verify each chunk's
  size, reassemble, and **md5-verify the whole file** before signing.
