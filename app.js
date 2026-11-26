/* Console Club — app.js v4.2
   Home / Rates / Arena / 8-step booking (PlayBox-style) with 50% UPI advance, live slot locking & Canvas PNG Receipt with CONSOLECLUB watermark. */
(() => {
"use strict";

/* ===== 1. CONFIG ===== */
const CONFIG = {
  wa: "917830700786",
  phoneShow: "+91 78307 00786",
  maps: "https://maps.app.goo.gl/ecQEYEdN6ZVGn4866",
  addr: "Console Club – The Gaming Arena, Imperial Plaza, opp. Darjeeling Food Point, beside Dawa India Outlet, Hamdard Nagar, Jamalpur, Aligarh, Uttar Pradesh 202001",
  upiId: "q292825506@ybl"
};

/* Official games roster (games-poster.jpg) */
const ROSTER = {
  ps5: ["GTA V", "Assassin's Creed Mirage", "Resident Evil Village", "Resident Evil 9", "Ghost of Tsushima", "RDR 2", "God of War Ragnarök", "Marvel's Spider-Man 2", "Gran Turismo 7", "F1", "Forza Horizon 5", "Need for Speed Unbound", "Asphalt Legends", "The Last of Us Part I"],
  ps5Multi: ["Tekken 7", "Tekken 8", "EA SPORTS FC 26", "WWE 2K26", "It Takes Two"],
  ps4: ["God of War", "GTA V", "RDR 2", "The Crew Motorfest", "Assassin's Creed Odyssey", "Ghost of Tsushima", "The Last of Us Part II", "Uncharted: The Lost Legacy"],
  ps4Multi: ["Cricket 24", "Tekken 7"]
};

/* Gear cards: [key, title, blurb, label] — no image files needed */
const GEAR = [
  ["ps5", "PS5 Gaming", "Next-gen console, 1 or 2 players.", "PS5"],
  ["ps4", "PS4 Gaming", "Budget-friendly solo or co-op sessions.", "PS4"],
  ["wheel", "Steering Wheel", "Racing wheel with pedal set.", "WHEEL"],
  ["vr", "VR Gaming", "Fully immersive VR sessions.", "VR"],
  ["vrwheel", "VR + Steering", "VR headset plus racing wheel.", "VR+WHEEL"]
];
const FACTS = ["Pay 50% advance to lock slot", "Clock starts at booked time", "Extra time at hourly rate", "No refund once started"];

/* ===== 2. DATA (complete poster rates, shown from the start) ===== */
const PLANS = {
  ps5:    { n: "PS5 Gaming",     sub: "PS5 · 1 or 2 Players",            p: 1, r: [["30 Mins", 30, 70, 110], ["1 Hour", 60, 120, 200], ["2 Hours", 120, 200, 350], ["3 Hours", 180, 300, 530]], night: [200, 300] },
  ps4:    { n: "PS4 Gaming",     sub: "PS4 · 1 or 2 Players",            p: 1, r: [["30 Mins", 30, 50, 80], ["1 Hour", 60, 80, 130], ["2 Hours", 120, 140, 220], ["3 Hours", 180, 200, 320]], night: [120, 200] },
  wheel:  { n: "Steering Wheel", sub: "Racing Sim · 1 Player",          p: 0, r: [["30 Mins", 30, 100], ["1 Hour", 60, 160], ["2 Hours", 120, 320]], night: [280, 280] },
  vr:     { n: "VR Gaming",      sub: "Virtual Reality · 1 Player",     p: 0, r: [["30 Mins", 30, 120], ["1 Hour", 60, 200], ["2 Hours", 120, 400]], night: [300, 300] },
  vrwheel:{ n: "VR + Steering",  sub: "VR + Racing Rig · 1 Player",     p: 0, r: [["30 Mins", 30, 200], ["1 Hour", 60, 330], ["2 Hours", 120, 660]], night: [400, 400] },
  gta6:   { n: "GTA VI",         sub: "PS5 · Next-Gen Launch Station",  p: 0, r: [["1 Hour", 60, 120], ["2 Hours", 120, 200], ["3 Hours", 180, 300], ["4 Hours", 240, 400]], night: [200, 200] }
};
const STATIONS = ["ps5", "ps4", "wheel", "vr", "vrwheel", "gta6"];

const sessionPrice = (key, mins, players, startTime) => {
  const P = PLANS[key] || PLANS.ps5;
  const eff = P.p ? players : 1;
  if (startTime && isNightTime(startTime)) {
    const hr = eff === 2 ? P.night[1] : P.night[0];
    return Math.round((hr * mins) / 60);
  }
  const row = P.r.find(x => x[1] === mins);
  if (row) return eff === 2 && row[3] !== undefined ? row[3] : row[2];
  const hourly = (P.r.find(x => x[1] === 60) || P.r[0])[2];
  return Math.round((hourly * mins) / 60);
};
const inr = n => "₹" + n;

/* ===== 3. PURE LOGIC ===== */
const IST = "Asia/Kolkata";
const IST_PARTS = new Intl.DateTimeFormat("en-US", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const istNow = () => {
  const o = {};
  for (const p of IST_PARTS.formatToParts(new Date())) o[p.type] = p.value;
  return { ymd: `${o.year}-${o.month}-${o.day}`, mins: ((+o.hour) % 24) * 60 + (+o.minute) };
};
const addDays = (ymd, n) => new Date(Date.parse(ymd + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const dayLabel = s => new Date(s + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const cleanName = s => String(s || "").replace(/\s+/g, " ").trim();
const normPhone = raw => {
  let d = String(raw || "").replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d[0] === "0") d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : "";
};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const t12 = t => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return t || "—";
  const h = +t.slice(0, 2), m = t.slice(3);
  return ((h % 12) || 12) + ":" + m + " " + (h >= 12 ? "PM" : "AM");
};
const timeToMins = t => {
  const [h, m] = String(t || "00:00").split(":").map(Number);
  return (h * 60) + (m || 0);
};
const isNightTime = t => timeToMins(t) < 600;
const statusAt = h => h >= 10 ? ["day", "Day Time · 10 AM – 12 AM"] : h < 7 ? ["night", "Night Special · 12 AM – 7 AM"] : ["", "Closed · opens 10 AM"];

/* ===== 4. SHARED UI ===== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const qs = new URLSearchParams(location.search);
const pg = document.body.dataset.page || "";
const RM = matchMedia("(prefers-reduced-motion:reduce)").matches;
const NAV = [["home", "index.html", "Home"], ["rates", "rates.html", "Rates"], ["arena", "arena.html", "Arena"]];

document.head.insertAdjacentHTML("beforeend", '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 100 100\'%3E%3Crect width=\'100\' height=\'100\' rx=\'20\' fill=\'%23070604\'/%3E%3Ctext x=\'50\' y=\'72\' font-size=\'60\' text-anchor=\'middle\' fill=\'%23FFB320\' font-family=\'Impact\'%3ECC%3C/text%3E%3C/svg%3E">');
const mainEl = $("main");
if (mainEl) mainEl.id = "main";

document.body.insertAdjacentHTML("afterbegin", `<a class="skip" href="#main">Skip to content</a><header class="hd"><div class="w"><a class="lg" href="index.html"><i>CC</i><span>CONSOLE CLUB</span></a><nav class="nv" aria-label="Main">${NAV.map(n => `<a href="${n[1]}"${n[0] === pg ? ' class="on" aria-current="page"' : ""}>${n[2]}</a>`).join("")}<a class="btn sm" href="book.html">Book slot</a></nav></div></header>`);
document.body.insertAdjacentHTML("beforeend", `<footer><div class="w"><div class="fl">CONSOLE CLUB — THE GAMING ARENA</div><p>Play • Relax • Enjoy · Good game. Great memories.</p><p>Imperial Plaza, Hamdard Nagar, Jamalpur, Aligarh 202001 · <a href="tel:+${CONFIG.wa}">${CONFIG.phoneShow}</a></p></div></footer>
<nav class="dock" aria-label="Quick actions"><a class="btn" href="book.html">Book</a><a class="btn gh" href="tel:+${CONFIG.wa}">Call</a><a class="btn gh" href="${CONFIG.maps}" target="_blank" rel="noopener">Map</a><a class="btn gh" href="https://wa.me/${CONFIG.wa}" target="_blank" rel="noopener">Chat</a></nav><div class="toast" id="toast" role="status"></div>`);

let toastTimer;
const toast = m => {
  const t = $("#toast"); if (!t) return;
  t.textContent = m; t.classList.add("on");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 2200);
};
const copy = async (text, msg) => {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const a = document.createElement("textarea");
    a.value = text; a.style.cssText = "position:fixed;opacity:0";
    document.body.append(a); a.select();
    try { document.execCommand("copy"); } catch (_) {}
    a.remove();
  }
  toast(msg);
};

/* Universal rounded rectangle helper (works on all browsers) */
const drawRoundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

/* ===== RECEIPT PNG GENERATOR (BIG CONSOLECLUB WATERMARK) ===== */
const downloadReceiptPNG = (r, durLabelFn) => {
  try {
    const W = 900, H = 1220;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");

    // 1. Dark luxury background
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#140e07");
    bg.addColorStop(0.5, "#090704");
    bg.addColorStop(1, "#160f06");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 2. Gold outer border
    ctx.strokeStyle = "#FFB320";
    ctx.lineWidth = 4;
    ctx.strokeRect(26, 26, W - 52, H - 52);
    ctx.strokeStyle = "rgba(255,179,32,0.22)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(40, 40, W - 80, H - 80);

    // 3. BIG diagonal CONSOLECLUB watermark across the receipt
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-Math.PI / 5.5);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "900 128px Impact, 'Arial Black', sans-serif";
    ctx.fillStyle = "rgba(255, 179, 32, 0.085)";
    ctx.fillText("CONSOLECLUB", 0, -180);
    ctx.fillText("CONSOLECLUB", 0, 40);
    ctx.fillText("CONSOLECLUB", 0, 260);
    ctx.restore();

    // 4. Header block
    ctx.textAlign = "center";
    ctx.fillStyle = "#FFB320";
    ctx.font = "700 22px Arial, sans-serif";
    ctx.fillText("OFFICIAL BOOKING PASS", W / 2, 102);

    ctx.fillStyle = "#F4ECDD";
    ctx.font = "900 68px Impact, 'Arial Black', sans-serif";
    ctx.fillText("CONSOLE CLUB", W / 2, 172);

    ctx.fillStyle = "#B8AA91";
    ctx.font = "600 20px Arial, sans-serif";
    ctx.fillText("THE GAMING ARENA  •  JAMALPUR, ALIGARH", W / 2, 208);

    // Status pill
    ctx.fillStyle = "#1f8a4c";
    drawRoundRect(ctx, W / 2 - 190, 234, 380, 44, 22);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 19px Arial, sans-serif";
    ctx.fillText("✓  SLOT LOCKED  •  50% ADVANCE PAID", W / 2, 263);

    // Divider
    ctx.strokeStyle = "rgba(255,179,32,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(75, 308); ctx.lineTo(W - 75, 308); ctx.stroke();

    // Receipt ID & Setup highlight
    ctx.textAlign = "left";
    ctx.fillStyle = "#B8AA91";
    ctx.font = "700 18px Arial, sans-serif";
    ctx.fillText("RECEIPT ID", 80, 355);
    ctx.fillStyle = "#FFB320";
    ctx.font = "900 44px 'Courier New', monospace";
    ctx.fillText(String(r.receipt_hash), 80, 404);

    ctx.textAlign = "right";
    ctx.fillStyle = "#B8AA91";
    ctx.font = "700 18px Arial, sans-serif";
    ctx.fillText("STATION / SETUP", W - 80, 355);
    ctx.fillStyle = "#F4ECDD";
    ctx.font = "900 42px Impact, 'Arial Black', sans-serif";
    ctx.fillText(String(r.setup).toUpperCase(), W - 80, 404);

    // 5. Details table
    const rows = [
      ["Gamer Name", r.name],
      ["Phone Number", r.phone],
      ["Booking Date", r.booking_date],
      ["Start Time", t12(r.booking_time)],
      ["Duration", durLabelFn(r.duration_mins)],
      ["Players", `${r.players} Player${r.players > 1 ? "s" : ""}`]
    ];

    let y = 468;
    rows.forEach(([k, v]) => {
      ctx.fillStyle = "rgba(255,179,32,0.06)";
      ctx.fillRect(75, y - 34, W - 150, 52);
      ctx.textAlign = "left";
      ctx.fillStyle = "#B8AA91";
      ctx.font = "600 22px Arial, sans-serif";
      ctx.fillText(k, 96, y);
      ctx.textAlign = "right";
      ctx.fillStyle = "#F4ECDD";
      ctx.font = "700 24px Arial, sans-serif";
      ctx.fillText(String(v), W - 96, y);
      y += 66;
    });

    // 6. Payment summary box
    const boxY = y + 16;
    ctx.fillStyle = "rgba(255,179,32,0.11)";
    ctx.strokeStyle = "#FFB320";
    ctx.lineWidth = 2;
    drawRoundRect(ctx, 75, boxY, W - 150, 178, 16);
    ctx.fill();
    ctx.stroke();

    const balance = Math.max(0, r.total_amount - r.advance_amount);
    ctx.textAlign = "left";
    ctx.fillStyle = "#B8AA91";
    ctx.font = "600 22px Arial, sans-serif";
    ctx.fillText("Total Session Fee", 102, boxY + 46);
    ctx.fillText("50% Advance Paid (Online)", 102, boxY + 96);
    ctx.fillText("Balance Payable at Lounge", 102, boxY + 146);

    ctx.textAlign = "right";
    ctx.fillStyle = "#F4ECDD";
    ctx.font = "700 24px Arial, sans-serif";
    ctx.fillText(inr(r.total_amount), W - 102, boxY + 46);
    ctx.fillStyle = "#FFB320";
    ctx.font = "900 32px Arial, sans-serif";
    ctx.fillText(inr(r.advance_amount), W - 102, boxY + 98);
    ctx.fillStyle = "#F4ECDD";
    ctx.font = "700 24px Arial, sans-serif";
    ctx.fillText(inr(balance), W - 102, boxY + 146);

    // 7. Footer info
    ctx.textAlign = "center";
    ctx.fillStyle = "#B8AA91";
    ctx.font = "600 18px Arial, sans-serif";
    ctx.fillText("Show this receipt at the Console Club counter upon arrival.", W / 2, H - 104);
    ctx.fillStyle = "#FFB320";
    ctx.font = "700 18px Arial, sans-serif";
    ctx.fillText(`Imperial Plaza, Hamdard Nagar, Jamalpur, Aligarh  •  ${CONFIG.phoneShow}`, W / 2, H - 68);

    // Trigger download (Blob with DataURL fallback)
    const cleanId = String(r.receipt_hash || "PASS").replace(/[^A-Za-z0-9-]/g, "");
    const fileName = `ConsoleClub_Receipt_${cleanId}.png`;
    if (c.toBlob) {
      c.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = fileName;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast("Receipt downloaded ✓");
      }, "image/png");
    } else {
      const link = document.createElement("a");
      link.download = fileName;
      link.href = c.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast("Receipt downloaded ✓");
    }
  } catch (e) {
    console.error("Receipt PNG error:", e);
    toast("Could not download receipt. Please take a screenshot.");
  }
};

/* Reveal helper */
const revealAll = () => $$(".rv:not(.in)").forEach(e => e.classList.add("in"));

/* Pointer card tilt/spotlight */
let lastPointer = null, raf = 0;
const tiltFrame = () => {
  raf = 0;
  const e = lastPointer;
  if (!e || !e.target || !e.target.closest) return;
  const c = e.target.closest(".tilt");
  if (!c) return;
  const r = c.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
  c.style.setProperty("--mx", x * 100 + "%");
  c.style.setProperty("--my", y * 100 + "%");
  if (!c.classList.contains("flat")) {
    c.style.setProperty("--ry", (x - .5) * 10 + "deg");
    c.style.setProperty("--rx", (.5 - y) * 10 + "deg");
  }
};
if (!RM) {
  document.addEventListener("pointermove", e => {
    if (e.pointerType === "touch") return;
    lastPointer = e;
    if (!raf) raf = requestAnimationFrame(tiltFrame);
  }, { passive: true });
  document.addEventListener("pointerleave", e => {
    const c = e.target;
    if (c && c.classList && c.classList.contains("tilt")) {
      c.style.setProperty("--rx", "0deg"); c.style.setProperty("--ry", "0deg");
    }
  }, true);
}

/* Scroll reveal with safe fallback */
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(entries => entries.forEach(x => {
    if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); }
  }), { threshold: .05 });
  $$(".rv").forEach(e => io.observe(e));
}
setTimeout(revealAll, 2000);

