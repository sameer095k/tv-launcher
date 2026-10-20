/* Sameer TV Launcher — 10-foot UI, remote-driven, dependency-free.
 * All tizen.* access goes through TZ, which falls back to MockTizen when
 * running outside the TV (e.g. desktop browser preview): tiles still render,
 * actions log to the console instead of touching hardware. */
(function () {
"use strict";

/* ================= Mock (desktop preview) ================= */
var MOCK_APPS = [
  { id: "com.netflix.ninja",   name: "Netflix" },
  { id: "com.disney.disneyplus", name: "Disney+" },
  { id: "com.espn.watch",      name: "ESPN" },
  { id: "com.amazon.amazonvideo", name: "Prime Video" },
  { id: "com.nfl.mobile",      name: "NFL" },
  { id: "com.google.youtube",  name: "YouTube" },
  { id: "instantbit.webvideocaster", name: "Web Video Caster" },
  { id: "com.spotify.tv",      name: "Spotify" }
];
var MOCK_CHANNELS = [
  { major: 2,  minor: 1, channelName: "KCBS" },
  { major: 4,  minor: 1, channelName: "KNBC" },
  { major: 7,  minor: 1, channelName: "KABC" },
  { major: 11, minor: 1, channelName: "KTTV" }
];
var MockTizen = {
  application: {
    getAppsInfo: function (onSuccess, onError) {
      console.log("[mock tizen] application.getAppsInfo()");
      setTimeout(function () { onSuccess(MOCK_APPS.slice()); }, 100);
    },
    launch: function (id, onSuccess, onError) {
      console.log("[mock tizen] application.launch(" + id + ")");
      if (onSuccess) setTimeout(onSuccess, 200);
    }
  },
  tvchannel: {
    getChannelList: function (onSuccess, onError, mode) {
      console.log("[mock tizen] tvchannel.getChannelList(mode=" + mode + ")");
      setTimeout(function () { onSuccess(MOCK_CHANNELS.slice()); }, 150);
    },
    tune: function (ch, cb, onError) {
      console.log("[mock tizen] tvchannel.tune(" + ch.major + "." + ch.minor + " " + ch.channelName + ")");
      setTimeout(function () {
        if (cb && typeof cb === "object" && cb.onsuccess) cb.onsuccess();
        else if (typeof cb === "function") cb();
      }, 300);
    }
  },
  systeminfo: {
    getPropertyValue: function (prop, onSuccess, onError) {
      console.log("[mock tizen] systeminfo.getPropertyValue(" + prop + ")");
      setTimeout(function () { onSuccess({ connected: [
        { type: "TV", number: 1 }, { type: "HDMI", number: 1 }, { type: "HDMI", number: 2 }
      ] }); }, 150);
    }
  },
  tvwindow: {
    setSource: function (src, onSuccess, onError) {
      console.log("[mock tizen] tvwindow.setSource(" + src + ")");
      setTimeout(function () { if (onSuccess) onSuccess(); }, 200);
    },
    getSourceList: function (onSuccess, onError) {
      console.log("[mock tizen] tvwindow.getSourceList()");
      setTimeout(function () {
        onSuccess([{ type: "TV" }, { type: "HDMI", number: 1 }, { type: "HDMI", number: 2 }, { type: "HDMI", number: 3 }]);
      }, 120);
    }
  },
  tvaudiocontrol: {
    _v: 25, _mute: false,
    getVolume: function () { return this._v; },
    setVolume: function (v) { this._v = v; },
    volumeUp: function () { this._v = Math.min(100, this._v + 1); },
    volumeDown: function () { this._v = Math.max(0, this._v - 1); },
    setMute: function (m) { this._mute = !!m; },
    isMuteEnabled: function () { return this._mute; }
  },
  tvinputdevice: {
    registerKey: function (name) { console.log("[mock tizen] tvinputdevice.registerKey(" + name + ")"); }
  }
};

function getTizen() {
  if (typeof tizen !== "undefined" && tizen) return { api: tizen, real: true };
  return { api: MockTizen, real: false };
}
var TIZEN = getTizen();
var TZ = TIZEN.api;

/* ================= Constants & state ================= */
var LIVE_TV = "__livetv__";
var LS_KEY = "stv_pinned_v2";
/* Home defaults resolved by verified app ID first (stage-3 applist,
 * 2026-10-20) — keyword match is only a fallback. Name matching alone
 * grabbed wrong entries (e.g. "Disney Plus Preview Service"). */
var DEFAULT_KEYWORDS = [
  { id: "org.tizen.netflix-app", kw: "netflix", label: "Netflix" },
  { id: "MCmYXNxgcu.DisneyPlus", kw: "disney",  label: "Disney+" },
  { id: "XtU8fQk2gN.ESPN",       kw: "espn",    label: "ESPN" },
  { id: "org.tizen.primevideo",  kw: "prime",   label: "Prime Video" },
  { id: "UdGpKNSRmw.NFL",        kw: "nfl",     label: "NFL" },
  { id: "9Ur5IzDKqV.TizenYouTube", kw: "youtube", label: "YouTube" },
  { id: "instantbit.webvideocaster", kw: "video cast", label: "Web Video Caster" },
  { id: "", kw: "nuvio", label: "Nuvio" },
  { id: "xvvl3S1TT1.TizenTubeStandalone", kw: "tizentube", label: "TizenTube" }
];
var LIVETV_ID = "com.samsung.tv.coba.livetv";
var CHANNELS = [
  { major: 2,  name: "CBS", sub: "KCBS · 2.1" },
  { major: 4,  name: "NBC", sub: "KNBC · 4.1" },
  { major: 7,  name: "ABC", sub: "KABC · 7.1" },
  { major: 11, name: "FOX", sub: "KTTV · 11.1" }
];
var SELF_ID = "SameerTV01.Launcher";

/* ================= Appearance prefs (v1.5) =================
 * CleanFrame-style appearance system: wallpaper / layout / display /
 * focus / material / font / controls, all changeable from the TV in
 * Settings -> Appearance with a live preview, saved in localStorage. */
var WALLPAPERS = [
  { id: "stacks",    name: "Sea stacks",      src: "assets/wallpaper.jpg" },
  { id: "misty",     name: "Misty coast",     src: "assets/wp/misty.jpg" },
  { id: "cove",      name: "Quiet cove",      src: "assets/wp/cove.jpg" },
  { id: "forest",    name: "Forest mist",     src: "assets/wp/forest.jpg" },
  { id: "valley",    name: "Mountain valley", src: "assets/wp/valley.jpg" },
  { id: "night",     name: "Desert stars",    src: "assets/wp/night.jpg" },
  { id: "peaks",     name: "Blue peaks",      src: "assets/wp/peaks.jpg" },
  { id: "bridge",    name: "Bridge at dusk",  src: "assets/wp/bridge.jpg" },
  { id: "ridge",     name: "Sunlit ridges",   src: "assets/wp/ridge.jpg" },
  { id: "golden",    name: "Golden hour",     src: "assets/wp/golden.jpg" },
  { id: "summit",    name: "Sunlit summits",  src: "assets/wp/summit.jpg" },
  { id: "goldcoast", name: "Gold Coast dusk", src: "assets/wp/goldcoast.jpg" },
  { id: "sydney",    name: "Sydney Harbour",  src: "assets/wp/sydney.jpg" },
  { id: "amber",     name: "Amber hills",     src: "assets/wp/amber.jpg" },
  { id: "mint",      name: "Mint wave",       src: "assets/wp/mint.jpg" },
  { id: "alpine",    name: "Alpine glow",     src: "assets/wp/alpine.jpg" }
];
function wallpaperById(id) {
  for (var i = 0; i < WALLPAPERS.length; i++) if (WALLPAPERS[i].id === id) return WALLPAPERS[i];
  return WALLPAPERS[0];
}
var PREFS_KEY = "stv_prefs_v1";
var PREFS_DEFAULT = {
  background: "stacks", layout: "list", appsDisplay: "both",
  focusStyle: "type", material: "frost", font: "system", controls: "icons"
};
function loadPrefs() {
  var out = {}, k;
  for (k in PREFS_DEFAULT) out[k] = PREFS_DEFAULT[k];
  try {
    var p = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (p && typeof p === "object") for (k in PREFS_DEFAULT) if (k in p) out[k] = p[k];
  } catch (e) {}
  return out;
}
var prefs = loadPrefs();
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) {}
}
/* Option cycles for the Appearance rows. */
var OPTION_VALUES = {
  background: WALLPAPERS.map(function (w) { return w.id; }).concat(["dark", "light"]),
  layout: ["list", "dock"],
  appsDisplay: ["both", "icons", "text"],
  focusStyle: ["type", "glass"],
  material: ["soft", "frost", "tint"],
  font: ["system", "manrope", "geist", "newsreader"],
  controls: ["icons", "both", "text"]
};
var OPTION_LABELS = {
  layout: { list: "List", dock: "Dock" },
  appsDisplay: { both: "Icons + text", icons: "Icons only", text: "Text only" },
  focusStyle: { type: "Type", glass: "Glass" },
  material: { soft: "Soft", frost: "Frost", tint: "Clear tint" },
  font: { system: "System", manrope: "Manrope", geist: "Geist", newsreader: "Newsreader" },
  controls: { icons: "Icons", both: "Icons + text", text: "Text" }
};
function optionLabel(key, val) {
  if (key === "background") {
    if (val === "dark") return "Dark";
    if (val === "light") return "Light";
    return wallpaperById(val).name;
  }
  return (OPTION_LABELS[key] && OPTION_LABELS[key][val]) || val;
}

