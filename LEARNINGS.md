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
- **Samsung's Settings / Apps panels appear to be unopenable from a web
  app.** Three recipes were tried for `com.samsung.tv.coba.setting`
  (and `com.samsung.tv.coba.apps`), all confirmed on screen by the TV's
  owner: (1) plain launch — accepted, nothing appears; (2) launch then
  hide your own app (`getCurrentApplication().hide()`) — Samsung Home's
  bar comes forward, the panel never does; (3) launch Samsung Home
  (`com.samsung.tv.csfs`) first so the panel's host is foreground, then
  launch the panel — the home bar rises, the panel launch reports
  success, and the panel still never appears. The panels seem to be
  internal surfaces of Samsung Home, reachable only through its own UI
  (or the remote's gear button). CleanFrame's docs likewise list TV
  settings as unconfirmed. SDB `execute` on these IDs does start the
  processes — starting is not showing.
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
- A scroll window sized with `top` + `bottom` + `overflow: hidden`
  rendered the whole home list **invisible** on the TV while desktop
  Chromium rendered it fine. Give the window an explicit `height`
  instead. Relatedly, scroll-into-view math must be done in layout
  coordinates (`offsetTop` / `clientHeight` / `scrollHeight`): mixing
  `getBoundingClientRect()` (post-transform pixels) with `scrollTop`
  (layout pixels) can scroll content clean out of its window.
- Content plates can overflow the bottom of the TV screen even when
  they fit on desktop — the TV lays the same plate out narrower, text
  wraps to more lines, and rows grow taller. Anything you need a human
  to read or photograph (diagnostics!) belongs at the **top** of the
  plate, not the bottom.
- The dock was invisible on the TV across several builds that rendered
  perfectly in desktop Chromium (v1.5–v1.7: transform centering,
  backdrop-filter, max-content width, CSS-variable background, and
  left/right insets + bottom anchoring were each removed in turn).
  **Fix (confirmed on the TV in v1.8): explicit `left/top/width/height`
  in px — the CleanFrame pattern.** The dock was the only element in
  the app anchored with `bottom`; everything anchored from the top
  painted fine, and the moment the dock was top-anchored it appeared.
  Lesson: on this TV's web runtime, don't anchor home-screen elements
  with `bottom` (or center them with transforms/auto margins) — give
  them explicit top-left geometry.

## Startup performance

- `getAppsInfo()` scans 400+ apps and takes a second or more on the
  TV; an init that waits for it before first paint feels broken.
  Cache the slim app list (id, name, iconPath, show) in localStorage,
  seed from it synchronously for an instant first paint, then refresh
  when the real scan lands (re-render, preserving focus by pin ID).
- Build big lists lazily: the All Apps list is 200+ DOM rows — create
  it on first open, not at startup. Same for API-backed rows
  (`getSourceList`) in Settings.

## Moving files to the build machine

- Large file transfers over an SSH/Tailscale proxy can truncate
  mid-file (a ~900 KB file repeatedly arrived cut at exactly 229,376
  bytes). Split big files into sub-200 KB chunks, verify each chunk's
  size, reassemble, and **md5-verify the whole file** before signing.