/* Live IST status badge */
const st = $("#st");
if (st) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const tick = () => {
    const p = f.formatToParts(new Date());
    const h = (+p.find(x => x.type === "hour").value) % 24;
    const s = statusAt(h);
    st.className = "badge " + s[0];
    const label = $("#stT"), clock = $("#clk");
    if (label) label.textContent = s[1];
    if (clock) clock.textContent = p.filter(x => x.type !== "dayPeriod").map(x => x.value).join("") + " IST";
  };
  tick();
  setInterval(tick, 1000);
}

const renderGear = () => $$("[data-gear]").forEach(el => {
  el.innerHTML = GEAR.map(g => `<a class="tilt gc" href="rates.html?s=${g[0]}"><div class="gi"><span class="gi-tag">${g[3]}</span></div><h3>${g[1]}</h3><span>from ${inr(PLANS[g[0]].r[0][2])}</span><p>${g[2]}</p></a>`).join("");
});

/* ===== 5. PAGES ===== */

/* --- HOME --- */
const home = () => {
  const M = ["PS5", "PS4", "VR GAMING", "STEERING WHEEL", "GTA VI", "HIGH END SETUPS", "COMFY SEATING", "CLEAN & HYGIENIC", "BEST GAMING VIBE", "DRINKS AT MRP", "CHIPS & WAFERS AT MRP"]
    .map(x => `<span>${esc(x)} ⚡</span>`).join("");
  const mq = $("#mq"); if (mq) mq.innerHTML = M + M;
  renderGear();
  $$("[data-dir]").forEach(a => a.href = CONFIG.maps);
  $$("[data-call]").forEach(a => a.href = "tel:+" + CONFIG.wa);
};

