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
    tune: function (ch, onSuccess, onError) {
      console.log("[mock tizen] tvchannel.tune(" + ch.major + "." + ch.minor + " " + ch.channelName + ")");
      setTimeout(function () { if (onSuccess) onSuccess(); }, 300);
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
    }
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
var LS_KEY = "stv_pinned_v1";
var DEFAULT_KEYWORDS = [
  { kw: "netflix", label: "Netflix" },
  { kw: "disney",  label: "Disney+" },
  { kw: "espn",    label: "ESPN" },
  { kw: "prime",   label: "Prime Video" },
  { kw: "nfl",     label: "NFL" }
];
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
function toast(msg) {
  var t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
}

function startClock() {
  function tick() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes();
    var ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    $("clock").textContent = h + ":" + (m < 10 ? "0" + m : m) + " " + ap;
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
      var app = findAppByKeyword(d.kw);
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
  refocusAfterRender("settings");
}

/* App icon: gold letter tile with the real app icon overlaid when it loads.
 * If the icon image fails, onerror removes it and the letter shows through. */
function appIcon(app, px, radius) {
  var letter = (app && app.name) ? esc(app.name.charAt(0).toUpperCase()) : "?";
  var style = "width:" + px + "px;height:" + px + "px;" +
    "font-size:" + Math.round(px * 0.45) + "px;border-radius:" + radius + "px;";
  var img = (app && app.iconPath)
    ? '<img src="' + esc(app.iconPath) + '" alt="" onerror="this.remove()">'
    : "";
  return '<span class="appicon" style="' + style + '">' + letter + img + "</span>";
}

/* ================= Rendering ================= */
function makeHomeTile(pid) {
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "tile focusable";

  if (pid === LIVE_TV) {
    btn.innerHTML =
      '<span class="live-badge">&#x25CF; LIVE</span>' +
      '<span class="t-ico" style="font-size:60px">&#x1F4E1;</span>' +
      '<span class="t-name">Live TV</span><span class="t-sub">Antenna</span>';
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
      appIcon(null, 96, 48) +
      '<span class="t-name">' + esc(label) + "</span>" +
      '<span class="t-sub">Not installed</span>';
    return btn;
  }

  (function (theApp) {
    btn.innerHTML =
      appIcon(theApp, 96, 22) +
      '<span class="t-name">' + esc(label) + "</span>";
    btn.addEventListener("click", function () { launchApp(theApp); });
  })(app);
  return btn;
}

function renderHomeGrid() {
  var grid = $("home-grid");
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

function renderAppStore() {
  var list = $("appstore-list");
  list.innerHTML = "";
  storeApps().forEach(function (app) {
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
  function fallback() { cb(["TV"]); }
  try {
    TZ.systeminfo.getPropertyValue("VIDEOSOURCE",
      function (v) {
        var c = v && v.connected;
        cb(Array.isArray(c) && c.length ? c : ["TV"]);
      },
      fallback);
  } catch (e) { fallback(); }
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

function tuneChannel(major) {
  toast("Tuning to channel " + major + "\u2026");
  var settled = false;
  function fail(msg) { if (!settled) { settled = true; toast(msg); } }
  function onList(list) {
    if (settled) return;
    settled = true;
    var ch = null;
    (list || []).forEach(function (c) {
      if (!ch && Number(c.major) === Number(major)) ch = c;
    });
    if (!ch) { toast("Channel " + major + " not found on antenna"); return; }
    try {
      TZ.tvchannel.tune(ch,
        function () { toast("Watching " + (ch.channelName || ("channel " + major))); },
        function (e) { toast("Tune failed: " + (e ? ((e.name || "") + " " + (e.message || "")).trim() : "unknown")); });
    } catch (e) { toast("Tune failed: " + (e && e.message ? e.message : e)); }
  }
  function doTune() {
    try {
      // Channels here are antenna channels: ask the AIR tuner for its list
      // directly (the current-source list can belong to a different mode).
      TZ.tvchannel.getChannelList(function (list) {
        if (list && list.length) { onList(list); return; }
        try { TZ.tvchannel.getChannelList(onList, function () { fail("Channel list unavailable"); }); }
        catch (e) { fail("Channel list unavailable"); }
      }, function () {
        try { TZ.tvchannel.getChannelList(onList, function () { fail("Channel list unavailable"); }); }
        catch (e) { fail("Channel list unavailable"); }
      }, "AIR");
    } catch (e) { fail("Channel list unavailable"); }
  }
  // tune() only works while the tuner is the active source; if the launcher
  // was opened over another input, switch to the TV source first, then tune.
  try {
    if (TZ.tvwindow && TZ.tvwindow.getSourceList) {
      TZ.tvwindow.getSourceList(function (sources) {
        var tv = null;
        (sources || []).forEach(function (s) { if (!tv && s.type === "TV") tv = s; });
        if (!tv) { doTune(); return; }
        try { TZ.tvwindow.setSource(tv, function () { doTune(); }, function () { doTune(); }); }
        catch (e) { doTune(); }
      }, function () { doTune(); });
    } else { doTune(); }
  } catch (e) { doTune(); }
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
    if (secondary > primary * 3 + 40) continue; // too far off-axis
    var score = primary + secondary * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) best.focus();
}

function switchView(name) {
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
    target = first || document.querySelector('.side-item[data-view="' + name + '"]');
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
  var items = document.querySelectorAll(".side-item");
  for (var i = 0; i < items.length; i++) {
    (function (btn) {
      btn.addEventListener("click", function () { switchView(btn.getAttribute("data-view")); });
    })(items[i]);
  }
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
  try {
    if (TZ.tvinputdevice && TZ.tvinputdevice.registerKey) TZ.tvinputdevice.registerKey("Return");
  } catch (e) {}
  loadApps(function () {
    loadPinned();
    renderHomeGrid();
    renderChannels();
    renderAppStore();
    renderInputs();
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