var state = {
  view: "apps",
  apps: [],
  pinned: [],
  arranging: false,
  storeBuilt: false,   // All Apps list is built lazily on first open (v1.9)
  inputsBuilt: false,  // Inputs row likewise (v1.9)
  lastFocus: {}   // viewName -> element
};

/* ================= Helpers ================= */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

/* Scroll a focusable into view inside a bounded scroll container
 * (.homelist / .appstore). overflow:hidden containers still accept
 * scrollTop writes, so focus-driven scrolling needs no visible
 * scrollbar — the focused row is always brought inside the window.
 * v1.7: math in layout coordinates (offsetTop / clientHeight), not
 * getBoundingClientRect — rects are post-transform (fitStage) pixels
 * while scrollTop is layout pixels, and mixing the two units can
 * shove the content out of the window entirely. The result is also
 * clamped to the container's real scroll range. */
function revealIn(container, el) {
  try {
    var top = el.offsetTop, h = el.offsetHeight;
    if (!h) return;
    var winTop = container.scrollTop, winBot = winTop + container.clientHeight;
    var target = winTop;
    if (top < winTop + 4) target = top - 14;
    else if (top + h > winBot - 4) target = top + h - container.clientHeight + 14;
    var max = container.scrollHeight - container.clientHeight;
    if (max < 0) max = 0;
    if (target < 0) target = 0;
    if (target > max) target = max;
    container.scrollTop = target;
  } catch (e) {}
}

var toastTimer = null;
function toast(msg, ms) {
  var t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || 2200);
}

var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
function tickClock() {
  var d = new Date(), h = d.getHours(), m = d.getMinutes();
  var ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  var time = h + ":" + (m < 10 ? "0" + m : m) + " " + ap;
  var date = DAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate();
  var c = $("clock"); if (c) c.textContent = time;
  var dt = $("date"); if (dt) dt.textContent = date;
  var jcs = document.querySelectorAll(".js-clock");
  for (var i = 0; i < jcs.length; i++) jcs[i].textContent = time;
  var jds = document.querySelectorAll(".js-date");
  for (var j = 0; j < jds.length; j++) jds[j].textContent = date;
}
function startClock() {
  tickClock();
  setInterval(tickClock, 20000);
}

/* ================= App data ================= */
/* Startup speed (v1.9): getAppsInfo on the TV scans 400+ apps and
 * takes a second or more, and the old init waited for it before
 * painting anything. Now the last-known app list is cached in
 * localStorage and seeded synchronously for an instant first paint;
 * when the real scan returns, the cache refreshes and Home re-renders
 * (resolving any pins the cache couldn't). */
var APPCACHE_KEY = "stv_appcache_v1";
function seedAppsFromCache() {
  try {
    var raw = localStorage.getItem(APPCACHE_KEY);
    if (!raw) return;
    var list = JSON.parse(raw);
    if (!Array.isArray(list)) return;
    state.apps = list.map(function (a) {
      return { id: a[0], name: a[1], iconPath: a[2] || undefined, show: a[3] ? true : false };
    });
  } catch (e) {}
}
function cacheApps() {
  try {
    var slim = state.apps.map(function (a) {
      return [a.id, a.name, a.iconPath || "", a.show === false ? 0 : 1];
    });
    localStorage.setItem(APPCACHE_KEY, JSON.stringify(slim));
  } catch (e) {}
}

function loadApps(done) {
  function finish() { if (done) done(); }
  try {
    TZ.application.getAppsInfo(function (list) {
      if (Array.isArray(list) && list.length) state.apps = list;
      finish();
    }, function (e) {
      console.warn("getAppsInfo failed:", e);
      finish(); // keep the cached seed, if any
    });
  } catch (e) {
    console.warn("getAppsInfo failed:", e);
    finish();
  }
}

function findAppByKeyword(kw) {
  kw = String(kw).toLowerCase();
  for (var i = 0; i < state.apps.length; i++) {
    var name = String(state.apps[i].name || "").toLowerCase();
    if (name.indexOf(kw) !== -1) return state.apps[i];
  }
  return null;
}

function findAppById(id) {
  for (var i = 0; i < state.apps.length; i++) {
    if (state.apps[i].id === id) return state.apps[i];
  }
  return null;
}

function savePinned() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state.pinned)); } catch (e) {}
}

/* When a new home default is added in an update, append it once to an
 * existing saved pin list (marker version below) — never re-add after
 * that, so a default he unpins stays unpinned. */
var DEFAULTS_VERSION = 6; // v1.13: TizenBrew pin removed at his request (purge below runs once)
function defaultsVersion() {
  try { return parseInt(localStorage.getItem("stv_defaults_v") || "0", 10) || 0; }
  catch (e) { return 0; }
}
function setDefaultsVersion() {
  try { localStorage.setItem("stv_defaults_v", String(DEFAULTS_VERSION)); } catch (e) {}
}