/* --- RATES --- */
const rates = () => {
  const A = $("#app"); if (!A) return;
  const q = qs.get("s");
  const S = {
    mode: q === "night" ? "night" : "day",
    set: STATIONS.includes(q) ? q : "ps5",
    pl: qs.get("p") === "2" ? 2 : 1
  };

  const tabs = `<div class="tabs">${[["day", "Day Time (10 AM – 12 AM)"], ["night", "Night Special (12 AM – 7 AM)"]]
    .map(m => `<button class="tb" data-m="${m[0]}" aria-pressed="${S.mode === m[0]}">${m[1]}</button>`).join("")}</div>`;

  const draw = () => {
    if (S.mode === "night") {
      A.innerHTML = `${tabs}
        <div class="tilt flat panel"><div class="ph"><div><h3 class="gold">Night Special</h3><small>Per hour · 12:00 AM – 7:00 AM</small></div></div>
        <ul class="rows">${STATIONS.map(k => {
          const P = PLANS[k];
          const rateTxt = P.p ? `${inr(P.night[0])} <small>1P</small> / ${inr(P.night[1])} <small>2P</small>` : `${inr(P.night[0])} / hr`;
          return `<li class="row"><span>${P.n}</span><b>${rateTxt}</b><a class="btn sm" href="book.html?s=${k}&m=60&p=1">Book</a></li>`;
        }).join("")}</ul></div>${facts()}`;
      return;
    }

    const P = PLANS[S.set];
    A.innerHTML = `${tabs}
      <div class="chips">${STATIONS.map(s => `<button class="tb" data-s="${s}" aria-pressed="${S.set === s}">${PLANS[s].n}</button>`).join("")}</div>
      <div class="tilt flat panel"><div class="ph"><div><h3 class="gold">${P.n}</h3><small>${P.sub}</small></div>
      ${P.p ? `<div class="seg">${[1, 2].map(n => `<button class="tb" data-p="${n}" aria-pressed="${S.pl === n}">${n} Player${n > 1 ? "s" : ""}</button>`).join("")}</div>` : ""}</div>
      <ul class="rows">${P.r.map(r => {
        const fee = P.p && S.pl === 2 && r[3] !== undefined ? r[3] : r[2];
        return `<li class="row"><span>${r[0]}</span><b>${inr(fee)}</b><a class="btn sm" href="book.html?s=${S.set}&m=${r[1]}&p=${P.p ? S.pl : 1}">Book This Slot</a></li>`;
      }).join("")}</ul></div>${facts()}`;
  };

  A.onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    const d = b.dataset;
    if (d.m) S.mode = d.m;
    if (d.s) S.set = d.s;
    if (d.p) S.pl = +d.p;
    draw();
  };
  draw();
};

