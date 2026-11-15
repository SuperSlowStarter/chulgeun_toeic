/* 출근길 모의토익 — 화면, 응시 흐름, 채점, 오프라인 저장 */
"use strict";

const KEY = { session: "mock-session-v1", history: "mock-history-v1", last: "mock-last-v1", practice: "mock-practice-v1", rate: "mock-rate-v1" };
const AUDIO_CACHE = "mock-audio-v1";
const RC_LIMIT = 75 * 60;
const L = "ABCD";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
const mmss = (sec) => { const s = Math.max(0, Math.round(Math.abs(sec))); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const app = $("#app");
const audio = $("#audio");

const ICON = {
  pause: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" rx="1"/><rect x="9.5" y="2.5" width="3" height="11" rx="1"/></svg>',
  play: '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L4.9 2.1a.6.6 0 0 0-.9.5z"/></svg>',
  grid: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="4" cy="4" r="2"/><circle cx="12" cy="4" r="2"/><circle cx="4" cy="12" r="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  back: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3 5 8l5 5"/></svg>',
};

/* ── 데이터 ── */
let D = null;
const Q = {};          // 문항 번호 → { no, part, set, answer }
const SETS = [];       // 순서대로 모든 세트
let LC_SETS = [], RC_PAGES = [];

function index() {
  D.sets.forEach((st, i) => {
    st.i = i;
    SETS.push(st);
    if (st.part === 2) Q[st.nos[0]] = { no: st.nos[0], part: 2, set: st, answer: st.answer };
    else st.questions.forEach((q) => (Q[q.no] = { ...q, part: st.part, set: st }));
  });
  LC_SETS = SETS.filter((s) => s.part <= 4);
  const p5 = SETS.filter((s) => s.part === 5);
  for (let i = 0; i < p5.length; i += 5) RC_PAGES.push({ part: 5, sets: p5.slice(i, i + 5) });
  SETS.filter((s) => s.part >= 6).forEach((s) => RC_PAGES.push({ part: s.part, sets: [s] }));
}
const NOS_LC = () => LC_SETS.flatMap((s) => s.nos);
const NOS_RC = () => RC_PAGES.flatMap((p) => p.sets.flatMap((s) => s.nos));
const pageOf = (no) => RC_PAGES.findIndex((p) => p.sets.some((s) => s.nos.includes(no)));

/* ── 상태 ── */
let S = store.get(KEY.session, null);      // 진행 중인 시험
let practice = store.get(KEY.practice, {}); // 세트 키 → { ans, checked }
let view = { name: "home" };
const saveS = () => (S ? store.set(KEY.session, S) : store.del(KEY.session));

/* ── 점수 환산 (비공식 근사치) ── */
const LC_TABLE = [[0, 5], [10, 15], [20, 70], [30, 140], [40, 195], [50, 250], [60, 305], [70, 365], [80, 420], [85, 450], [90, 475], [94, 495], [100, 495]];
const RC_TABLE = [[0, 5], [10, 10], [20, 55], [30, 115], [40, 170], [50, 225], [60, 280], [70, 335], [80, 390], [85, 420], [90, 450], [95, 475], [100, 495]];
function scale(table, pct100) {
  for (let i = 1; i < table.length; i++) {
    const [x0, y0] = table[i - 1], [x1, y1] = table[i];
    if (pct100 <= x1) return Math.round((y0 + ((pct100 - x0) / (x1 - x0)) * (y1 - y0)) / 5) * 5;
  }
  return 495;
}
function grade(answers, mode) {
  const parts = {};
  for (const no in Q) {
    const q = Q[no];
    if (mode === "lc" && q.part > 4) continue;
    if (mode === "rc" && q.part < 5) continue;
    parts[q.part] = parts[q.part] || [0, 0];
    parts[q.part][1]++;
    if (answers[no] === q.answer) parts[q.part][0]++;
  }
  const sum = (ps) => ps.reduce((a, p) => [a[0] + (parts[p]?.[0] || 0), a[1] + (parts[p]?.[1] || 0)], [0, 0]);
  const lc = mode === "rc" ? null : sum([2, 3, 4]);
  const rc = mode === "lc" ? null : sum([5, 6, 7]);
  return {
    parts,
    lc: lc && { raw: lc[0], total: lc[1], score: scale(LC_TABLE, (lc[0] / lc[1]) * 100) },
    rc: rc && { raw: rc[0], total: rc[1], score: scale(RC_TABLE, (rc[0] / rc[1]) * 100) },
  };
}

/* ── 공통 렌더 조각 ── */
function optsHTML(q, { ans, reveal, disabled }) {
  return `<div class="opts">${q.options.map((o, i) => {
    const l = L[i];
    let cls = "opt";
    if (reveal) { if (l === q.answer) cls += " right"; else if (ans === l) cls += " wrong"; }
    return `<button class="${cls}" data-act="ans" data-no="${q.no}" data-l="${l}" aria-pressed="${ans === l}" ${disabled ? "disabled" : ""}><span class="b">${l}</span><span>${esc(o)}</span></button>`;
  }).join("")}</div>`;
}
function graphicHTML(g) {
  if (!g) return "";
  return `<div class="graphic">${g.title ? `<div class="gt">${esc(g.title)}</div>` : ""}<table><thead><tr>${g.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${g.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function qHTML(q, ctx) {
  const flag = ctx.flags ? `<button class="flag" data-act="flag" data-no="${q.no}" aria-pressed="${!!ctx.flags[q.no]}">다시 볼 문제</button>` : "";
  return `<div class="q" id="q${q.no}" data-q="${q.no}"><div class="qhead"><span class="qno">${q.no}.</span><span class="qtext">${esc(q.q)}</span>${flag}</div>${optsHTML(q, { ans: ctx.answers[q.no], reveal: ctx.reveal, disabled: ctx.disabled })}${ctx.reveal ? revealHTML(q, ctx.answers[q.no]) : ""}</div>`;
}
function revealHTML(q, ans) {
  const ok = ans === q.answer;
  return `<p class="verdict ${ok ? "ok" : "no"}">${ok ? "정답" : ans ? `오답 · 고른 답 ${ans} · 정답 ${q.answer}` : `안 풂 · 정답 ${q.answer}`}</p>${q.ko ? `<p class="ko">${esc(q.ko)}</p>` : ""}<div class="exp"><b>해설</b>${esc(q.exp)}</div>`;
}
function fillBody(text, answers, st) {
  // Part 6 빈칸 {{131}} → 고른 답, Part 7 위치 표시 [1]~[4]
  let h = esc(text).replace(/\{\{(\d+)\}\}/g, (_, n) => {
    const q = Q[n], a = answers?.[n];
    if (q && a) { const t = q.options[L.indexOf(a)]; return `<span class="blank filled" data-act="toq" data-no="${n}">${esc(t)}</span>`; }
    return `<span class="blank" data-act="toq" data-no="${n}">${n}</span>`;
  });
  h = h.replace(/\[([1-4])\]/g, '<span class="pos">[$1]</span>');
  return h.split(/\n\s*\n/).map((p) => {
    // "항목 | 요일 | 강사 | 가격" 처럼 | 로 나눈 줄이 2줄 이상이면 표로 그린다
    const lines = p.split("\n");
    const rows = lines.filter((l) => l.includes(" | "));
    if (rows.length >= 2) {
      const pre = lines.filter((l) => !l.includes(" | "));
      return `${pre.length ? `<p>${pre.join("\n")}</p>` : ""}<div class="graphic"><table><tbody>${rows.map((r) => `<tr>${r.split(" | ").map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    return `<p>${p}</p>`;
  }).join("");
}
const DOC_KO = { "e-mail": "이메일", notice: "공지", article: "기사", letter: "편지", memo: "회람", advertisement: "광고", form: "양식", "text-message-chain": "문자 메시지", "online-chat": "온라인 채팅", "web-page": "웹페이지", invoice: "송장", review: "후기" };
function docHTML(d, answers, showKo) {
  const head = d.header?.length ? `<div class="dhead">${d.header.map((x) => `<div>${esc(x)}</div>`).join("")}</div>` : "";
  let body;
  if (d.messages) {
    const names = [...new Set(d.messages.map((m) => m.name))];
    body = `<div class="chat">${d.messages.map((m, i) => `<div class="msg ${names.indexOf(m.name) % 2 ? "alt" : ""}"><div class="who"><b>${esc(m.name)}</b> · ${esc(m.time)}</div><div class="t">${fillBody(m.t, answers)}</div>${showKo && d.messagesKo ? `<div class="ko">${esc(d.messagesKo[i])}</div>` : ""}</div>`).join("")}</div>`;
  } else {
    body = fillBody(d.body, answers) + (showKo && d.bodyKo ? `<details class="more"><summary>해석 보기</summary><div><div class="ko">${fillBody(d.bodyKo)}</div></div></details>` : "");
  }
  return `<article class="doc"><div class="dtype">${esc(DOC_KO[d.type] || d.type)}</div>${head}${d.title ? `<div class="dtitle">${esc(d.title)}</div>` : ""}${body}</article>`;
}
function docsOf(st) { return st.part === 6 ? [{ type: st.type, header: st.header, title: st.title, body: st.body, bodyKo: st.bodyKo }] : st.docs; }
const SPK = (id) => esc(id.replace(/\d+$/, (n) => (n === "1" ? "" : n)));
function scriptHTML(st) {
  if (st.part === 2) {
    return `<div class="script"><div class="ln"><span class="sp">${SPK(st.speakers[0].id)}</span><div><div class="en">${esc(st.prompt)}</div><div class="ko">${esc(st.promptKo)}</div></div></div>${st.options.map((o, i) => `<div class="ln"><span class="sp">${SPK(st.speakers[1].id)} ${L[i]}</span><div><div class="en">${esc(o)}</div><div class="ko">${esc(st.optionsKo?.[i])}</div></div></div>`).join("")}</div>`;
  }
  return `<div class="script">${st.lines.map((ln, i) => `<div class="ln"><span class="sp">${SPK(ln.s)}</span><div><div class="en">${esc(ln.t)}</div><div class="ko">${esc(st.linesKo?.[i])}</div></div></div>`).join("")}</div>`;
}
function p2Question(st) { return { no: st.nos[0], q: "", options: ["", "", ""], answer: st.answer, exp: st.exp, ko: st.promptKo }; }

/* ── 화면 전환 ── */
function go(name, params = {}) {
  if (view.name === "lc" && name !== "lc") { audio.pause(); }
  stopRange();
  view = { name, ...params };
  const h = "#" + name;
  if (location.hash !== h) history.pushState(null, "", h);
  render();
  window.scrollTo(0, 0);
}
window.addEventListener("popstate", () => {
  const name = (location.hash || "#home").slice(1);
  if (["lc", "rc"].includes(name) && !S) return go("home");
  if (view.name === "lc") audio.pause();
  view = { name: ["home", "lc", "rc", "result", "review", "practice", "pset", "lcdone"].includes(name) ? name : "home", ...(name === "pset" ? { key: view.key } : {}) };
  if (view.name === "pset" && !view.key) view = { name: "practice" };
  render();
});

function render() {
  clearInterval(rcTimer); rcTimer = null;
  const v = view.name;
  if (v === "home") return renderHome();
  if (v === "lc") return renderLC();
  if (v === "lcdone") return renderLCDone();
  if (v === "rc") return renderRC();
  if (v === "result") return renderResult();
  if (v === "review") return renderReview();
  if (v === "practice") return renderPractice();
  if (v === "pset") return renderPSet();
}

/* ── 홈 ── */
let offline = { state: "checking", pct: 0 };
function renderHome() {
  const hist = store.get(KEY.history, []);
  const resume = S && !S.done;
  const modeName = { full: "실전 전체", lc: "LC만", rc: "RC만" };
  const where = resume ? (S.phase === "lc" ? `LC ${mmss(S.lcTime || 0)} 지점` : `RC ${RC_PAGES[S.rcPos || 0] ? "Part " + RC_PAGES[S.rcPos || 0].part : ""} · ${mmss(RC_LIMIT - (S.rcElapsed || 0))} 남음`) : "";
  app.innerHTML = `<div class="gut"><div class="page">
    <header class="hero">
      <span class="eyebrow">TOEIC L&amp;R · Practice Test</span>
      <h1>출근길 <em>모의토익</em></h1>
      <p class="muted">지하철에서 휴대폰과 이어폰만으로 푸는 실전 모의고사입니다.</p>
    </header>

    <section class="card omr test-card">
      <div class="split"><h2>${esc(D.title)}</h2><span class="chip">194문항</span></div>
      <div class="facts">
        <div class="fact"><b>${Math.round(D.audio.duration / 60)}분</b><span>LC · Part 2–4</span></div>
        <div class="fact"><b>75분</b><span>RC · Part 5–7</span></div>
        <div class="fact"><b>990</b><span>예상 점수 환산</span></div>
      </div>
      <div class="modes">
        ${resume ? `<button class="mode resume" data-act="resume"><b>이어서 풀기</b><span>${modeName[S.mode]} · ${esc(where)}</span><i>계속 ›</i></button>` : ""}
        <button class="mode" data-act="start" data-mode="full"><b>실전 전체</b><span>LC 듣고 바로 RC까지, 약 2시간</span><i>LC+RC</i></button>
        <button class="mode" data-act="start" data-mode="lc"><b>LC만</b><span>Part 2–4 연속 재생, 화면을 꺼도 계속 나옵니다</span><i>${Math.round(D.audio.duration / 60)}분</i></button>
        <button class="mode" data-act="start" data-mode="rc"><b>RC만</b><span>Part 5–7, 75분 타이머</span><i>75분</i></button>
        <button class="mode" data-act="go" data-to="practice"><b>파트별 연습</b><span>한 세트씩 풀고 바로 채점, 다시 듣기 가능</span><i>연습</i></button>
      </div>
      <div id="confirmBox"></div>
      <p class="small muted">Part 1(사진 묘사)은 빠져 있습니다. 점수는 실제 환산표가 아닌 근사치입니다.</p>
    </section>

    <section class="card offline" id="offlineCard">${offlineHTML()}</section>

    ${hist.length ? `<section class="card"><div class="split"><h3>지난 기록</h3>${store.get(KEY.last, null) ? `<button class="btn ghost small" data-act="go" data-to="review">최근 해설 보기 ›</button>` : ""}</div><div class="history">${hist.slice(0, 8).map((h) => `<div class="h"><span>${esc(new Date(h.date).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }))} · ${modeName[h.mode]}</span><span class="muted small">${h.lc ? "LC " + h.lc.score : ""}${h.lc && h.rc ? " · " : ""}${h.rc ? "RC " + h.rc.score : ""}</span><b>${(h.lc?.score || 0) + (h.rc?.score || 0)}</b></div>`).join("")}</div></section>` : ""}
  </div></div>`;
  checkOffline();
}
function offlineHTML() {
  const mb = D.audio.mb ? `약 ${D.audio.mb}MB` : "";
  if (offline.state === "ok") return `<div class="split"><b>오프라인 저장</b><span class="state-ok">저장됨</span></div><p class="small muted">인터넷이 끊겨도 LC 음성까지 모두 재생됩니다.</p>`;
  if (offline.state === "loading") return `<div class="split"><b>LC 음성 저장 중</b><span class="num small">${offline.pct}%</span></div><div class="bar"><i style="width:${offline.pct}%"></i></div><p class="small muted">이 화면을 닫지 마세요.</p>`;
  if (offline.state === "error") return `<div class="split"><b>오프라인 저장</b></div><p class="small" style="color:var(--bad)">저장하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.</p><button class="btn ink" data-act="offline">다시 저장</button>`;
  return `<div class="split"><b>오프라인 저장</b><span class="small muted">${mb}</span></div><p class="small muted">지하철에서 끊기지 않게 LC 음성을 휴대폰에 저장해 두세요. Wi-Fi에서 한 번만 하면 됩니다.</p><button class="btn ink" data-act="offline">LC 음성 저장하기</button>`;
}
async function checkOffline() {
  if (offline.state === "loading") return;
  try {
    const c = await caches.open(AUDIO_CACHE);
    offline.state = (await c.match(D.audio.file)) ? "ok" : (offline.state === "error" ? "error" : "none");
  } catch (e) { offline.state = "none"; }
  const el = $("#offlineCard"); if (el) el.innerHTML = offlineHTML();
}
async function saveOffline() {
  offline = { state: "loading", pct: 0 };
  const paint = () => { const el = $("#offlineCard"); if (el) el.innerHTML = offlineHTML(); };
  paint();
  try {
    const res = await fetch(D.audio.file, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    const total = +res.headers.get("content-length") || (D.audio.mb || 15) * 1e6;
    const reader = res.body.getReader(); const chunks = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      chunks.push(value); got += value.length;
      const p = Math.min(99, Math.round((got / total) * 100)); if (p !== offline.pct) { offline.pct = p; paint(); }
    }
    const blob = new Blob(chunks, { type: "audio/mpeg" });
    const c = await caches.open(AUDIO_CACHE);
    for (const k of await c.keys()) await c.delete(k);
    await c.put(D.audio.file, new Response(blob, { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(blob.size) } }));
    try { await navigator.storage?.persist?.(); } catch (e) {}
    offline.state = "ok"; paint(); toast("저장했습니다. 이제 오프라인에서도 풀 수 있습니다.");
  } catch (e) { offline.state = "error"; paint(); }
}

function startTest(mode, force) {
  if (S && !S.done && !force) {
    $("#confirmBox").innerHTML = `<div class="notice confirm"><p>진행 중인 시험이 있습니다. 새로 시작하면 지금까지 고른 답이 지워집니다.</p><div class="row"><button class="btn primary" data-act="start" data-mode="${mode}" data-force="1">새로 시작</button><button class="btn" data-act="resume">이어서 풀기</button></div></div>`;
    return;
  }
  S = { mode, phase: mode === "rc" ? "rc" : "lc", answers: {}, flags: {}, lcTime: 0, rcElapsed: 0, rcPos: 0, started: Date.now() };
  saveS();
  go(S.phase === "lc" ? "lc" : "rc", { intro: true });
}

/* ── 오디오 ── */
let audioSrcSet = false, stopAt = null;
async function ensureAudio() {
  if (audioSrcSet) return;
  let src = D.audio.file;
  try { const c = await caches.open(AUDIO_CACHE); const r = await c.match(D.audio.file); if (r) src = URL.createObjectURL(await r.blob()); } catch (e) {}
  audio.src = src; audioSrcSet = true;
  await new Promise((ok) => { if (audio.readyState >= 1) return ok(); audio.addEventListener("loadedmetadata", ok, { once: true }); audio.addEventListener("error", ok, { once: true }); });
}
function seek(t) { try { audio.currentTime = t; } catch (e) {} }
function playRange(start, end) { stopAt = end; seek(start); audio.playbackRate = store.get(KEY.rate, 1); audio.play().catch(() => toast("재생하지 못했습니다. 다시 눌러 주세요.")); }
function stopRange() { if (stopAt !== null) { stopAt = null; audio.pause(); } }
function media(title) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: "출근길 모의토익", album: D.title });
    navigator.mediaSession.setActionHandler("play", () => audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  } catch (e) {}
}

/* ── LC 응시 ── */
function lcSegment(t) {
  const tm = D.audio;
  for (const st of LC_SETS) if (t >= st.timing.start && t < st.timing.end) return { st };
  for (const p of [2, 3, 4]) {
    const first = LC_SETS.find((s) => s.part === p);
    if (t >= tm["p" + p].start && t < first.timing.start) return { dir: p, next: first };
  }
  const nxt = LC_SETS.find((s) => s.timing.start > t);
  return nxt ? { dir: nxt.part, next: nxt } : { end: true };
}
let lcSegKey = null, lcReading = null;
function renderLC() {
  if (!S) return go("home");
  const started = view.started;
  app.innerHTML = `<div class="bar-top gut"><div class="in">
      <button class="iconbtn" data-act="home" aria-label="홈으로">${ICON.back}</button>
      <div class="where"><b id="lcWhere">LC</b><span id="lcSub">${esc(D.title)}</span></div>
      <span class="clock" id="lcClock">${mmss(S.lcTime)}</span>
      <button class="iconbtn" id="lcPlay" data-act="lcplay" aria-label="재생/일시정지">${ICON.play}</button>
      <button class="iconbtn" data-act="sheet" aria-label="답안지">${ICON.grid}</button>
    </div><div class="lcprog"><i id="lcProg" style="width:${(S.lcTime / D.audio.duration) * 100}%"></i></div></div>
    <div class="gut"><div class="page" id="lcBody">${started ? "" : lcIntroHTML()}</div></div>`;
  lcSegKey = null;
  if (started) lcTick(true);
}
function lcIntroHTML() {
  const resumeAt = S.lcTime > 3;
  return `<section class="card omr"><span class="eyebrow">Listening</span><h2>${resumeAt ? "LC 이어서 듣기" : "LC 시작 전에"}</h2>
    <ul class="small muted" style="margin:0;padding-left:18px;display:grid;gap:4px">
      <li>이어폰을 연결하고 볼륨을 맞춰 주세요.</li>
      <li>Part 2부터 Part 4까지 멈추지 않고 이어서 나옵니다. 화면을 꺼도 계속 재생됩니다.</li>
      <li>내릴 역이 되면 ⏸로 멈추세요. 다음에 이어 들을 때는 듣던 세트의 처음부터 다시 나옵니다.</li>
      <li>Part 3·4는 다음 세트 문제를 미리 읽어 두세요. 화면 아래에 미리 보여 줍니다.</li>
    </ul>
    ${offline.state === "ok" ? `<p class="small state-ok">오프라인 저장됨: 터널에서도 끊기지 않습니다.</p>` : `<p class="small" style="color:var(--warn)">LC 음성이 저장되어 있지 않아 인터넷으로 재생합니다. 지하철에서는 끊길 수 있어요.</p>`}
    <button class="btn primary block" data-act="lcstart">${resumeAt ? `${mmss(resumeStart(S.lcTime))}부터 이어 듣기` : "LC 시작"}</button></section>`;
}
function resumeStart(t) { const g = lcSegment(t); if (g.st) return g.st.timing.start; if (g.next) return D.audio["p" + g.dir].start <= t ? Math.min(t, g.next.timing.start) : t; return t; }
async function lcStart() {
  $("#lcBody").innerHTML = `<div class="empty">음성을 불러오는 중…</div>`;
  await ensureAudio();
  stopAt = null;
  seek(resumeStart(S.lcTime || 0));
  audio.playbackRate = 1;
  media(`${D.title} · LC`);
  view.started = true;
  try { await audio.play(); } catch (e) { toast("재생하지 못했습니다. ▶ 버튼을 눌러 주세요."); }
  lcTick(true);
}
function lcTick(force) {
  if (view.name !== "lc" || !view.started) return;
  const t = audio.currentTime || 0;
  S.lcTime = t;
  const clock = $("#lcClock"); if (clock) clock.innerHTML = `${mmss(t)}<span class="tot"> / ${mmss(D.audio.duration)}</span>`;
  const prog = $("#lcProg"); if (prog) prog.style.width = (t / D.audio.duration) * 100 + "%";
  const pb = $("#lcPlay"); if (pb) { pb.innerHTML = audio.paused ? ICON.play : ICON.pause; pb.classList.toggle("on", !audio.paused); }
  const g = lcSegment(t);
  const key = g.st ? "s" + g.st.i : g.dir ? "d" + g.dir : "end";
  if (key !== lcSegKey || force) { lcSegKey = key; lcReading = null; paintLCBody(g); }
  if (g.st && g.st.part > 2) {
    let cur = null; for (const no of g.st.nos) if (t >= g.st.timing.q[no]) cur = no;
    if (cur !== lcReading) { lcReading = cur; $$(".q").forEach((el) => el.classList.toggle("reading", +el.dataset.q === cur)); }
  }
}
function paintLCBody(g) {
  const body = $("#lcBody"); if (!body) return;
  const w = $("#lcWhere"), sub = $("#lcSub");
  const ctx = { answers: S.answers };
  if (g.end) { w.textContent = "LC 끝"; body.innerHTML = `<div class="empty">LC가 끝났습니다.</div>`; return; }
  if (g.dir) {
    w.textContent = `Part ${g.dir} 안내`;
    sub.textContent = { 2: "질문·응답 25문항", 3: "짧은 대화 13세트", 4: "짧은 담화 10세트" }[g.dir];
    body.innerHTML = `<section class="card omr"><span class="eyebrow">Part ${g.dir} Directions</span><p>${{ 2: "질문이나 말을 듣고, 이어지는 세 응답 중 가장 알맞은 것을 고르세요. 질문과 보기는 인쇄되지 않습니다.", 3: "두세 사람의 대화를 듣고 문제 세 개에 답하세요. 대화는 한 번만 나옵니다.", 4: "한 사람의 담화를 듣고 문제 세 개에 답하세요. 담화는 한 번만 나옵니다." }[g.dir]}</p></section>
      ${g.next && g.next.part > 2 ? `<section class="qset"><p class="eyebrow">미리 읽기 · ${g.next.nos[0]}–${g.next.nos.at(-1)}</p>${graphicHTML(g.next.graphic)}${g.next.questions.map((q) => qHTML(q, ctx)).join("")}</section>` : ""}`;
    return;
  }
  const st = g.st;
  if (st.part === 2) {
    const no = st.nos[0];
    w.textContent = `Part 2 · ${no}번`; sub.textContent = "질문과 응답을 듣고 고르세요";
    const p2 = LC_SETS.filter((s) => s.part === 2);
    body.innerHTML = `<section class="card omr" style="justify-items:center;text-align:center">
        <span class="eyebrow">Number</span><div class="bignum">${no}</div>
        <p class="small muted">보기는 인쇄되지 않습니다. 잘 듣고 A·B·C 중 하나를 누르세요.</p>
        <div class="p2pad" style="width:100%">${"ABC".split("").map((l) => `<button data-act="ans" data-no="${no}" data-l="${l}" aria-pressed="${S.answers[no] === l}" aria-label="${l}"><span>${l}</span></button>`).join("")}</div>
      </section>
      <div class="p2strip">${p2.map((s) => `<span class="${s.nos[0] === no ? "now" : S.answers[s.nos[0]] ? "done" : ""}">${s.nos[0]}${S.answers[s.nos[0]] ? " " + S.answers[s.nos[0]] : ""}</span>`).join("")}</div>`;
    return;
  }
  w.textContent = `Part ${st.part} · ${st.nos[0]}–${st.nos.at(-1)}`;
  sub.textContent = st.part === 3 ? (st.speakers.length > 2 ? "세 사람 대화" : "대화") + (st.graphic ? " · 도표" : "") : (st.talkKo || "담화") + (st.graphic ? " · 도표" : "");
  const next = LC_SETS[st.i + 1 - LC_SETS[0].i];
  body.innerHTML = `<section class="qset">${graphicHTML(st.graphic)}${st.questions.map((q) => qHTML(q, ctx)).join("")}</section>
    ${next && next.part > 2 ? `<section class="qset" style="opacity:.72"><p class="eyebrow">다음 세트 미리 읽기 · ${next.nos[0]}–${next.nos.at(-1)}</p>${graphicHTML(next.graphic)}${next.questions.map((q) => qHTML(q, ctx)).join("")}</section>` : ""}`;
}
audio.addEventListener("timeupdate", () => {
  if (stopAt !== null && audio.currentTime >= stopAt) { audio.pause(); stopAt = null; paintPlayer(); }
  if (view.name === "lc") { lcTick(false); throttleSave(); }
});
audio.addEventListener("play", () => { if (view.name === "lc") lcTick(false); paintPlayer(); });
audio.addEventListener("pause", () => { if (view.name === "lc") { lcTick(false); saveS(); } paintPlayer(); });
audio.addEventListener("ended", () => { if (view.name === "lc" && stopAt === null) finishLC(); });
let lastSave = 0;
function throttleSave() { const n = Date.now(); if (n - lastSave > 2000) { lastSave = n; saveS(); } }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && view.name === "lc") lcTick(true); if (document.visibilityState === "hidden") saveS(); });

function finishLC() {
  S.lcTime = D.audio.duration; S.lcDone = true;
  if (S.mode === "full") { S.phase = "rc"; saveS(); go("lcdone"); }
  else submit();
}
function renderLCDone() {
  app.innerHTML = `<div class="gut"><div class="page"><section class="card omr" style="text-align:center;justify-items:center">
    <span class="eyebrow">Listening complete</span><h2>LC가 끝났습니다</h2>
    <p class="muted">LC ${NOS_LC().filter((n) => S.answers[n]).length}/${NOS_LC().length}문항 답했습니다. 준비되면 RC를 시작하세요. 75분 타이머가 시작됩니다.</p>
    <button class="btn primary block" data-act="go" data-to="rc">RC 시작</button>
    <button class="btn ghost" data-act="home">나중에 이어서 풀기</button></section></div></div>`;
}

/* ── RC 응시 ── */
let rcTimer = null, rcPaused = false;
function renderRC() {
  if (!S) return go("home");
  S.phase = "rc"; saveS();
  const pg = RC_PAGES[S.rcPos] || RC_PAGES[0];
  const ctx = { answers: S.answers, flags: S.flags };
  const nos = pg.sets.flatMap((s) => s.nos);
  const hasDocs = pg.part >= 6;
  const pane = view.pane || "docs";
  let content;
  if (!hasDocs) {
    content = `<section class="qset card">${pg.sets.map((s) => qHTML(s.questions[0], ctx)).join("")}</section>`;
  } else {
    const st = pg.sets[0];
    content = `<div class="paneTabs"><div class="seg" role="group" aria-label="지문과 문제"><button data-act="pane" data-pane="docs" aria-pressed="${pane === "docs"}">지문 ${docsOf(st).length > 1 ? docsOf(st).length + "개" : ""}</button><button data-act="pane" data-pane="qs" aria-pressed="${pane === "qs"}">문제 ${st.nos.length}개 · ${st.nos.filter((n) => S.answers[n]).length} 답함</button></div></div>
      <div class="rcgrid two"><div class="pane pane-docs" ${pane === "docs" ? "" : "hidden"}>${docsOf(st).map((d) => docHTML(d, S.answers)).join("")}</div>
      <div class="pane pane-qs" ${pane === "qs" ? "" : "hidden"}><section class="qset card">${st.questions.map((q) => qHTML(q, ctx)).join("")}</section></div></div>`;
  }
  const label = pg.part === 5 ? `Part 5 · ${nos[0]}–${nos.at(-1)}` : `Part ${pg.part} · ${nos[0]}–${nos.at(-1)}`;
  const kind = pg.part === 7 ? ({ 1: "단일 지문", 2: "이중 지문", 3: "삼중 지문" }[docsOf(pg.sets[0]).length]) : pg.part === 6 ? "장문 빈칸" : "단문 빈칸";
  app.innerHTML = `<div class="bar-top gut"><div class="in">
      <button class="iconbtn" data-act="home" aria-label="홈으로">${ICON.back}</button>
      <div class="where"><b>${label}</b><span>${kind} · ${S.rcPos + 1}/${RC_PAGES.length}쪽</span></div>
      <span class="clock" id="rcClock"></span>
      <button class="iconbtn" data-act="rcpause" aria-label="타이머 일시정지">${ICON.pause}</button>
      <button class="iconbtn" data-act="sheet" aria-label="답안지">${ICON.grid}</button>
    </div></div>
    <div class="gut"><div class="page ${hasDocs ? "wide" : ""}">${content}</div></div>
    <nav class="bar-bottom gut"><div class="in">
      <button class="btn" data-act="rcnav" data-d="-1" ${S.rcPos === 0 ? "disabled" : ""}>‹ 이전</button>
      <span class="mid">${S.rcPos + 1} / ${RC_PAGES.length}</span>
      ${S.rcPos < RC_PAGES.length - 1 ? `<button class="btn ink" data-act="rcnav" data-d="1">다음 ›</button>` : `<button class="btn primary" data-act="submitask">제출</button>`}
    </div></nav>
    ${rcPaused ? `<div class="sheetwrap" style="align-items:center;background:var(--paper)"><div class="sheetpanel" style="border-radius:16px;text-align:center;justify-items:center;margin:auto;width:calc(100% - 32px)"><h3>일시정지</h3><p class="muted">타이머가 멈췄습니다. 문제는 가려 두었습니다.</p><button class="btn primary block" data-act="rcpause">계속 풀기</button></div></div>` : ""}`;
  paintClock();
  rcTimer = setInterval(() => {
    if (rcPaused || document.visibilityState !== "visible" || view.name !== "rc") return;
    S.rcElapsed = (S.rcElapsed || 0) + 1;
    if (S.rcElapsed % 5 === 0) saveS();
    if (S.rcElapsed === RC_LIMIT) toast("75분이 지났습니다. 실전이라면 여기서 끝입니다. 이어서 풀면 초과 시간이 기록됩니다.");
    paintClock();
  }, 1000);
  if (view.focus) { const el = $("#q" + view.focus); view.focus = null; if (el) setTimeout(() => el.scrollIntoView({ block: "start" }), 30); }
}
function paintClock() {
  const el = $("#rcClock"); if (!el) return;
  const left = RC_LIMIT - (S.rcElapsed || 0);
  el.textContent = (left < 0 ? "+" : "") + mmss(left);
  el.classList.toggle("over", left < 0);
}

/* ── 답안지 ── */
function openSheet() {
  const inRC = view.name === "rc";
  const lc = S.mode !== "rc" ? NOS_LC() : [], rc = S.mode !== "lc" ? NOS_RC() : [];
  const curNos = inRC ? (RC_PAGES[S.rcPos]?.sets.flatMap((s) => s.nos) || []) : [];
  const btn = (n, live) => `<button class="${S.answers[n] ? "ans" : ""} ${S.flags[n] ? "flagged" : ""} ${curNos.includes(n) ? "cur" : ""}" ${live ? `data-act="jump" data-no="${n}"` : "disabled"}><span>${n}</span><b>${S.answers[n] || "·"}</b></button>`;
  const un = [...lc, ...rc].filter((n) => !S.answers[n]).length;
  const wrap = document.createElement("div");
  wrap.className = "sheetwrap"; wrap.dataset.act = "closesheet";
  wrap.innerHTML = `<div class="sheetpanel" role="dialog" aria-label="답안지">
    <div class="split"><h3>답안지</h3><button class="btn ghost" data-act="closesheet">닫기</button></div>
    <div class="legend"><span>답함 ${[...lc, ...rc].length - un}</span><span>안 풂 ${un}</span><span style="color:var(--warn)">다시 볼 문제 ${Object.values(S.flags).filter(Boolean).length}</span></div>
    ${lc.length ? `<p class="eyebrow">Listening</p><div class="omrgrid">${lc.map((n) => btn(n, false)).join("")}</div>` : ""}
    ${rc.length ? `<p class="eyebrow">Reading${inRC ? " · 번호를 누르면 이동" : ""}</p><div class="omrgrid">${rc.map((n) => btn(n, inRC)).join("")}</div>` : ""}
    <button class="btn primary block" data-act="submitask">제출하고 채점</button>
  </div>`;
  document.body.appendChild(wrap);
}
function closeSheet() { $$(".sheetwrap").forEach((e) => { if (!e.closest("#app")) e.remove(); }); }
function askSubmit() {
  closeSheet();
  const all = [...(S.mode !== "rc" ? NOS_LC() : []), ...(S.mode !== "lc" ? NOS_RC() : [])];
  const un = all.filter((n) => !S.answers[n]).length;
  const wrap = document.createElement("div");
  wrap.className = "sheetwrap"; wrap.dataset.act = "closesheet";
  wrap.innerHTML = `<div class="sheetpanel confirm" role="dialog"><h3>제출할까요?</h3><p class="muted">${un ? `아직 안 푼 문제가 ${un}개 있습니다. 제출하면 안 푼 문제는 오답으로 처리됩니다.` : "모든 문제에 답했습니다."}${S.mode === "full" && S.phase === "lc" ? " RC는 아직 시작하지 않았습니다." : ""}</p>
    <button class="btn primary block" data-act="submit">제출하고 채점</button><button class="btn block" data-act="closesheet">계속 풀기</button></div>`;
  document.body.appendChild(wrap);
}
function submit() {
  closeSheet(); audio.pause();
  const g = grade(S.answers, S.mode);
  const res = { date: Date.now(), mode: S.mode, answers: S.answers, flags: S.flags, rcElapsed: S.rcElapsed, ...g };
  const hist = store.get(KEY.history, []); hist.unshift({ date: res.date, mode: res.mode, lc: g.lc, rc: g.rc }); store.set(KEY.history, hist.slice(0, 30));
  store.set(KEY.last, res);
  S = null; saveS();
  go("result");
}

/* ── 결과 ── */
function renderResult() {
  const r = store.get(KEY.last, null); if (!r) return go("home");
  const total = (r.lc?.score || 0) + (r.rc?.score || 0);
  const max = (r.lc ? 495 : 0) + (r.rc ? 495 : 0);
  const PN = { 2: "질문·응답", 3: "짧은 대화", 4: "짧은 담화", 5: "단문 빈칸", 6: "장문 빈칸", 7: "독해" };
  app.innerHTML = `<div class="gut"><div class="page">
    <section class="card omr"><div class="score"><span class="eyebrow">예상 점수</span><div class="big">${total}<small> / ${max}</small></div><p class="small muted">비공식 근사 환산입니다. 실제 시험은 회차마다 환산표가 다릅니다.</p></div>
      <div class="subs">${r.lc ? `<div class="sub"><span>LC</span><b>${r.lc.score}</b><span>${r.lc.raw}/${r.lc.total} 정답</span></div>` : ""}${r.rc ? `<div class="sub"><span>RC</span><b>${r.rc.score}</b><span>${r.rc.raw}/${r.rc.total} 정답${r.rcElapsed ? ` · ${mmss(r.rcElapsed)} 사용` : ""}</span></div>` : ""}</div></section>
    <section class="card"><h3>파트별 정답률</h3><div class="parts">${Object.entries(r.parts).map(([p, [c, t]]) => `<div class="prow"><span>Part ${p}<br><span class="small muted">${PN[p]}</span></span><div class="pb"><i style="width:${(c / t) * 100}%"></i></div><span class="pv">${c}/${t}</span></div>`).join("")}</div></section>
    <div class="row"><button class="btn primary" data-act="go" data-to="review">틀린 문제 해설 보기</button><button class="btn" data-act="home">처음으로</button></div>
  </div></div>`;
}

/* ── 해설 ── */
function renderReview() {
  const r = store.get(KEY.last, null); if (!r) return go("home");
  const f = view.filter || "wrong", part = view.part || "all";
  const ctx = { answers: r.answers, reveal: true, disabled: true };
  const inMode = (st) => (r.mode === "lc" ? st.part <= 4 : r.mode === "rc" ? st.part >= 5 : true);
  const pick = (no) => (f === "all" ? true : f === "flag" ? r.flags?.[no] : r.answers[no] !== Q[no].answer);
  const sets = SETS.filter((st) => inMode(st) && (part === "all" || st.part === +part) && st.nos.some(pick));
  app.innerHTML = `<div class="bar-top gut"><div class="in"><button class="iconbtn" data-act="home" aria-label="홈으로">${ICON.back}</button><div class="where"><b>해설</b><span>${new Date(r.date).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></div></div></div>
  <div class="gut"><div class="page">
    <div class="row"><div class="seg" role="group" aria-label="보기">${[["wrong", "틀린 것"], ["all", "전체"], ["flag", "표시한 것"]].map(([k, t]) => `<button data-act="rvf" data-f="${k}" aria-pressed="${f === k}">${t}</button>`).join("")}</div>
    <select class="btn" data-act="rvp" aria-label="파트">${["all", 2, 3, 4, 5, 6, 7].map((p) => `<option value="${p}" ${String(part) === String(p) ? "selected" : ""}>${p === "all" ? "모든 파트" : "Part " + p}</option>`).join("")}</select></div>
    ${sets.length ? sets.map((st) => reviewSetHTML(st, ctx, pick)).join("") : `<div class="empty">${f === "wrong" ? "틀린 문제가 없습니다." : "해당하는 문제가 없습니다."}</div>`}
  </div></div>`;
}
function reviewSetHTML(st, ctx, pick) {
  const nos = st.nos;
  const head = `<div class="split"><span class="chip">Part ${st.part} · ${nos[0]}${nos.length > 1 ? "–" + nos.at(-1) : ""}</span>${st.part <= 4 ? `<button class="btn small" data-act="playset" data-i="${st.i}">▶ 다시 듣기</button>` : ""}</div>`;
  if (st.part === 2) return `<section class="card rv">${head}${revealHTML(p2Question(st), ctx.answers[nos[0]])}<details class="more" open><summary>스크립트</summary><div>${scriptHTML(st)}</div></details></section>`;
  if (st.part <= 4) return `<section class="card rv">${head}${graphicHTML(st.graphic)}${st.questions.filter((q) => pick(q.no)).map((q) => qHTML(q, ctx)).join("")}<details class="more"><summary>스크립트와 해석</summary><div>${scriptHTML(st)}</div></details></section>`;
  if (st.part === 5) return `<section class="card rv">${head}${qHTML(st.questions[0], ctx)}</section>`;
  return `<section class="card rv">${head}<details class="more"><summary>지문 ${docsOf(st).length > 1 ? docsOf(st).length + "개" : ""}</summary><div>${docsOf(st).map((d) => docHTML(d, ctx.answers, true)).join("")}</div></details>${st.questions.filter((q) => pick(q.no)).map((q) => qHTML(q, ctx)).join("")}</section>`;
}

/* ── 파트별 연습 ── */
const setKey = (st) => `t1-${st.nos[0]}`;
function renderPractice() {
  const PN = { 2: "질문·응답", 3: "짧은 대화", 4: "짧은 담화", 5: "단문 빈칸", 6: "장문 빈칸", 7: "독해" };
  const parts = [2, 3, 4, 5, 6, 7];
  app.innerHTML = `<div class="bar-top gut"><div class="in"><button class="iconbtn" data-act="home" aria-label="홈으로">${ICON.back}</button><div class="where"><b>파트별 연습</b><span>세트를 골라 풀고 바로 채점합니다</span></div></div></div>
  <div class="gut"><div class="page">${parts.map((p) => {
    const sets = SETS.filter((s) => s.part === p);
    const done = sets.filter((s) => practice[setKey(s)]?.checked).length;
    return `<section class="card"><div class="split"><h3>Part ${p} <span class="muted small">${PN[p]}</span></h3><span class="num small muted">${done}/${sets.length}</span></div>
      <div class="omrgrid">${sets.map((s) => { const pr = practice[setKey(s)]; const ok = pr?.checked ? s.nos.filter((n) => pr.ans[n] === Q[n].answer).length : null; return `<button class="${pr?.checked ? "ans" : ""}" data-act="pset" data-i="${s.i}"><span>${s.nos[0]}${s.nos.length > 1 ? "–" : ""}</span><b>${ok === null ? "·" : ok + "/" + s.nos.length}</b></button>`; }).join("")}</div></section>`;
  }).join("")}
  <p class="small muted">실전 응시와 따로 기록됩니다. LC 연습은 속도를 바꿔 들을 수 있습니다.</p></div></div>`;
}
function renderPSet() {
  const st = SETS[view.i]; if (!st) return go("practice");
  const k = setKey(st);
  const pr = practice[k] || { ans: {}, checked: false };
  const ctx = { answers: pr.ans, reveal: pr.checked, disabled: pr.checked };
  const sameNext = SETS.find((s) => s.i > st.i && s.part === st.part);
  const rate = store.get(KEY.rate, 1);
  let body = "";
  if (st.part <= 4) {
    body += `<section class="card"><div class="player"><button class="btn ink" data-act="playset" data-i="${st.i}" id="pPlay">▶ 듣기</button><div class="seg" role="group" aria-label="속도">${[0.8, 1, 1.2].map((x) => `<button data-act="rate" data-r="${x}" aria-pressed="${rate === x}">${x}×</button>`).join("")}</div></div>
      ${offline.state === "ok" ? "" : `<p class="small muted">음성이 저장되어 있지 않으면 인터넷으로 재생합니다.</p>`}</section>`;
  }
  if (st.part === 2) {
    const q = p2Question(st), a = pr.ans[q.no];
    body += `<section class="card omr" style="text-align:center;justify-items:center"><div class="bignum">${q.no}</div><div class="p2pad" style="width:100%">${"ABC".split("").map((l) => `<button data-act="ans" data-no="${q.no}" data-l="${l}" aria-pressed="${a === l}" ${pr.checked ? "disabled" : ""}><span>${l}</span></button>`).join("")}</div></section>
      ${pr.checked ? `<section class="card rv">${revealHTML(q, a)}${scriptHTML(st)}</section>` : ""}`;
  } else if (st.part <= 4) {
    body += `<section class="qset card">${graphicHTML(st.graphic)}${st.questions.map((q) => qHTML(q, ctx)).join("")}</section>${pr.checked ? `<details class="more" open><summary>스크립트와 해석</summary><div>${scriptHTML(st)}</div></details>` : ""}`;
  } else if (st.part === 5) {
    body += `<section class="qset card">${qHTML(st.questions[0], ctx)}</section>`;
  } else {
    body += `${docsOf(st).map((d) => docHTML(d, pr.ans, pr.checked)).join("")}<section class="qset card">${st.questions.map((q) => qHTML(q, ctx)).join("")}</section>`;
  }
  app.innerHTML = `<div class="bar-top gut"><div class="in"><button class="iconbtn" data-act="go" data-to="practice" aria-label="목록으로">${ICON.back}</button><div class="where"><b>Part ${st.part} · ${st.nos[0]}${st.nos.length > 1 ? "–" + st.nos.at(-1) : ""}</b><span>연습</span></div></div></div>
    <div class="gut"><div class="page ${st.part >= 6 ? "" : ""}">${body}</div></div>
    <nav class="bar-bottom gut"><div class="in">
      ${pr.checked ? `<button class="btn" data-act="pretry" data-i="${st.i}">다시 풀기</button>` : `<span></span>`}
      <span class="mid"></span>
      ${pr.checked ? (sameNext ? `<button class="btn ink" data-act="pset" data-i="${sameNext.i}">다음 세트 ›</button>` : `<button class="btn ink" data-act="go" data-to="practice">목록</button>`) : `<button class="btn primary" data-act="pcheck" data-i="${st.i}">채점하기</button>`}
    </div></nav>`;
  paintPlayer();
}
function paintPlayer() {
  const b = $("#pPlay"); if (!b) return;
  b.textContent = !audio.paused && stopAt !== null ? "⏸ 멈춤" : "▶ 듣기";
}
async function playSet(i, btn) {
  const st = SETS[i];
  if (!audio.paused && stopAt !== null) { stopRange(); paintPlayer(); return; }
  await ensureAudio();
  const t = st.timing;
  const end = st.part === 2 ? t.spoken + 0.3 : t.q[st.nos.at(-1)] + 5;
  media(`${D.title} · ${st.nos[0]}번`);
  playRange(st.part === 2 ? t.start : t.start, end);
  paintPlayer();
}

/* ── 알림 ── */
let toastT;
function toast(msg) {
  $$(".toast").forEach((e) => e.remove());
  const el = document.createElement("div"); el.className = "toast"; el.textContent = msg; el.setAttribute("role", "status");
  document.body.appendChild(el); clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 3200);
}

/* ── 이벤트 ── */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const act = t.dataset.act;
  if (act === "closesheet") { if (e.target === t || t.tagName === "BUTTON") closeSheet(); return; }
  if (act === "home") return go("home");
  if (act === "go") return go(t.dataset.to);
  if (act === "start") return startTest(t.dataset.mode, !!t.dataset.force);
  if (act === "resume") return go(S.phase === "lc" ? "lc" : S.lcDone && S.mode === "full" && !S.rcElapsed && S.rcPos === 0 ? "lcdone" : "rc");
  if (act === "offline") return saveOffline();
  if (act === "lcstart") return lcStart();
  if (act === "lcplay") { if (!view.started) return lcStart(); audio.paused ? audio.play().catch(() => {}) : audio.pause(); return; }
  if (act === "sheet") return openSheet();
  if (act === "submitask") return askSubmit();
  if (act === "submit") return submit();
  if (act === "ans") {
    const no = +t.dataset.no, l = t.dataset.l;
    const target = view.name === "pset" ? (practice[setKey(SETS[view.i])] ||= { ans: {}, checked: false }).ans : S?.answers;
    if (!target) return;
    target[no] = target[no] === l ? undefined : l;
    if (!target[no]) delete target[no];
    $$(`[data-act="ans"][data-no="${no}"]`).forEach((b) => b.setAttribute("aria-pressed", b.dataset.l === target[no]));
    if (view.name === "pset") store.set(KEY.practice, practice); else saveS();
    if (view.name === "rc") { $$(`.blank[data-no="${no}"]`).forEach((b) => { const q = Q[no]; if (target[no]) { b.textContent = q.options[L.indexOf(target[no])]; b.classList.add("filled"); } else { b.textContent = no; b.classList.remove("filled"); } }); const tab = $('[data-pane="qs"]'); if (tab) { const st = RC_PAGES[S.rcPos].sets[0]; tab.textContent = `문제 ${st.nos.length}개 · ${st.nos.filter((n) => S.answers[n]).length} 답함`; } }
    if (view.name === "lc" && Q[no].part === 2) { const sp = $$(".p2strip span").find((s) => s.textContent.startsWith(String(no))); if (sp) sp.textContent = `${no}${target[no] ? " " + target[no] : ""}`; }
    return;
  }
  if (act === "flag") { const no = +t.dataset.no; S.flags[no] = !S.flags[no]; t.setAttribute("aria-pressed", S.flags[no]); saveS(); return; }
  if (act === "rcnav") { S.rcPos = Math.max(0, Math.min(RC_PAGES.length - 1, S.rcPos + +t.dataset.d)); saveS(); view.pane = "docs"; render(); window.scrollTo(0, 0); return; }
  if (act === "rcpause") { rcPaused = !rcPaused; saveS(); render(); return; }
  if (act === "pane") { view.pane = t.dataset.pane; $$(".pane-docs").forEach((p) => (p.hidden = view.pane !== "docs")); $$(".pane-qs").forEach((p) => (p.hidden = view.pane !== "qs")); $$("[data-act=pane]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.pane === view.pane)); window.scrollTo(0, 0); return; }
  if (act === "jump") { const no = +t.dataset.no; closeSheet(); S.rcPos = pageOf(no); saveS(); view.pane = "qs"; view.focus = no; render(); return; }
  if (act === "toq") { const no = +t.dataset.no; if (view.name === "rc") { view.pane = "qs"; $$(".pane-docs").forEach((p) => (p.hidden = true)); $$(".pane-qs").forEach((p) => (p.hidden = false)); $$("[data-act=pane]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.pane === "qs")); } const el = $("#q" + no); if (el) el.scrollIntoView({ block: "start", behavior: "smooth" }); return; }
  if (act === "rvf") { view.filter = t.dataset.f; return render(); }
  if (act === "pset") { stopRange(); view = { name: "pset", i: +t.dataset.i }; if (location.hash !== "#pset") history.pushState(null, "", "#pset"); render(); window.scrollTo(0, 0); return; }
  if (act === "pcheck") { const k = setKey(SETS[+t.dataset.i]); (practice[k] ||= { ans: {}, checked: false }).checked = true; store.set(KEY.practice, practice); render(); return; }
  if (act === "pretry") { delete practice[setKey(SETS[+t.dataset.i])]; store.set(KEY.practice, practice); render(); return; }
  if (act === "playset") return playSet(+t.dataset.i, t);
  if (act === "rate") { const r = +t.dataset.r; store.set(KEY.rate, r); audio.playbackRate = r; $$("[data-act=rate]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.r === r)); return; }
});
document.addEventListener("change", (e) => { if (e.target.dataset.act === "rvp") { view.part = e.target.value; render(); } });

/* ── 시작 ── */
(async function boot() {
  try {
    const res = await fetch("data/t1.json");
    D = await res.json();
  } catch (e) {
    app.innerHTML = `<div class="gut"><div class="page"><div class="empty">문제를 불러오지 못했습니다. 처음 한 번은 인터넷에 연결된 상태에서 열어 주세요.</div></div></div>`;
    return;
  }
  index();
  const h = (location.hash || "#home").slice(1);
  if (h === "lc" && S) view = { name: "lc" };
  else if (h === "rc" && S) view = { name: "rc" };
  else if (h === "result" || h === "review" || h === "practice") view = { name: h };
  else { view = { name: "home" }; history.replaceState(null, "", "#home"); }
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded && view.name === "home" && navigator.serviceWorker.controller) { reloaded = true; location.reload(); } });
  }
})();