function loadPinned() {
  var pinned = null;
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) pinned = JSON.parse(raw);
  } catch (e) {}
  if (!Array.isArray(pinned)) {
    pinned = [LIVE_TV];
    DEFAULT_KEYWORDS.forEach(function (d) {
      var app = (d.id && findAppById(d.id)) || findAppByKeyword(d.kw);
      pinned.push(app ? app.id : "kw:" + d.kw);
    });
    setDefaultsVersion();
  } else if (defaultsVersion() < DEFAULTS_VERSION) {
    // One-time purges: Stremio (v1.12) and TizenBrew (v1.13) pins go away for good.
    pinned = pinned.filter(function (p) {
      return p !== "kw:stremio" && p !== "IkWsFHtOY9.Stremio" &&
             p !== "kw:tizenbrew" && p !== "xvvl3S1bvH.TizenBrewStandalone";
    });
    DEFAULT_KEYWORDS.forEach(function (d) {
      var app = (d.id && findAppById(d.id)) || findAppByKeyword(d.kw);
      var cand = app ? app.id : "kw:" + d.kw;
      if (pinned.indexOf(cand) === -1 && (!app || pinned.indexOf(app.id) === -1)) {
        pinned.push(cand);
      }
    });
    setDefaultsVersion();
  }
  state.pinned = pinned;
  // Re-resolve "kw:" placeholders against currently installed apps
  // (an app installed later should light its tile up automatically).
  resolvePinIds();
}

/* Map any "kw:<keyword>" pins to real app IDs using the current app
 * list (seed cache at first paint, the real scan when it lands). */
function resolvePinIds() {
  state.pinned = state.pinned.map(function (pid) {
    if (typeof pid === "string" && pid.indexOf("kw:") === 0) {
      var app = findAppByKeyword(pid.slice(3));
      return app ? app.id : pid;
    }
    return pid;
  });
  savePinned();
}

/* App Store list: installed, visible apps, minus system noise and ourselves. */
/* All Apps lists only the user's own apps — the ones installed from
 * Samsung's store — not the TV's 200+ registered components. The
 * reliable signal is the app ID's shape (CleanFrame's rule, proven on
 * a sibling TV): store apps get a 10-character package prefix
 * (MCmYXNxgcu.DisneyPlus, 9Ur5IzDKqV.TizenYouTube), while Samsung
 * components use com.samsung.* / org.tizen.* hierarchies. A few store
 * apps keep hierarchical IDs (Netflix, Prime Video) — allowlisted.
 * Home pins and defaults always list regardless. */
var STORE_ID = /^[A-Za-z0-9]{10}\.[A-Za-z0-9_-]+$/;
var STORE_ALLOW = { "org.tizen.netflix-app": 1, "org.tizen.primevideo": 1, "org.tizen.apple.apple-music": 1, "com.samsung.tv.aria-video": 1 };
var STORE_DENY = { "adplatform.ADPlayer": 1, "25emanual3.emanual": 1, "tv6pbVMQFF.PrivacyChoices": 1, "ZODRT12q2l.WebAccountExtension": 1, "ByJlgt0XeD.CastSettingsApp": 1, "WykOS4t4F0.cmsWebApp": 1 };
function isUserApp(a) {
  if (!a || !a.name) return false;
  if (isPinned(a.id) || isDefaultApp(a.id)) return true;
  if (a.id === SELF_ID || STORE_DENY[a.id]) return false;
  if (a.id === "com.samsung.tv.cobalt-yt" || /-dummy$/.test(a.id)) return false;
  if (a.show === false) return false;
  if (JUNK_APP_NAME.test(a.name)) return false;
  return STORE_ALLOW[a.id] === 1 || STORE_ID.test(a.id);
}

function storeApps() {
  return state.apps.filter(isUserApp).sort(function (a, b) {
    return String(a.name).toLowerCase().localeCompare(String(b.name).toLowerCase());
  });
}

function isPinned(appId) {
  return state.pinned.indexOf(appId) !== -1;
}

function togglePin(appId) {
  var i = state.pinned.indexOf(appId);
  if (i !== -1) {
    if (state.pinned.length <= 1) { toast("Keep at least one tile on Home"); return; }
    state.pinned.splice(i, 1);
    toast("Removed from Home");
  } else {
    state.pinned.push(appId);
    toast("Pinned to Home");
  }
  savePinned();
  renderHomeGrid();
  renderAppStore();
  refocusAfterRender("allapps");
}

/* Bundled icons for apps whose TV-provided iconPath is broken on this
 * TV (YouTube showed a wrong swirl icon; Prime Video showed nothing). */
var LOCAL_ICONS = {
  "9Ur5IzDKqV.TizenYouTube": "assets/youtube.png",
  "org.tizen.primevideo": "assets/prime.png"
};

/* App icon: gold letter tile with the real app icon overlaid when it loads.
 * If the icon image fails, onerror removes it and the letter shows through. */
function appIcon(app, px, radius) {
  var letter = (app && app.name) ? esc(app.name.charAt(0).toUpperCase()) : "?";
  var style = "width:" + px + "px;height:" + px + "px;" +
    "font-size:" + Math.round(px * 0.45) + "px;border-radius:" + radius + "px;";
  var iconSrc = (app && LOCAL_ICONS[app.id]) || (app && app.iconPath);
  var img = iconSrc
    ? '<img src="' + esc(iconSrc) + '" alt="" onerror="this.remove()">'
    : "";
  return '<span class="appicon" style="' + style + '">' + letter + img + "</span>";
}

/* ================= Rendering ================= */
/* Resolve a pin id to what the Home UI should show for it. */
function pinInfo(pid) {
  if (pid === LIVE_TV) return { livetv: true, label: "Live TV", app: null, dimmed: false };
  if (typeof pid === "string" && pid.indexOf("kw:") === 0) {
    var kw = pid.slice(3), def = null;
    DEFAULT_KEYWORDS.forEach(function (d) { if (d.kw === kw) def = d; });
    return { livetv: false, label: def ? def.label : kw, app: null, dimmed: true };
  }
  var app = findAppById(pid);
  if (!app) return { livetv: false, label: "Unknown app", app: null, dimmed: true };
  return { livetv: false, label: app.name, app: app, dimmed: false };
}

function makeHomeTile(pid) {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "approw focusable";
  btn.setAttribute("data-pid", pid);
  var info = pinInfo(pid);

  if (info.livetv) {
    btn.innerHTML =
      '<span class="appicon" style="width:56px;height:56px;font-size:27px;border-radius:50%">&#x1F4E1;</span>' +
      '<span class="row-name">Live TV</span>' +
      '<span class="row-sub"><span class="live-dot">&#x25CF;</span> Antenna</span>';
    btn.addEventListener("click", function () {
      if (state.arranging) { exitArrange(); return; }
      switchView("livetv");
    });
    return btn;
  }

  if (info.dimmed) {
    btn.classList.add("dimmed");
    btn.disabled = true;
    btn.innerHTML =
      appIcon(null, 56, 28) +
      '<span class="row-name">' + esc(info.label) + "</span>" +
      '<span class="row-sub">Not installed</span>';
    return btn;
  }

  (function (theApp) {
    btn.innerHTML =
      appIcon(theApp, 56, 28) +
      '<span class="row-name">' + esc(info.label) + "</span>";
    btn.addEventListener("click", function () {
      if (state.arranging) { exitArrange(); return; }
      launchApp(theApp);
    });
  })(info.app);
  return btn;
}

