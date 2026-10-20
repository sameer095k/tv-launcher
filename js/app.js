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
  { id: "com.webvideocast.app", name: "Web Video Cast" },
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
  { id: "9Ur5IzDKqV.TizenYouTube", kw: "youtube", label: "YouTube" }
];
var LIVETV_ID = "com.samsung.tv.coba.livetv";
var CHANNELS = [
  { major: 2,  name: "CBS", sub: "KCBS · 2.1" },
  { major: 4,  name: "NBC", sub: "KNBC · 4.1" },
  { major: 7,  name: "ABC", sub: "KABC · 7.1" },
  { major: 11, name: "FOX", sub: "KTTV · 11.1" }
];
var SELF_ID = "SameerTV01.Launcher";

var state = {
  view: "apps",
  apps: [],
  pinned: [],
  lastFocus: {}   // viewName -> element
};

/* ================= Helpers ================= */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

var toastTimer = null;
function toast(msg, ms) {
  var t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || 2200);
}

function startClock() {
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  function tick() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes();
    var ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    $("clock").textContent = h + ":" + (m < 10 ? "0" + m : m) + " " + ap;
    var dt = $("date");
    if (dt) dt.textContent = DAYS[d.getDay()] + ", " + MONTHS[d.getMonth()] + " " + d.getDate();
  }
  tick();
  setInterval(tick, 20000);
}

/* ================= App data ================= */
function loadApps(done) {
  function finish() { if (done) done(); }
  try {
    TZ.application.getAppsInfo(function (list) {
      state.apps = Array.isArray(list) ? list : [];
      finish();
    }, function (e) {
      console.warn("getAppsInfo failed:", e);
      state.apps = [];
      finish();
    });
  } catch (e) {
    console.warn("getAppsInfo failed:", e);
    state.apps = [];
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
  }
  // Re-resolve "kw:" placeholders against currently installed apps
  // (an app installed later should light its tile up automatically).
  state.pinned = pinned.map(function (pid) {
    if (typeof pid === "string" && pid.indexOf("kw:") === 0) {
      var app = findAppByKeyword(pid.slice(3));
      return app ? app.id : pid;
    }
    return pid;
  });
  savePinned();
}

/* App Store list: installed, visible apps, minus system noise and ourselves. */
function storeApps() {
  return state.apps.filter(function (a) {
    if (!a || !a.name) return false;
    if (a.id === SELF_ID) return false;
    if (a.show === false) return false;
    return true;
  }).sort(function (a, b) {
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
function makeHomeTile(pid) {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "approw focusable";

  if (pid === LIVE_TV) {
    btn.innerHTML =
      '<span class="appicon" style="width:56px;height:56px;font-size:27px;border-radius:50%">&#x1F4E1;</span>' +
      '<span class="row-name">Live TV</span>' +
      '<span class="row-sub"><span class="live-dot">&#x25CF;</span> Antenna</span>';
    btn.addEventListener("click", function () { switchView("livetv"); });
    return btn;
  }

  var app = null, label = pid, dimmed = false;
  if (typeof pid === "string" && pid.indexOf("kw:") === 0) {
    var kw = pid.slice(3);
    var def = null;
    DEFAULT_KEYWORDS.forEach(function (d) { if (d.kw === kw) def = d; });
    label = def ? def.label : kw;
    dimmed = true; // not installed
  } else {
    app = findAppById(pid);
    if (!app) { label = "Unknown app"; dimmed = true; }
    else { label = app.name; }
  }

  if (dimmed) {
    btn.classList.add("dimmed");
    btn.disabled = true;
    btn.innerHTML =
      appIcon(null, 56, 28) +
      '<span class="row-name">' + esc(label) + "</span>" +
      '<span class="row-sub">Not installed</span>';
    return btn;
  }

  (function (theApp) {
    btn.innerHTML =
      appIcon(theApp, 56, 28) +
      '<span class="row-name">' + esc(label) + "</span>";
    btn.addEventListener("click", function () { launchApp(theApp); });
  })(app);
  return btn;
}

function renderHomeGrid() {
  var grid = $("home-list");
  grid.innerHTML = "";
  state.pinned.forEach(function (pid) { grid.appendChild(makeHomeTile(pid)); });
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

function openLiveTV() {
  tvLog("Opening Samsung Live TV (" + LIVETV_ID + ")\u2026");
  try {
    TZ.application.launch(LIVETV_ID,
      function () { tvLog("Samsung Live TV launched."); },
      function (e) { tvLog("Live TV launch failed: " + errText(e)); toast("Couldn't open Live TV: " + errText(e), 5000); });
  } catch (e) { tvLog("Live TV launch threw: " + errText(e)); }
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
    tvLog("Tuned to " + (ch.channelName || ("channel " + major)) + " — opening Samsung Live TV to play it\u2026");
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
        done("Direct tuning isn't working from the launcher. The button above opens Samsung Live TV (Air + recents).");
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

  var diag = $("diag");
  if (diag) {
    diag.textContent = "Viewport " + window.innerWidth + "\u00D7" + window.innerHeight +
      " \u00B7 DPR " + (window.devicePixelRatio || 1) +
      " \u00B7 Screen " + window.screen.width + "\u00D7" + window.screen.height;
  }
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
  if (name === "settings") renderSettings();
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
  if (state.view !== "apps") switchView("apps");
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
  var os = $("open-settings");
  if (os) os.addEventListener("click", function () {
    var st = $("set-status");
    if (st) st.textContent = "Launching Samsung Settings (com.samsung.tv.coba.setting)\u2026";
    try {
      TZ.application.launch("com.samsung.tv.coba.setting",
        function () { if (st) st.textContent = "Launch accepted — Settings should be on screen now."; },
        function (e) { if (st) st.textContent = "Settings launch failed: " + errText(e); });
    } catch (e) { if (st) st.textContent = "Settings launch threw: " + errText(e); }
  });
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
  });
  document.addEventListener("keydown", function (e) {
    var k = e.keyCode;
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
  try {
    if (TZ.tvinputdevice && TZ.tvinputdevice.registerKey) TZ.tvinputdevice.registerKey("Return");
  } catch (e) {}
  loadApps(function () {
    loadPinned();
    renderHomeGrid();
    renderChannels();
    renderAppStore();
    renderInputs();
    renderSettings();
    bindUI();
    startClock();
    switchView("apps");
    if (!TIZEN.real) console.log("[launcher] desktop preview mode — tizen APIs mocked");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
})();
