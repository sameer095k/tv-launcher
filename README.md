# Sameer TV Launcher

A custom, ad-free home screen for Samsung Tizen TVs. Sidebar layout with Apps, Live TV (antenna), and Settings. Forest theme (gold on dark green).

## What it does

- **Apps**: Your pinned apps in a clean grid. Resolves installed apps by name matching (Netflix, Disney+, ESPN, Prime Video, NFL). No ads, no recommendations, no clutter.
- **Live TV**: One-tap tuning for antenna channels (2 CBS, 4 NBC, 7 ABC, 11 FOX — edit `js/app.js` for your lineup).
- **Settings**: Full app list ("App Store") — launch any installed app, pin/unpin to your home grid. Input switching (HDMI, etc.).

Remote-driven: arrows to move, Enter to select, Back to go home.

## ⚠️ Caveats — read before trying to install

**Samsung certificates required (Tizen 7.0+)**: On Tizen 7.0 and later (2022+ models), Samsung blocks installation of apps signed with self-signed certificates. You need a **Samsung-issued certificate**, which requires a one-time Samsung account sign-in. This is Samsung's policy, not a bug in this app.

**Recommended install path**: Use [TizenBrewInstaller Desktop](https://github.com/reisxd/TizenBrewInstaller/releases) (Mac/Windows/Linux). It handles Samsung account sign-in, certificate creation, signing, and installation over WiFi. No USB drive needed.

**USB is dead**: Samsung discontinued the USB demo-package installation method. Don't waste time on it.

**Developer Mode required**: Enable via Apps → `12345` → enter your PC's IP → restart TV.

**This is an app, not a system replacement**: Installing this gives you a launcher *app* you can open. It does not replace Samsung's Home screen or intercept the Home button. (True Home-button remapping requires deeper system modifications.)

**Model compatibility**: Built and tested for Samsung Q60D (Tizen 8.0). Should work on other Tizen 6.0+ TVs, but channel tuning and input switching depend on your model's API support. Antenna channel numbers in `js/app.js` are for Los Angeles — update for your area.

**No root or exploits needed**: This uses only official Tizen Web APIs. Do not root your TV to install this.

## Files

- `config.xml` — Tizen widget config (ID `sameer.tvlauncher`, v1.0.0)
- `index.html` — App shell
- `css/style.css` — Forest theme
- `js/app.js` — All logic, dependency-free. Tizen APIs are guarded so it renders in a desktop browser for preview.
- `icon.png` — App icon

## Preview in a browser

Open `index.html` in any browser. Tizen APIs are mocked — you'll see the full UI with sample data. Good for testing layout changes without a TV.