function makeDockSlot(pid) {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dock-slot focusable";
  btn.setAttribute("data-pid", pid);
  var info = pinInfo(pid);

  if (info.livetv) {
    btn.innerHTML =
      '<span class="appicon" style="width:64px;height:64px;font-size:30px;border-radius:50%">&#x1F4E1;</span>' +
      '<span class="slot-label">Live TV</span>';
    btn.addEventListener("click", function () {
      if (state.arranging) { exitArrange(); return; }
      switchView("livetv");
    });
    return btn;
  }
  if (info.dimmed) {
    btn.classList.add("dimmed");
    btn.disabled = true;
    btn.innerHTML = appIcon(null, 64, 32) + '<span class="slot-label">' + esc(info.label) + "</span>";
    return btn;
  }
  (function (theApp) {
    btn.innerHTML =
      appIcon(theApp, 64, 16) +
      '<span class="slot-label">' + esc(info.label) + "</span>";
    btn.addEventListener("click", function () {
      if (state.arranging) { exitArrange(); return; }
      launchApp(theApp);
    });
  })(info.app);
  return btn;
}

function renderDock() {
  var dock = $("home-dock");
  if (!dock) return;
  dock.innerHTML = "";
  state.pinned.forEach(function (pid) { dock.appendChild(makeDockSlot(pid)); });
}

function renderHomeGrid() {
  var grid = $("home-list");
  grid.innerHTML = "";
  state.pinned.forEach(function (pid) { grid.appendChild(makeHomeTile(pid)); });
  renderDock();
}

/* ================= Appearance engine ================= */
function renderControls() {
  var btns = document.querySelectorAll(".top-btn");
  for (var i = 0; i < btns.length; i++) {
    var view = btns[i].getAttribute("data-view");
    var glyph = view === "settings" ? "&#x2699;" : "&#x25A6;";
    var text = view === "settings" ? "Settings" : "All apps";
    if (prefs.controls === "text") btns[i].innerHTML = text;
    else if (prefs.controls === "both") btns[i].innerHTML = glyph + "<span>" + text + "</span>";
    else btns[i].innerHTML = glyph;
  }
}

function applyPrefs() {
  var b = document.body;
  var bg = prefs.background;
  var solid = (bg === "dark" || bg === "light");
  b.classList.toggle("layout-dock", prefs.layout === "dock");
  b.classList.toggle("layout-list", prefs.layout !== "dock");
  // Belt-and-braces (v1.7): set the two home containers' display
  // inline too. If the TV's engine ever drops or mishandles the
  // body-class stylesheet rules above, the inline styles still put
  // exactly one of list/dock on screen.
  var dockEl0 = $("home-dock"), listEl0 = $("home-list");
  if (dockEl0) dockEl0.style.display = prefs.layout === "dock" ? "flex" : "none";
  if (listEl0) listEl0.style.display = prefs.layout === "dock" ? "none" : "flex";
  b.classList.toggle("mode-icons", prefs.appsDisplay === "icons");
  b.classList.toggle("mode-text", prefs.appsDisplay === "text");
  b.classList.toggle("mode-both", prefs.appsDisplay === "both");
  b.classList.toggle("focus-glass", prefs.focusStyle === "glass");
  b.classList.toggle("focus-type", prefs.focusStyle !== "glass");
  b.classList.toggle("mat-soft", prefs.material === "soft");
  b.classList.toggle("mat-frost", prefs.material === "frost");
  b.classList.toggle("mat-tint", prefs.material === "tint");
  b.classList.toggle("font-manrope", prefs.font === "manrope");
  b.classList.toggle("font-geist", prefs.font === "geist");
  b.classList.toggle("font-newsreader", prefs.font === "newsreader");
  b.classList.toggle("controls-text", prefs.controls === "text");
  b.classList.toggle("controls-both", prefs.controls === "both");
  b.classList.toggle("controls-icons", prefs.controls === "icons");
  b.classList.toggle("bg-solid", solid);
  b.classList.toggle("bg-dark", bg === "dark");
  b.classList.toggle("bg-light", bg === "light");
  b.classList.toggle("light", bg === "light");
  var wp = $("wallpaper");
  if (wp && !solid) {
    var src = wallpaperById(bg).src;
    if (wp.getAttribute("src") !== src) wp.setAttribute("src", src);
  }
  renderControls();
  // Refresh the Appearance screen's value labels + preview + picker marks
  for (var key in OPTION_VALUES) {
    var el = $("optv-" + key);
    if (el) el.textContent = "\u2039 " + optionLabel(key, prefs[key]) + " \u203A";
  }
  renderPreview();
  markWpPicker();
}

function cyclePref(key, dir) {
  var values = OPTION_VALUES[key];
  if (!values) return;
  var i = values.indexOf(prefs[key]);
  if (i === -1) i = 0;
  i = (i + dir + values.length) % values.length;
  prefs[key] = values[i];
  savePrefs();
  applyPrefs();
}

/* Mini live preview of Home inside the Appearance screen. */
function previewPins(limit) {
  var out = [];
  for (var i = 0; i < state.pinned.length && out.length < limit; i++) {
    var info = pinInfo(state.pinned[i]);
    if (!info.dimmed) out.push(info);
  }
  return out;
}
function renderPreview(previewBg) {
  var pv = $("ap-preview");
  if (!pv) return;
  var bg = previewBg || prefs.background;
  pv.className = "pv" +
    (bg === "light" ? " light" : "") +
    (prefs.layout === "dock" ? " layout-dock" : "") +
    (prefs.focusStyle === "glass" ? " focus-glass" : " focus-type") +
    (prefs.appsDisplay === "icons" ? " mode-icons" : prefs.appsDisplay === "text" ? " mode-text" : "") +
    " mat-" + prefs.material +
    (prefs.font !== "system" ? " pvfont-" + prefs.font : "");
  pv.style.fontFamily = prefs.font === "manrope" ? "'Manrope',sans-serif" :
    prefs.font === "geist" ? "'Geist',sans-serif" :
    prefs.font === "newsreader" ? "'Newsreader',serif" : "";
  var html = "";
  if (bg !== "dark" && bg !== "light") {
    html += '<img class="pv-wp" src="' + esc(wallpaperById(bg).src) + '" alt="">';
  } else if (bg === "light") {
    html += '<div class="pv-wp" style="background:#e9e6de"></div>';
  } else {
    html += '<div class="pv-wp" style="background:#0a0d11"></div>';
  }
  html += '<div class="pv-scrim"></div>';
  html += '<div class="pv-clock"><span class="js-clock">--:--</span><span class="pv-date js-date"></span></div>';
  var pins = previewPins(prefs.layout === "dock" ? 7 : 5);
  html += '<div class="pv-list">';
  pins.forEach(function (info, idx) {
    var letter = info.livetv ? "\uD83D\uDCE1" : esc(info.label.charAt(0).toUpperCase());
    html += '<div class="pv-row' + (idx === 0 ? " on" : "") + '">' +
      '<span class="pv-ico">' + letter + '</span>' +
      '<span class="pv-name">' + esc(info.label) + "</span></div>";
  });
  html += "</div>";
  html += '<div class="pv-dock">';
  pins.forEach(function (info, idx) {
    var letter = info.livetv ? "\uD83D\uDCE1" : esc(info.label.charAt(0).toUpperCase());
    html += '<div class="pv-slot' + (idx === 0 ? " on" : "") + '">' +
      '<span class="pv-ico">' + letter + '</span>' +
      '<span class="pv-lab">' + esc(info.label) + "</span></div>";
  });
  html += "</div>";
  pv.innerHTML = html;
  tickClock();
}