/* --- BOOKING (PlayBox-style 8-step flow) --- */
const book = () => {
  const A = $("#app"); if (!A) return;

  const now0 = istNow();
  const today = now0.ymd;
  const tomorrow = addDays(today, 1);

  const buildSlots = (ymd) => {
    const nowMins = istNow().mins;
    const isToday = ymd === today;
    const day = [], night = [];
    for (let m = 10 * 60; m <= 23 * 60 + 30; m += 30) {
      day.push({ time: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, mins: m, past: isToday && m <= nowMins });
    }
    for (let m = 0; m <= 6 * 60 + 30; m += 30) {
      night.push({ time: `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`, mins: m, past: isToday && m <= nowMins });
    }
    return { day, night };
  };

  const qS = qs.get("s");
  const initStation = STATIONS.includes(qS) ? qS : (qS === "day" || qS === "night" ? "gta6" : "ps5");
  const initPlayers = qs.get("p") === "2" ? 2 : 1;
  const initMins = parseInt(qs.get("m") || "60", 10) || 60;

  const B = { players: initPlayers, station: initStation, date: today, durationMins: initMins, time: "", name: "", phone: "", screenshotFile: null };
  try {
    const saved = JSON.parse(localStorage.getItem("ccme") || "{}");
    B.name = cleanName(saved.n);
    B.phone = normPhone(saved.p);
  } catch (e) {}

  let step = 1;
  let lockedSlots = [];
  let busy = false;
  let receiptData = null;
  let errMsg = "";

  const syncLockedSlots = async () => {
    try {
      const res = await fetch("/api/locked-slots", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        if (d.success) lockedSlots = d.locked_slots || [];
      }
    } catch (e) { console.warn("Slot sync error:", e); }
  };

  const isSlotReserved = (ymd, startMins) => {
    const setup = PLANS[B.station].n;
    const reqEnd = startMins + B.durationMins;
    return lockedSlots.some(l => {
      if (l.booking_date !== ymd || l.setup !== setup) return false;
      const bStart = timeToMins(l.booking_time);
      const bEnd = bStart + (parseInt(l.duration_mins, 10) || 60);
      return startMins < bEnd && reqEnd > bStart;
    });
  };

  const durLabel = m => m < 60 ? `${m} Minutes` : m === 60 ? "1 Hour" : `${m / 60} Hours`;
  const header = n => `<div class="pb-top"><span>CONSOLE CLUB · BOOKING</span><b>STEP 0${n} / 08</b></div><div class="pb-bar"><i style="width:${Math.round((n / 8) * 100)}%"></i></div>`;
  const footBack = `<button type="button" class="btn gh" data-nav="back">← Back</button>`;
  const footNext = `<button type="button" class="btn" data-nav="next">Continue →</button>`;

  const draw = async (doScroll = true) => {
    try {
      if (step === 5) await syncLockedSlots();

      const P = PLANS[B.station];
      const eff = P.p ? B.players : 1;
      const totalFee = sessionPrice(B.station, B.durationMins, eff, B.time || "12:00");
      const advance50 = Math.round(totalFee * 0.5);
      const balance50 = totalFee - advance50;
      let html = `<div class="pb-wrap">`;

      if (step === 1) {
        html += header(1) + `
          <div class="pb-kicker">STEP 01 // HEADCOUNT</div>
          <h3 class="pb-h">HOW MANY GAMERS?</h3>
          <p class="pb-sub">Select player headcount for your station session.</p>
          <div class="pb-grid2">
            <button type="button" class="pb-card${B.players === 1 ? " sel" : ""}" data-pl="1">
              <div style="display:flex;justify-content:space-between;align-items:center"><div class="pb-ic">👤</div><span class="pb-chk">${B.players === 1 ? "✓" : ""}</span></div>
              <h4 style="margin-top:8px">1 GAMER</h4><small>Solo station setup</small>
            </button>
            <button type="button" class="pb-card${B.players === 2 ? " sel" : ""}" data-pl="2">
              <div style="display:flex;justify-content:space-between;align-items:center"><div class="pb-ic">👥</div><span class="pb-chk">${B.players === 2 ? "✓" : ""}</span></div>
              <h4 style="margin-top:8px">2 GAMERS</h4><small>Co-op / Head-to-head (PS4 & PS5)</small>
            </button>
          </div>
          <div class="pb-hint">⚡ Need 3+ players? Additional players can be added right at the lounge counter.</div>
          <div class="pb-foot"><a class="btn gh sm" href="rates.html">View All Rates</a>${footNext}</div>`;
      }
      else if (step === 2) {
        html += header(2) + `
          <div class="pb-kicker">STEP 02 // HARDWARE</div>
          <h3 class="pb-h">SELECT STATION</h3>
          <p class="pb-sub">Choose your station configuration at Console Club.</p>
          <div class="pb-stack">${STATIONS.map(k => {
            const stn = PLANS[k];
            const on = B.station === k;
            return `<button type="button" class="pb-card pb-card-row${on ? " sel" : ""}" data-st="${k}">
              <div class="pb-card-l"><div class="pb-ic">🎮</div><div><h4>${stn.n}</h4><small>${stn.sub} · from ${inr(stn.r[0][2])}</small></div></div>
              <span class="pb-chk">${on ? "✓" : "›"}</span></button>`;
          }).join("")}</div>
          <div class="pb-foot">${footBack}${footNext}</div>`;
      }
      else if (step === 3) {
        html += header(3) + `
          <div class="pb-kicker">STEP 03 // SCHEDULE</div>
          <h3 class="pb-h">SELECT DATE</h3>
          <p class="pb-sub">Choose your reservation day from the active 24-hour window (India time).</p>
          <div class="pb-stack">
            <button type="button" class="pb-card pb-card-row${B.date === today ? " sel" : ""}" data-dt="${today}">
              <div class="pb-card-l"><div class="pb-ic">📅</div><div><h4>TODAY (${dayLabel(today).toUpperCase()})</h4><small>${today}</small></div></div>
              <span class="pb-chk">${B.date === today ? "✓" : "›"}</span></button>
            <button type="button" class="pb-card pb-card-row${B.date === tomorrow ? " sel" : ""}" data-dt="${tomorrow}">
              <div class="pb-card-l"><div class="pb-ic">📅</div><div><h4>TOMORROW (${dayLabel(tomorrow).toUpperCase()})</h4><small>${tomorrow}</small></div></div>
              <span class="pb-chk">${B.date === tomorrow ? "✓" : "›"}</span></button>
          </div>
          <div class="pb-foot">${footBack}${footNext}</div>`;
      }
      else if (step === 4) {
        const durs = P.r.map(row => ({ label: row[0], mins: row[1], fee: eff === 2 && row[3] !== undefined ? row[3] : row[2] }));
        if (!durs.some(d => d.mins === B.durationMins)) B.durationMins = (durs.find(d => d.mins === 60) || durs[0]).mins;
        const desc = { 30: "Quick warmup or high-tempo match", 60: "Standard full gaming session", 120: "Deep-dive squad session", 180: "Extended marathon block", 240: "Ultimate 4-hour arena pass" };
        html += header(4) + `
          <div class="pb-kicker">STEP 04 // TIME BLOCK</div>
          <h3 class="pb-h">HOW LONG WILL YOU PLAY?</h3>
          <p class="pb-sub">Select your play duration for ${P.n} (${eff} Gamer${eff > 1 ? "s" : ""}).</p>
          <div class="pb-stack">${durs.map(d => {
            const on = B.durationMins === d.mins;
            return `<button type="button" class="pb-card pb-card-row${on ? " sel" : ""}" data-dur="${d.mins}">
              <div class="pb-card-l"><div class="pb-ic">⏱️</div><div><h4>${d.label.toUpperCase()}</h4><small>${desc[d.mins] || "Full station access"} · Day rate ${inr(d.fee)}</small></div></div>
              <span class="pb-chk">${on ? "✓" : "›"}</span></button>`;
          }).join("")}</div>
          <p class="note">Night Special slots (12:00 – 6:30 AM) are charged at the night hourly rate. Your exact total appears in the summary.</p>
          <div class="pb-foot">${footBack}${footNext}</div>`;
      }
      else if (step === 5) {
        const { day, night } = buildSlots(B.date);
        const slotBtn = sl => {
          const reserved = isSlotReserved(B.date, sl.mins);
          const disabled = sl.past || reserved;
          const on = B.time === sl.time && !disabled;
          const cls = `pb-slot${on ? " sel" : ""}${disabled ? " booked" : ""}`;
          const title = reserved ? "Already booked" : sl.past ? "Time passed" : "Available";
          return `<button type="button" class="${cls}" data-tm="${sl.time}" ${disabled ? "disabled" : ""} title="${title}">${t12(sl.time)}</button>`;
        };
        html += header(5) + `
          <div class="pb-kicker">STEP 05 // EXACT SLOT</div>
          <h3 class="pb-h">CHOOSE TIME SLOT</h3>
          <p class="pb-sub">Start times for <b>${B.durationMins} min</b> on <b>${B.date}</b> (${P.n}).</p>
          <div class="pb-slots">
            <div class="pb-shift-lbl">☀️ Day Time (10:00 AM – 11:30 PM)</div>${day.map(slotBtn).join("")}
            <div class="pb-shift-lbl">🌙 Night Special (12:00 AM – 6:30 AM)</div>${night.map(slotBtn).join("")}
          </div>
          <div class="pb-legend">
            <span><i style="background:var(--s1);border:1px solid var(--ln)"></i> Available</span>
            <span><i style="background:var(--g)"></i> Selected</span>
            <span><i style="background:#3a352f"></i> Reserved / Booked</span>
          </div>
          <div class="err" role="alert">${esc(errMsg)}</div>
          <div class="pb-foot">${footBack}${footNext}</div>`;
      }
      else if (step === 6) {
        const shiftTag = isNightTime(B.time) ? "Night Special Rate" : "Day Time Rate";
        html += header(6) + `
          <div class="pb-kicker">STEP 06 // SUMMARY</div>
          <h3 class="pb-h">SESSION PRICING</h3>
          <p class="pb-sub">Review the complete session pricing breakdown before pre-booking.</p>
          <div class="pb-sum">
            <div class="pb-sum-row"><span>Station</span><b>${P.n}</b></div>
            <div class="pb-sum-row"><span>Headcount</span><b>${eff} Player${eff > 1 ? "s" : ""}</b></div>
            <div class="pb-sum-row"><span>Date &amp; Slot</span><b>${B.date} at ${t12(B.time)}</b></div>
            <div class="pb-sum-row"><span>Duration</span><b>${durLabel(B.durationMins)} (${shiftTag})</b></div>
            <div class="pb-sum-row pb-sum-tot"><span>TOTAL FEE</span><b>${inr(totalFee)}</b></div>
          </div>
          <div class="pb-half">
            <div>
              <b style="color:var(--g);letter-spacing:.08em;font-size:.85rem">50% PRE-BOOKING ADVANCE</b>
              <small>Pay half now to lock your slot · Remaining ${inr(balance50)} payable at lounge</small>
            </div>
            <div class="amt">${inr(advance50)}</div>
          </div>
          <div class="pb-foot">${footBack}<button type="button" class="btn" data-nav="next">Proceed to Pay ${inr(advance50)} →</button></div>`;
      }
      else if (step === 7) {
        const upiUrl = `upi://pay?pa=${CONFIG.upiId}&pn=ConsoleClub&am=${advance50}&cu=INR`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(upiUrl)}`;
        html += header(7) + `
          <div class="pb-kicker">STEP 07 // PAYMENT GATEWAY</div>
          <h3 class="pb-h">PAY 50% ADVANCE &amp; LOCK SLOT</h3>
          <p class="pb-sub">Scan the merchant QR to pay <b>${inr(advance50)}</b> (half of ${inr(totalFee)}) and upload your payment screenshot.</p>
          <div class="two">
            <label>Gamertag / Full Name
              <input type="text" id="cust-name" value="${esc(B.name)}" placeholder="e.g. ShadowGamer" maxlength="40" autocomplete="name">
            </label>
            <label>Phone / WhatsApp
              <input type="tel" id="cust-phone" value="${esc(B.phone)}" placeholder="10-digit mobile (6-9)" inputmode="numeric" autocomplete="tel" maxlength="16">
            </label>
          </div>
          <div class="tilt flat" style="background:#151008;border-color:var(--g);margin:14px 0;padding:20px;text-align:center">
            <span class="tag" style="margin-bottom:10px">MERCHANT AUTO-FILL UPI QR</span>
            <div style="margin:8px 0">
              <span style="color:var(--mu);font-size:.85rem">Total Session Fee: ${inr(totalFee)} · Balance at Lounge: ${inr(balance50)}</span>
              <div style="font-size:2rem;color:var(--g);font-family:'Bebas Neue',sans-serif">Pay Now (50%): ${inr(advance50)}</div>
            </div>
            <div style="display:inline-block;padding:10px;background:#fff;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.6)">
              <img src="${qrUrl}" alt="Scan UPI QR to pay ${inr(advance50)}" width="200" height="200" style="display:block" onerror="this.hidden=true;this.nextElementSibling.hidden=false">
              <p class="note" hidden style="color:#222;max-width:200px;margin:0">QR unavailable right now. Use the UPI ID below.</p>
            </div>
            <div style="margin-top:12px;font-size:.9rem">UPI ID: <b class="gold">${CONFIG.upiId}</b>
              <button type="button" class="lnk" id="btn-copy-upi" style="font-size:.85rem;padding:0 6px">Copy UPI</button>
            </div>
            <div style="margin-top:8px"><a class="btn sm gh" href="${upiUrl}">Open in UPI App</a></div>
            <div style="font-size:.75rem;color:var(--mu);margin-top:6px">Scan with GPay, PhonePe, Paytm or BHIM. Amount ${inr(advance50)} is auto-filled.</div>
          </div>
          <label style="margin-top:14px">Upload Payment Screenshot (Required)
            <input type="file" id="cust-screenshot" accept="image/*" style="padding:10px;margin-top:6px">
            ${B.screenshotFile ? `<div style="color:var(--g);font-size:.82rem;margin-top:6px">✓ Selected: ${esc(B.screenshotFile.name)}</div>` : ""}
          </label>
          <div class="err" id="form-err" role="alert">${esc(errMsg)}</div>
          <div class="pb-foot">
            <button type="button" class="btn gh" data-nav="back" ${busy ? "disabled" : ""}>← Back</button>
            <button type="button" class="btn" id="btn-submit-booking" ${busy ? "disabled" : ""}>${busy ? "Locking Slot…" : "Submit &amp; Lock Slot"}</button>
          </div>`;
      }
      else if (step === 8 && receiptData) {
        html += header(8) + `
          <span class="tag" style="display:block;margin:0 auto 16px;background:#1f8a4c">SLOT LOCKED · RECEIPT GENERATED</span>
          <div class="tk" id="printable-receipt" style="position:relative;overflow:hidden">
            <div aria-hidden="true" style="position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;z-index:1;overflow:hidden">
              <span style="font:900 3.6rem/1 'Bebas Neue',Impact,sans-serif;letter-spacing:.12em;color:rgba(255,179,32,.09);transform:rotate(-26deg);white-space:nowrap;user-select:none">CONSOLECLUB</span>
            </div>
            <div class="tk-m" style="position:relative;z-index:2">
              <div class="tk-t"><span>CONSOLE CLUB · GAME PASS</span><span class="gold" style="font-weight:700">${esc(receiptData.receipt_hash)}</span></div>
              <div class="tk-n gold">${esc(receiptData.setup)}</div>
              <div class="tk-g">
                <div><small>DATE</small><b>${esc(receiptData.booking_date)}</b></div>
                <div><small>START TIME</small><b>${t12(receiptData.booking_time)}</b></div>
                <div><small>PLAYERS</small><b>${receiptData.players}</b></div>
              </div>
              <div class="tk-p">
                <div><small>GAMER</small><b>${esc(receiptData.name)}</b></div>
                <div><small>DURATION</small><b>${durLabel(receiptData.duration_mins)}</b></div>
                <div><small>PHONE</small><b>${esc(receiptData.phone)}</b></div>
              </div>
            </div>
            <div class="tk-s" style="position:relative;z-index:2">
              <div>
                <small>50% ADVANCE PAID</small>
                <div class="tot">${inr(receiptData.advance_amount)}</div>
                <small style="color:var(--mu);margin-top:4px">Total: ${inr(receiptData.total_amount)} · Due at Lounge: ${inr(receiptData.total_amount - receiptData.advance_amount)}</small>
              </div>
              <div>
                <small>RECEIPT ID</small>
                <div class="rf" style="color:var(--g)">${esc(receiptData.receipt_hash)}</div>
                <div class="bc"></div>
              </div>
            </div>
          </div>
          <div class="cta" style="justify-content:center;margin-top:20px">
            <button type="button" class="btn" id="btn-print-receipt">Download Receipt (PNG)</button>
            <button type="button" class="btn gh" id="btn-copy-hash">Copy Receipt ID</button>
          </div>
          <p class="note" style="text-align:center">Your slot is locked and sent to the arena owner for verification. Show <b>${esc(receiptData.receipt_hash)}</b> at the counter when you arrive. <button type="button" class="lnk" id="btn-new-booking">Book Another Slot</button></p>`;
      }

      html += `</div>`;
      A.innerHTML = html;
      wire(P, eff, totalFee, advance50);
      if (doScroll) scrollTo({ top: 0, behavior: RM ? "auto" : "smooth" });
    } catch (err) {
      console.error("Booking render error:", err);
      A.innerHTML = `<p class="note">Something went wrong loading the booking. <a href="book.html">Reload the page</a> or call ${CONFIG.phoneShow}.</p>`;
    }
  };

  /* Attach handlers after each render */
  const wire = (P, eff, totalFee, advance50) => {
    if (step === 7) {
      const copyBtn = $("#btn-copy-upi");
      if (copyBtn) copyBtn.onclick = () => copy(CONFIG.upiId, "Merchant UPI ID Copied ✓");
      const nameIn = $("#cust-name"), phoneIn = $("#cust-phone"), shotIn = $("#cust-screenshot");
      if (nameIn) nameIn.oninput = e => { B.name = e.target.value; errMsg = ""; };
      if (phoneIn) phoneIn.oninput = e => { B.phone = e.target.value; errMsg = ""; };
      if (shotIn) shotIn.onchange = e => {
        if (e.target.files && e.target.files[0]) { B.screenshotFile = e.target.files[0]; errMsg = ""; draw(false); }
      };
      const submit = $("#btn-submit-booking");
      if (submit) submit.onclick = () => submitBooking(P, eff, totalFee, advance50);
    }
    if (step === 8 && receiptData) {
      const p = $("#btn-print-receipt"), c = $("#btn-copy-hash"), n = $("#btn-new-booking");
      if (p) p.onclick = () => downloadReceiptPNG(receiptData, durLabel);
      if (c) c.onclick = () => copy(receiptData.receipt_hash, "Receipt ID Copied ✓");
      if (n) n.onclick = () => { B.time = ""; B.screenshotFile = null; receiptData = null; errMsg = ""; step = 1; draw(true); };
    }
  };

  const submitBooking = async (P, eff, totalFee, advance50) => {
    if (busy) return;
    const cleanN = cleanName(B.name);
    const normP = normPhone(B.phone);
    const fail = msg => { errMsg = msg; const el = $("#form-err"); if (el) el.textContent = msg; };
    if (cleanN.length < 2) return fail("Enter a valid gamertag or name (2–40 chars).");
    if (!normP) return fail("Enter a valid 10-digit Indian mobile number (starts with 6–9).");
    if (!B.screenshotFile) return fail("Please upload your 50% advance payment screenshot.");

    busy = true; errMsg = ""; draw(false);
    try {
      const fd = new FormData();
      fd.append("setup", P.n);
      fd.append("players", String(eff));
      fd.append("booking_date", B.date);
      fd.append("booking_time", B.time);
      fd.append("duration_mins", String(B.durationMins));
      fd.append("name", cleanN);
      fd.append("phone", normP);
      fd.append("total_amount", String(totalFee));
      fd.append("advance_amount", String(advance50));
      fd.append("screenshot", B.screenshotFile);

      const res = await fetch("/api/book", { method: "POST", body: fd });
      let data = {};
      try { data = await res.json(); } catch (e) { data = { success: false, error: "Server returned an unexpected response." }; }
      busy = false;

      if (data.success) {
        try { localStorage.setItem("ccme", JSON.stringify({ n: cleanN, p: normP })); } catch (e) {}
        receiptData = {
          receipt_hash: data.receipt_hash, setup: P.n, booking_date: B.date, booking_time: B.time,
          players: eff, duration_mins: B.durationMins, name: cleanN, phone: normP,
          total_amount: totalFee, advance_amount: advance50
        };
        step = 8;
        draw(true);
      } else if (res.status === 409) {
        B.time = "";
        step = 5;
        errMsg = data.error || "That slot was just booked. Please choose another time.";
        draw(true);
      } else {
        errMsg = data.error || "Booking failed. Please try again.";
        draw(false);
      }
    } catch (err) {
      busy = false;
      errMsg = "Network error submitting booking. Please try again.";
      draw(false);
    }
  };

  A.onclick = e => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.pl) { B.players = +d.pl; draw(false); }
    else if (d.st) { B.station = d.st; B.time = ""; draw(false); }
    else if (d.dt) { B.date = d.dt; B.time = ""; draw(false); }
    else if (d.dur) { B.durationMins = +d.dur; B.time = ""; draw(false); }
    else if (d.tm) { B.time = d.tm; errMsg = ""; draw(false); }
    else if (d.nav === "back") { errMsg = ""; if (step > 1) { step--; draw(true); } }
    else if (d.nav === "next") {
      if (step === 5 && !B.time) { errMsg = "Please choose an available time slot."; draw(false); return; }
      errMsg = "";
      step++;
      draw(true);
    }
  };

  draw(false);
};

/* --- ARENA --- */
const arena = () => {
  const rules = [
    "Please handle controllers and equipment with care.",
    "No abusive language, fighting or disruptive behaviour.",
    "Payment must be made before starting the session.",
    "Gaming time begins from the booked/exact time.",
    "Extra time will be charged as per the gaming duration.",
    "Maximum players depend on the game and available setup.",
    "Damaging equipment may result in recovery of the repair/replacement cost.",
    "Please keep your gaming station clean.",
    "Once a session has started, cancellation/refund is not allowed.",
    "Respect other players. Play fair. Have fun."
  ];
  const rulesEl = $("#rules");
  if (rulesEl) rulesEl.innerHTML = rules.map((r, i) => `<li><b>${i + 1}</b><span>${esc(r)}</span></li>`).join("");
  renderGear();

  const lib = $("#lib");
  if (lib) {
    const titles = [...new Set([...ROSTER.ps5, ...ROSTER.ps5Multi, ...ROSTER.ps4, ...ROSTER.ps4Multi])];
    lib.innerHTML = titles.map(x => `<span class="tb st">${esc(x)}</span>`).join("")
      + `<span class="tb st">GTA VI (special station)</span>`;
  }
  $$("[data-dir]").forEach(a => a.href = CONFIG.maps);
  $$("[data-wa]").forEach(a => a.href = `https://wa.me/${CONFIG.wa}?text=${encodeURIComponent("Hi Console Club! I'd like to check slot availability.")}`);
  const call = $("#call"); if (call) call.href = "tel:+" + CONFIG.wa;
  const ph = $("#ph"); if (ph) ph.textContent = CONFIG.phoneShow;
  const cpm = $("#cpm"); if (cpm) cpm.onclick = () => copy(CONFIG.maps, "Maps link copied ✓");
  const cpa = $("#cpa"); if (cpa) cpa.onclick = () => copy(CONFIG.addr, "Address copied ✓");
};

/* Page dispatcher */
const PAGES = { home, rates, book, arena };
try {
  if (PAGES[pg]) PAGES[pg]();
} catch (err) {
  console.error("Console Club page error:", err);
  revealAll();
}

function facts() {
  return `<div class="facts">${FACTS.map(f => `<span>${esc(f)}</span>`).join("")}</div>`;
}
})();
