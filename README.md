# Sameer TV Launcher

A custom, ad-free home screen for a Samsung Q60D (Tizen 8.0). Full-bleed
photo wallpaper, big-type app list (or a frosted-glass dock), one-tap
antenna channels, and a CleanFrame-style Appearance system you can
restyle from the couch. Built with — and heavily indebted to — the
approach in [CleanFrame](https://github.com/nthnclrk/CleanFrame).

## What it does

- **Home**: pinned apps in a large-type list — Live TV, Netflix, Disney+,
  ESPN, Prime Video, NFL, YouTube, Web Video Caster out of the box.
  Pin/unpin anything from All Apps; **Arrange mode** reorders Home with
  the arrow keys.
- **Live TV**: channel tiles for 2 CBS, 4 NBC, 7 ABC, 11 FOX (Los Angeles
  lineup — edit `CHANNELS` in `js/app.js`). Tuning hands off to the TV's
  own broadcast viewer, the way Samsung Home does it.
- **Appearance** (Settings → Appearance): live preview while you change
  - 16 wallpapers (Unsplash photos, credits in `assets/wp/CREDITS.md`)
    plus solid Dark / Light backgrounds
  - Layout: List or Dock
  - App display: icons + text, icons only, or text only
  - Focus style: Type (focused name grows) or Glass (frosted pill),
    with Soft / Frost / Clear tint glass materials
  - Font: System, Manrope, Geist, or Newsreader (all SIL OFL)
  - Home controls: icons, text, or both
  Preferences persist in localStorage.
- **Settings**: input switching (all ports), volume/mute, TV info, and a
  handoff to Samsung's own Settings.
- No ads, no recommendations, no tracking. Remote-driven: arrows, Enter,
  Return.

## Installing

This is a signed Tizen widget (package `SameerTV01`, app
`SameerTV01.Launcher`, `required_version` 3.0). You need your own Samsung
developer certificate tied to your TV's DUID, Developer Mode on, and
"Permit to install applications" done once. Install with:

```
sdb push <signed>.wgt /home/owner/share/tmp/sdk_tools/<name>.wgt
sdb shell 0 vd_appinstall SameerTV01.Launcher /home/owner/share/tmp/sdk_tools/<name>.wgt
```

Read [LEARNINGS.md](LEARNINGS.md) before debugging install failures —
on this firmware, `[118, -19]` almost certainly means your package ID is
over 10 characters or your `required_version` is too new, not a cert
problem.

## Caveats

- Built and tested on one TV: Samsung QN65Q6DAAFXZA, Tizen 8.0,
  firmware T-NKLAAKUC-2301.1. Other models/firmwares will differ.
- This installs a launcher *app*. Making the remote's Home button open
  it is a separate, deeper step (not in this repo yet).
- Keep TV firmware auto-update off if you rely on developer behaviors.

## Files

- `config.xml` — widget config
- `index.html` — app shell (views: Home, Live TV, All Apps, Appearance, Settings)
- `css/style.css` — all styling, including themes/materials
- `js/app.js` — all logic, dependency-free vanilla JS; Tizen APIs are
  guarded so the UI also runs in a desktop browser with mock data
  (handy for layout QA — append `?view=appearance&layout=dock&bg=peaks`
  style params in the preview to jump states)
- `assets/` — wallpaper + bundled icons, `assets/wp/` wallpapers,
  `assets/fonts/` fonts