function renderWpPicker() {
  var wrap = $("wp-picker");
  if (!wrap) return;
  wrap.innerHTML = "";
  WALLPAPERS.forEach(function (w) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wp-thumb focusable";
    btn.setAttribute("data-bg", w.id);
    var thumb = w.id === "stacks" ? w.src : "assets/wp/" + w.id + "-thumb.jpg";
    btn.innerHTML = '<img src="' + esc(thumb) + '" alt="">' +
      '<span class="wp-name">' + esc(w.name) + "</span>";
    btn.addEventListener("click", function () {
      prefs.background = w.id;
      savePrefs();
      applyPrefs();
      toast("Background: " + w.name);
    });
    wrap.appendChild(btn);
  });
  [["dark", "Dark"], ["light", "Light"]].forEach(function (pair) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wp-thumb focusable";
    btn.setAttribute("data-bg", pair[0]);
    btn.innerHTML = '<span class="wp-swatch ' + pair[0] + '">' + pair[1] + "</span>";
    btn.addEventListener("click", function () {
      prefs.background = pair[0];
      savePrefs();
      applyPrefs();
      toast("Background: " + pair[1]);
    });
    wrap.appendChild(btn);
  });
  markWpPicker();
}
function markWpPicker() {
  var thumbs = document.querySelectorAll(".wp-thumb");
  for (var i = 0; i < thumbs.length; i++) {
    thumbs[i].classList.toggle("sel", thumbs[i].getAttribute("data-bg") === prefs.background);
  }
}

/* ================= Arrange mode ================= */
function startArrange() {
  if (!state.pinned.length) { toast("Nothing on Home to arrange"); return; }
  state.arranging = true;
  document.body.classList.add("arranging");
  switchView("apps");
  var first = homeItemEls()[0];
  if (first) { first.focus(); markGrabbed(); }
  toast("Arrange: arrow keys move the gold app, OK when done", 3500);
}
function exitArrange() {
  if (!state.arranging) return;
  state.arranging = false;
  document.body.classList.remove("arranging");
  var els = document.querySelectorAll(".grabbed");
  for (var i = 0; i < els.length; i++) els[i].classList.remove("grabbed");
}
function homeItemEls() {
  var sel = prefs.layout === "dock" ? "#home-dock .dock-slot" : "#home-list .approw";
  var els = document.querySelectorAll(sel);
  var out = [];
  for (var i = 0; i < els.length; i++) if (!els[i].disabled) out.push(els[i]);
  return out;
}
function markGrabbed() {
  var els = document.querySelectorAll(".grabbed");
  for (var i = 0; i < els.length; i++) els[i].classList.remove("grabbed");
  var el = document.activeElement;
  if (el && el.getAttribute && el.getAttribute("data-pid")) el.classList.add("grabbed");
}
function movePin(dir) {
  var el = document.activeElement;
  if (!el || !el.getAttribute) return;
  var pid = el.getAttribute("data-pid");
  var i = state.pinned.indexOf(pid);
  var j = i + dir;
  if (i === -1 || j < 0 || j >= state.pinned.length) return;
  state.pinned.splice(i, 1);
  state.pinned.splice(j, 0, pid);
  savePinned();
  renderHomeGrid();
  var els = homeItemEls();
  for (var k = 0; k < els.length; k++) {
    if (els[k].getAttribute("data-pid") === pid) { els[k].focus(); break; }
  }
  markGrabbed();
}

function renderChannels() {
  var wrap = $("channel-grid");
  wrap.innerHTML = "";
  CHANNELS.forEach(function (ch) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "channel focusable";
    btn.innerHTML =
      '<span class="ch-num">' + ch.major + "</span>" +
      '<span class="ch-name">' + esc(ch.name) + "</span>" +
      '<span class="ch-sub">' + esc(ch.sub) + "</span>";
    (function (major) {
      btn.addEventListener("click", function () { tuneChannel(major); });
    })(ch.major);
    wrap.appendChild(btn);
  });
}

/* getAppsInfo returns plenty of internal entries (CleanFrame filters
 * the same way): hide service/preview/worker junk and known decoys. */
var JUNK_APP_NAME = /(service|worker|preview|promotion|plugin|test|sdk|factory|daemon)/i;

function isDefaultApp(id) {
  for (var i = 0; i < DEFAULT_KEYWORDS.length; i++) {
    if (DEFAULT_KEYWORDS[i].id === id) return true;
  }
  return false;
}

function renderAppStore() {
  state.storeBuilt = true;
  var list = $("appstore-list");
  list.innerHTML = "";
  storeApps().forEach(function (app) {
    if (app.id === "com.samsung.tv.cobalt-yt") return;
    if (JUNK_APP_NAME.test(app.name) && !isPinned(app.id)) return;
    // Match Samsung's app drawer: getAppsInfo returns every registered
    // component, but only show=true apps are user-facing. Home defaults
    // and pinned apps are always listed (CleanFrame's rule).
    if (app.show === false && !isDefaultApp(app.id) && !isPinned(app.id)) return;
    var row = document.createElement("div");
    row.className = "store-row";

    var ico = document.createElement("span");
    ico.className = "s-ico";
    ico.innerHTML = appIcon(app, 64, 14);
    row.appendChild(ico);

    var name = document.createElement("span");
    name.className = "s-name";
    name.textContent = app.name;
    row.appendChild(name);

    var launch = document.createElement("button");
    launch.type = "button";
    launch.className = "btn focusable";
    launch.textContent = "Launch";
    (function (theApp) {
      launch.addEventListener("click", function () { launchApp(theApp); });
    })(app);
    row.appendChild(launch);

    var star = document.createElement("button");
    star.type = "button";
    star.className = "star focusable" + (isPinned(app.id) ? " on" : "");
    star.textContent = isPinned(app.id) ? "\u2605" : "\u2606";
    star.title = isPinned(app.id) ? "Unpin from Home" : "Pin to Home";
    (function (appId) {
      star.addEventListener("click", function () { togglePin(appId); });
    })(app.id);
    row.appendChild(star);

    list.appendChild(row);
  });
  if (!list.children.length) {
    list.innerHTML = '<p class="hint">No apps found.</p>';
  }
}

function sourceType(src) {
  if (src && typeof src === "object" && src.type) return String(src.type).toUpperCase();
  return String(src).toUpperCase();
}
function sourceNumber(src) {
  if (src && typeof src === "object" && src.number != null) return src.number;
  var m = String(src).match(/(\d+)\s*$/);
  return m ? m[1] : "";
}
function friendlySource(src) {
  var t = sourceType(src);
  if (t === "TV") return "Antenna";
  var n = sourceNumber(src);
  var label = t.charAt(0) + t.slice(1).toLowerCase();
  return n !== "" ? label + " " + n : label;
}
function sourceIcon(src) {
  var t = sourceType(src);
  if (t === "TV") return "&#x1F4E1;";
  if (t === "HDMI") return "&#x1F4FA;";
  if (t === "PC" || t === "DVI") return "&#x1F4BB;";
  return "&#x1F50C;";
}

function getVideoSources(cb) {
  function fallback() {
    try {
      TZ.systeminfo.getPropertyValue("VIDEOSOURCE",
        function (v) {
          var c = v && v.connected;
          cb(Array.isArray(c) && c.length ? c : ["TV"]);
        },
        function () { cb(["TV"]); });
    } catch (e) { cb(["TV"]); }
  }
  // Prefer the full source list (every port, connected or not); the
  // VIDEOSOURCE property only reports currently connected sources.
  try {
    if (TZ.tvwindow && TZ.tvwindow.getSourceList) {
      TZ.tvwindow.getSourceList(function (list) {
        if (Array.isArray(list) && list.length) { cb(list); return; }
        fallback();
      }, function () { fallback(); });
      return;
    }
  } catch (e) {}
  fallback();
}

function renderInputs() {
  var wrap = $("inputs-row");
  wrap.innerHTML = "";
  getVideoSources(function (sources) {
    sources.forEach(function (src) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "input-tile focusable";
      btn.innerHTML = '<span class="ico">' + sourceIcon(src) + "</span><span>" +
        esc(friendlySource(src)) + "</span>";
      (function (s) {
        btn.addEventListener("click", function () {
          if (sourceType(s) === "TV") { switchView("livetv"); return; }
          setSource(s);
        });
      })(src);
      wrap.appendChild(btn);
    });
  });
}

/* ================= Actions ================= */
function launchApp(app) {
  toast("Opening " + app.name + "\u2026");
  try {
    TZ.application.launch(app.id,
      function () {},
      function (e) { toast("Could not open " + app.name); });
  } catch (e) { toast("Could not open " + app.name); }
}

var tvLines = [];
function tvLog(msg) {
  tvLines.push(msg);
  if (tvLines.length > 6) tvLines.shift();
  var el = $("tv-status");
  if (el) el.textContent = tvLines.join("\n");
}

function errText(e) {
  if (!e) return "unknown error";
  return (((e.name || "") + " " + (e.message || "")).trim()) || String(e);
}

/* Launch a Samsung system app directly by ID (CleanFrame's pattern —
 * no getAppsInfo lookup needed; that list omits some system apps). */
function launchById(id, label) {
  toast("Opening " + label + "\u2026");
  try {
    TZ.application.launch(id,
      function () {},
      function (e) { toast("Couldn't open " + label + ": " + errText(e), 5000); });
  } catch (e) { toast("Couldn't open " + label + ": " + errText(e), 5000); }
}

/* Samsung's Settings and Apps are CoBA panels hosted by Samsung Home
 * (com.samsung.tv.csfs) and CANNOT be opened from a web app: plain
 * launch, launch+hide-self, and csfs-first at 0.9 s and 2.5 s were all
 * confirmed on the TV (2026-10-20) to do nothing but raise Samsung's
 * home bar — the panel launches report success and never appear. So
 * these buttons do the one thing that actually works: raise Samsung's
 * bar, where Samsung puts its own Settings gear and Apps tile, and say
 * so plainly instead of pretending the panel opened. */
function openSamsungBar(kind) {
  var st = $("set-status");
  var isApps = kind === "apps";
  toast(isApps ? "Opening Samsung Apps\u2026" : "Opening TV Settings\u2026");
  if (st) st.textContent = isApps
    ? "Samsung bar open — Apps tile = store."
    : "Samsung bar open — \u2699 = Settings.";
  try {
    TZ.application.launch("com.samsung.tv.csfs",
      function () {},
      function (e) { if (st) st.textContent = "Couldn't open Samsung's bar: " + errText(e); });
  } catch (e) { if (st) st.textContent = "Couldn't open Samsung's bar: " + errText(e); }
}

/* The broadcast player is org.tizen.tv-viewer (the TV's own boot/startup
 * app) — that is what Samsung's Home presents for Live TV: switch the
 * source to TV first, then launch the viewer. The coba.livetv component
 * accepted in-app launches but never took the screen (2026-10-20), so it
 * is only a fallback here. */
var VIEWER_ID = "org.tizen.tv-viewer";
function openLiveTV() {
  tvLog("Opening Live TV player (" + VIEWER_ID + ")\u2026");
  function launchViewer() {
    try {
      TZ.application.launch(VIEWER_ID,
        function () { tvLog("Live TV player launched."); },
        function (e) {
          tvLog("TV viewer failed: " + errText(e) + " — trying Samsung Live TV\u2026");
          try {
            TZ.application.launch(LIVETV_ID,
              function () { tvLog("Samsung Live TV launched."); },
              function (e2) { tvLog("Live TV launch failed: " + errText(e2)); toast("Couldn't open Live TV: " + errText(e2), 5000); });
          } catch (e2) { tvLog("Live TV launch threw: " + errText(e2)); }
        });
    } catch (e) { tvLog("TV viewer launch threw: " + errText(e)); }
  }
  try {
    if (TZ.tvwindow && TZ.tvwindow.getSourceList) {
      TZ.tvwindow.getSourceList(function (sources) {
        var tv = null;
        (sources || []).forEach(function (s) { if (!tv && s.type === "TV") tv = s; });
        if (!tv) { launchViewer(); return; }
        try { TZ.tvwindow.setSource(tv, function () { launchViewer(); }, function () { launchViewer(); }); }
        catch (e) { launchViewer(); }
      }, function () { launchViewer(); });
      return;
    }
  } catch (e) {}
  launchViewer();
}

/* Channel tuning. The TV's own error (2026-10-20) was TypeMismatchError
 * "Argument 'callback' should be an object": Samsung's tune() wants a
 * single callback OBJECT ({onsuccess, onerror}), not separate function
 * arguments like the generic Tizen API. Try the object form first, then
 * the function form with a tune option; every step is logged on screen. */
function tuneChannel(major) {
  toast("Tuning to channel " + major + "\u2026");
  tvLines = [];
  tvLog("Tuning to channel " + major + "\u2026");
  var settled = false;

  function done(msg) {
    if (settled) return;
    settled = true;
    tvLog(msg);
    toast(msg, 3500);
  }

  /* tune() changes the tuner behind this full-screen app; the picture
   * only appears once Samsung's player owns the screen, so a successful
   * tune hands off to the Live TV app on the tuned channel. */
  function tunedOk(ch) {
    if (settled) return;
    settled = true;
    tvLog("Tuned to " + (ch.channelName || ("channel " + major)) + " — opening the Live TV player to play it\u2026");
    toast("Watching " + (ch.channelName || ("channel " + major)));
    setTimeout(openLiveTV, 350);
  }

  function tryObjectForm(ch, next) {
    try {
      TZ.tvchannel.tune(ch, {
        onsuccess: function () { tunedOk(ch); },
        onerror: function (e) { next("object-form: " + errText(e)); }
      });
    } catch (e) { next("object-form threw: " + errText(e)); }
  }

  function tryFunctionForm(ch, next) {
    try {
      TZ.tvchannel.tune(ch,
        function () { tunedOk(ch); },
        function (e) { next("function-form: " + errText(e)); },
        { type: "MAIN" });
    } catch (e) { next("function-form threw: " + errText(e)); }
  }

  function attempts(ch) {
    tvLog("Found " + ch.major + "." + ch.minor + " " + (ch.channelName || "") + " — tune, object callback\u2026");
    tryObjectForm(ch, function (e1) {
      tvLog(e1 + " — tune, function callbacks\u2026");
      tryFunctionForm(ch, function (e2) {
        tvLog(e2);
        done("Direct tuning isn't working from the launcher. The button above opens the Live TV player.");
      });
    });
  }

  function pickFrom(list, modeLabel, nextStep) {
    var ch = null;
    (list || []).forEach(function (c) {
      if (!ch && Number(c.major) === Number(major)) ch = c;
    });
    if (!ch) { nextStep("channel " + major + " not in " + modeLabel + " list (" + (list ? list.length : 0) + " channels)"); return; }
    attempts(ch);
  }

  function fetchAndTune(mode, nextStep) {
    try {
      var args = [function (list) { pickFrom(list, mode || "default", nextStep); },
                  function (e) { nextStep("getChannelList error: " + errText(e)); }];
      if (mode) args.push(mode);
      TZ.tvchannel.getChannelList.apply(TZ.tvchannel, args);
    } catch (e) { nextStep("getChannelList threw: " + errText(e)); }
  }

  function afterSource() {
    // The "AIR" list mode is not a valid enum on this TV (TypeMismatchError,
    // confirmed 2026-10-20); the default list is the tuner's own list.
    fetchAndTune(null, function (err) { done(err); });
  }

  // Make the tuner the active source before tuning.
  try {
    if (TZ.tvwindow && TZ.tvwindow.getSourceList) {
      TZ.tvwindow.getSourceList(function (sources) {
        var tv = null;
        (sources || []).forEach(function (s) { if (!tv && s.type === "TV") tv = s; });
        if (!tv) { afterSource(); return; }
        try { TZ.tvwindow.setSource(tv, function () { afterSource(); }, function () { afterSource(); }); }
        catch (e) { afterSource(); }
      }, function () { afterSource(); });
    } else { afterSource(); }
  } catch (e) { afterSource(); }
}

/* ================= Stage fit =================
 * This TV grants the app a stage narrower than 1920 CSS px (text wrapped
 * and the layout sat in the top-left at ~0.6 scale, Oct 2026). Design is
 * always laid out at 1920x1080, then #app is scaled to the real stage so
 * the result fills the screen on any stage size. At a true 1920 stage
 * the scale is 1 and this is a no-op. */
function fitStage() {
  var app = $("app");
  if (!app) return;
  var w = window.innerWidth || 1920, h = window.innerHeight || 1080;
  var s = Math.min(w / 1920, h / 1080);
  if (s > 0.05 && Math.abs(s - 1) > 0.01) {
    app.style.width = "1920px";
    app.style.height = "1080px";
    app.style.transformOrigin = "0 0";
    app.style.transform = "scale(" + s + ")";
  } else {
    app.style.transform = "";
    app.style.width = "";
    app.style.height = "";
  }
}

/* ================= Settings extras ================= */
function renderSettings() {
  var lvl = $("vol-level");
  try {
    if (TZ.tvaudiocontrol) {
      var v = TZ.tvaudiocontrol.getVolume();
      var muted = TZ.tvaudiocontrol.isMuteEnabled && TZ.tvaudiocontrol.isMuteEnabled();
      if (lvl) lvl.textContent = "Volume " + v + (muted ? " (muted)" : "");
    } else if (lvl) { lvl.textContent = "Volume n/a"; }
  } catch (e) { if (lvl) lvl.textContent = "Volume n/a"; }

  var info = $("tv-info"), parts = [];
  try {
    var pi = window.webapis && window.webapis.productinfo;
    if (pi) {
      try { parts.push("Model " + pi.getModel()); } catch (e) {}
      try { parts.push("Firmware " + pi.getFirmware()); } catch (e) {}
      try { parts.push("DUID " + pi.getDuid()); } catch (e) {}
    }
  } catch (e) {}
  if (info) info.textContent = parts.length ? parts.join(" \u00B7 ") : "TV info unavailable in preview";
}

function changeVolume(delta) {
  try {
    if (!TZ.tvaudiocontrol) { toast("Volume control unavailable"); return; }
    if (delta > 0) TZ.tvaudiocontrol.volumeUp(); else TZ.tvaudiocontrol.volumeDown();
    renderSettings();
  } catch (e) { toast("Volume control failed: " + errText(e), 4000); }
}

function toggleMute() {
  try {
    if (!TZ.tvaudiocontrol) { toast("Mute unavailable"); return; }
    var m = TZ.tvaudiocontrol.isMuteEnabled ? TZ.tvaudiocontrol.isMuteEnabled() : false;
    TZ.tvaudiocontrol.setMute(!m);
    renderSettings();
  } catch (e) { toast("Mute failed: " + errText(e), 4000); }
}

function setSource(src) {
  toast("Switching to " + friendlySource(src) + "\u2026");
  try {
    TZ.tvwindow.setSource(src,
      function () { toast("Input: " + friendlySource(src)); },
      function () { toast("Switch failed"); });
  } catch (e) { toast("Switch failed"); }
}

/* ================= Views & focus ================= */
function focusables() {
  var out = [];
  var els = document.querySelectorAll(".focusable");
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    if (el.disabled) continue;
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    var view = el.closest(".view");
    if (view && !view.classList.contains("active")) continue;
    out.push(el);
  }
  return out;
}

function move(dir) {
  var items = focusables();
  if (!items.length) return;
  var cur = document.activeElement;
  if (!cur || items.indexOf(cur) === -1) { items[0].focus(); return; }
  var r = cur.getBoundingClientRect();
  var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  var best = null, bestScore = Infinity;
  // Pass 0 enforces an off-axis cutoff; pass 1 (only if pass 0 found
  // nothing) takes the nearest candidate in that direction regardless —
  // otherwise the top-right buttons are unreachable from the list.
  for (var pass = 0; pass < 2 && !best; pass++) {
    bestScore = Infinity;
    for (var i = 0; i < items.length; i++) {
      var el = items[i];
      if (el === cur) continue;
      var b = el.getBoundingClientRect();
      var ex = b.left + b.width / 2, ey = b.top + b.height / 2;
      var dx = ex - cx, dy = ey - cy;
      var ok = false, primary = 0, secondary = 0;
      if (dir === "left")       { ok = dx < -8; primary = -dx; secondary = Math.abs(dy); }
      else if (dir === "right") { ok = dx >  8; primary =  dx; secondary = Math.abs(dy); }
      else if (dir === "up")    { ok = dy < -8; primary = -dy; secondary = Math.abs(dx); }
      else if (dir === "down")  { ok = dy >  8; primary =  dy; secondary = Math.abs(dx); }
      if (!ok) continue;
      if (pass === 0 && secondary > primary * 3 + 40) continue; // too far off-axis
      var score = primary + secondary * 2.2;
      if (score < bestScore) { bestScore = score; best = el; }
    }
  }
  if (best) best.focus();
}

function switchView(name) {
  fitStage();
  if (name !== "apps") exitArrange();
  // Lazy first-builds (v1.9): the All Apps list is 200+ DOM rows and
  // the Inputs row costs a source-list API call — neither belongs in
  // cold start when most launches never open those views.
  if (name === "allapps" && !state.storeBuilt) renderAppStore();
  if (name === "settings") {
    if (!state.inputsBuilt) { state.inputsBuilt = true; renderInputs(); }
    renderSettings();
  }
  if (name === "appearance") applyPrefs();
  state.view = name;
  var views = document.querySelectorAll(".view");
  for (var i = 0; i < views.length; i++) {
    views[i].classList.toggle("active", views[i].id === "view-" + name);
  }
  var items = document.querySelectorAll(".side-item");
  for (var j = 0; j < items.length; j++) {
    items[j].classList.toggle("active", items[j].getAttribute("data-view") === name);
  }
  var target = state.lastFocus[name];
  if (!target || !document.contains(target) || target.disabled || target.getBoundingClientRect().width === 0) {
    var first = document.querySelector("#view-" + name + " .focusable:not([disabled])");
    target = first || document.querySelector('.top-btn[data-view="' + name + '"]') ||
      document.querySelector("#view-apps .focusable:not([disabled])");
  }
  if (target) target.focus();
}

function refocusAfterRender(viewName) {
  var target = state.lastFocus[viewName];
  if (target && document.contains(target) && !target.disabled) { target.focus(); return; }
  var first = document.querySelector("#view-" + viewName + " .focusable:not([disabled])");
  if (first) first.focus();
}

function goBack() {
  if (state.view === "appearance") switchView("settings");
  else if (state.view !== "apps") switchView("apps");
}

function bindUI() {
  var items = document.querySelectorAll(".top-btn");
  for (var i = 0; i < items.length; i++) {
    (function (btn) {
      btn.addEventListener("click", function () { switchView(btn.getAttribute("data-view")); });
    })(items[i]);
  }
  var ol = $("open-livetv");
  if (ol) ol.addEventListener("click", openLiveTV);
  var oa = $("open-appearance");
  if (oa) oa.addEventListener("click", function () { switchView("appearance"); });
  var ah = $("arrange-home");
  if (ah) ah.addEventListener("click", function () { startArrange(); });
  var optRows = document.querySelectorAll(".opt-row");
  for (var oi = 0; oi < optRows.length; oi++) {
    (function (row) {
      row.addEventListener("click", function () {
        cyclePref(row.getAttribute("data-pref"), 1);
      });
    })(optRows[oi]);
  }
  var os = $("open-settings");
  if (os) os.addEventListener("click", function () { openSamsungBar("settings"); });
  var oas = $("open-apps-store");
  if (oas) oas.addEventListener("click", function () { openSamsungBar("apps"); });
  window.addEventListener("resize", fitStage);
  var vu = $("vol-up");
  if (vu) vu.addEventListener("click", function () { changeVolume(1); });
  var vd = $("vol-down");
  if (vd) vd.addEventListener("click", function () { changeVolume(-1); });
  var vm = $("vol-mute");
  if (vm) vm.addEventListener("click", toggleMute);
  document.addEventListener("focusin", function (e) {
    var view = e.target.closest ? e.target.closest(".view") : null;
    if (view) {
      var name = view.id.replace("view-", "");
      state.lastFocus[name] = e.target;
    }
    if (e.target.closest) {
      var scroller = e.target.closest(".homelist") || e.target.closest(".appstore") || e.target.closest("#view-settings .plate");
      if (scroller) revealIn(scroller, e.target);
    }
    if (state.arranging) markGrabbed();
    // Browsing wallpaper thumbs previews them in the preview pane;
    // Enter/click commits (CleanFrame's "OK Apply" pattern).
    if (e.target.classList && e.target.classList.contains("wp-thumb")) {
      renderPreview(e.target.getAttribute("data-bg"));
    } else if (state.view === "appearance") {
      renderPreview();
    }
  });
  document.addEventListener("keydown", function (e) {
    var k = e.keyCode;
    // Arrange mode: arrows move the focused pin, OK/Return exits.
    if (state.arranging) {
      var dockMode = prefs.layout === "dock";
      if (k === 13 || k === 10009 || k === 8) { exitArrange(); }
      else if (dockMode && k === 37) movePin(-1);
      else if (dockMode && k === 39) movePin(1);
      else if (!dockMode && k === 38) movePin(-1);
      else if (!dockMode && k === 40) movePin(1);
      else return;
      if (e.preventDefault) e.preventDefault();
      return;
    }
    // Appearance option rows: Left/Right (or Enter) cycles the value.
    var ae = document.activeElement;
    if (ae && ae.classList && ae.classList.contains("opt-row")) {
      var key = ae.getAttribute("data-pref");
      if (k === 37) cyclePref(key, -1);
      else if (k === 39) cyclePref(key, 1);
      else if (k === 13) cyclePref(key, 1);
      else if (k === 38) move("up");
      else if (k === 40) move("down");
      else if (k === 10009 || k === 8) goBack();
      else return;
      if (e.preventDefault) e.preventDefault();
      return;
    }
    if (k === 37) move("left");
    else if (k === 38) move("up");
    else if (k === 39) move("right");
    else if (k === 40) move("down");
    else if (k === 13) {
      var el = document.activeElement;
      if (el && el.classList && el.classList.contains("focusable")) el.click();
    }
    else if (k === 10009 || k === 8) goBack(); // Samsung Return / desktop Backspace
    else return;
    if (e.preventDefault) e.preventDefault();
  });
  // Samsung HW back key (needs tvinputdevice.registerKey("Return") first)
  document.addEventListener("tizenhwkey", function (e) {
    if (e && e.keyName === "back") goBack();
  });
}

/* ================= Init ================= */
function init() {
  fitStage();
  // The TV's stage can settle to its real size after launch (and a
  // resize event is not guaranteed), so re-fit for the first seconds.
  var refits = 0;
  var refitTimer = setInterval(function () {
    fitStage();
    refits++;
    if (refits >= 12) clearInterval(refitTimer);
  }, 500);
  try {
    if (TZ.tvinputdevice && TZ.tvinputdevice.registerKey) TZ.tvinputdevice.registerKey("Return");
  } catch (e) {}
  // Instant first paint (v1.9): seed the app list from the localStorage
  // cache and render Home synchronously; the real getAppsInfo scan runs
  // in parallel and refreshes everything when it lands. On the very
  // first run (no cache) Home paints with placeholder pins for the
  // ~1 s the scan takes, then fills in — still faster than the old
  // black-screen wait, and every later launch is instant.
  seedAppsFromCache();
  loadApps(function () {
    cacheApps();
    resolvePinIds();
    // Preserve focus across the re-render: remember the focused pin,
    // rebuild, then refocus the same pin in the visible container.
    var ae = document.activeElement;
    var pid = (ae && ae.getAttribute) ? ae.getAttribute("data-pid") : null;
    renderHomeGrid();
    if (state.storeBuilt) renderAppStore();
    if (pid && state.view === "apps") {
      var els = homeItemEls(), restored = false;
      for (var k = 0; k < els.length; k++) {
        if (els[k].getAttribute("data-pid") === pid) { els[k].focus(); restored = true; break; }
      }
      if (!restored) refocusAfterRender("apps");
    }
  });
  loadPinned();
  // Desktop-preview QA hooks (never active on the TV): ?view=settings
  // ?layout=dock&focus=glass&bg=peaks&font=manrope&display=icons&arrange=1
  var qaView = null, qaArrange = false;
  if (!TIZEN.real) {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get("bg")) prefs.background = q.get("bg");
      if (q.get("layout")) prefs.layout = q.get("layout");
      if (q.get("focus")) prefs.focusStyle = q.get("focus");
      if (q.get("material")) prefs.material = q.get("material");
      if (q.get("font")) prefs.font = q.get("font");
      if (q.get("display")) prefs.appsDisplay = q.get("display");
      if (q.get("controls")) prefs.controls = q.get("controls");
      qaView = q.get("view");
      qaArrange = q.get("arrange") === "1";
    } catch (e) {}
  }
  renderHomeGrid();
  renderChannels();
  renderWpPicker();
  applyPrefs();
  bindUI();
  startClock();
  switchView(qaView || "apps");
  if (qaArrange) startArrange();
  if (!TIZEN.real) console.log("[launcher] desktop preview mode — tizen APIs mocked");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
})();
