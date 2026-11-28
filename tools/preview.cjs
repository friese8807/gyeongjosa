#!/usr/bin/env node
/* 데스크톱 미리보기 (모든 웹앱 공통) — 앱 index.html(작업 중인 최신 코드)을 아이폰 모양 틀에 넣어 HTML 한 장으로 만든다.
 * Claude 데스크톱 오른쪽 패널(SendUserFile display:render → 패널 위 눈 아이콘 = 미리보기)이나 브라우저에서 열면
 * 탭·시트를 실제처럼 눌러 볼 수 있다. 틀 위 ☀️ 주간 / 🌙 야간 버튼, 화면 안은 스크롤 막대 없이 마우스로 끌어서 위아래로.
 *
 *   node preview.cjs 앱/index.html --out 미리보기.html                 예시 모드(서버 주소 없음 → 앱의 예시 데이터)
 *   node preview.cjs 앱/index.html --data 자료.json --seed 저장값.json --now 2026-12-03T07:40 --out …
 *        --data  서버 응답 흉내: { "load": {...}, "widget": {...} } — POST 본문 {action} 이름으로 {ok:true, data} 를 돌려줌
 *                ("*" 키는 모르는 action 모두, "url:문자열" 키는 주소에 그 글이 들어간 GET 요청)
 *        --seed  앱 저장소에 미리 넣을 값: { "앱접두어.srv": "\"https://srv.test/exec\"", … } (값은 저장된 문자열 그대로)
 *        --now   한국 시각으로 시계 고정 (비우면 지금)
 *        --dv    시안 스위치 window.__DV 값 · --dark 처음 모드를 야간으로 · --live 바깥 서버로 그대로 보냄(휴대폰 브라우저용)
 *        --base  그림·아이콘 같은 상대 주소의 기준 (비우면 git 원격 주소로 https://계정.github.io/저장소/ 를 씀 — 미리보기 안에서는 앱 폴더를 못 찾음)
 *
 * 알아 둘 것
 *  - 데스크톱 패널은 바깥 서버 연결을 막는다 → 패널에서 실제 데이터는 '스냅숏'으로(실제 자료를 --data 로, 실명은 저장소에 넣지 않기).
 *  - 서비스 워커는 끈다(늘 최신 코드). version.txt 는 'preview', 앱 폴더 파일(그림·자료)은 --base 주소에서 받고 안 되면 조용히 넘긴다.
 *  - 저장소(localStorage)는 메모리 흉내 — 미리보기를 열 때마다 처음 상태(마지막 주간·야간 선택만 바깥에서 기억). */
const fs = require('fs'), os = require('os'), path = require('path');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : (argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true); };
const file = argv.find(a => /\.html?$/i.test(a) && argv[argv.indexOf(a) - 1] !== '--out');
if (!file) { console.error('쓰는 법: node preview.cjs 앱/index.html [--data 자료.json] [--seed 저장값.json] [--now …] [--out 파일.html]'); process.exit(1); }
const readJson = p => p ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
const data = readJson(arg('data')), seed = readJson(arg('seed')), now = arg('now'), dv = arg('dv'), live = !!arg('live', false), dark = !!arg('dark', false);
const title = arg('title', (fs.readFileSync(file, 'utf8').match(/<title>([^<]*)<\/title>/i) || [, '웹앱'])[1].trim());
const out = arg('out', path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'preview-')), 'preview.html'));
const app = fs.readFileSync(file, 'utf8');
let base = arg('base');
if (!base) { try { const u = require('child_process').execSync('git remote get-url origin', { cwd: path.dirname(path.resolve(file)), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  const m = u.match(/github\.com[/:]([^/]+)\/([^/.]+)/); if (m) base = `https://${m[1]}.github.io/${m[2]}/`; } catch (e) {} }

const shim = `<script>(() => {
  try { Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true }); } catch (e) {}
  ${dv ? `window.__DV = ${JSON.stringify(dv)};` : ''}
  ${now ? `const NOW = new Date(${JSON.stringify(now)} + ':00+09:00').getTime(), RD = Date, T0 = RD.now();
  window.Date = class extends RD { constructor(...a) { a.length ? super(...a) : super(NOW + (RD.now() - T0)); } static now() { return NOW + (RD.now() - T0); } };` : ''}
  ${live ? `try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); } catch (e) { mkStore(); }` : `mkStore();`}
  function mkStore() { const mem = {}; Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: k => k in mem ? mem[k] : null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; },
    clear: () => { for (const k in mem) delete mem[k]; }, key: i => Object.keys(mem)[i] ?? null, get length() { return Object.keys(mem).length; } } });
    const S = ${JSON.stringify(seed || {})}; for (const k in S) mem[k] = typeof S[k] === 'string' ? S[k] : JSON.stringify(S[k]); }
  const D = ${JSON.stringify(data)}, F = window.fetch.bind(window);
  const ok = d => new Response(JSON.stringify({ ok: true, data: d }), { headers: { 'Content-Type': 'application/json' } });
  window.fetch = (u, o) => { const s = String(u && u.url || u);
    if (/version\\.txt/.test(s)) return Promise.resolve(new Response('preview'));
    if (!/^https?:/.test(s)) return /^(data|blob):/.test(s) ? F(u, o) : F(new URL(s, document.baseURI).href, o).catch(() => new Response('', { status: 404 }));   // 앱 폴더 파일은 Pages 주소(--base)에서, 안 되면 조용히
    if (D && !${live}) { let b = {}; try { b = JSON.parse((o && o.body) || '{}'); } catch (e) {}
      if (b.action && (b.action in D || '*' in D)) return Promise.resolve(ok(b.action in D ? D[b.action] : D['*']));
      for (const k in D) if (k.startsWith('url:') && s.includes(k.slice(4))) return Promise.resolve(ok(D[k])); }
    return F(u, o); };
  /* 주간·야간: 바깥 페이지가 postMessage 로 알려 주면 앱 CSS 의 (prefers-color-scheme) 규칙을 직접 켜고 끔. 규칙은 처음 한 번 모아 둠(바꾼 뒤엔 원래 조건 글이 사라짐) */
  let MODE = '', RULES = null;
  const theme = () => { if (!MODE) return;
    if (!RULES) { RULES = []; const walk = rules => { for (const r of rules) {
        if (r.media && /prefers-color-scheme/.test(r.media.mediaText)) RULES.push([r, /dark/.test(r.media.mediaText)]); else if (r.cssRules) walk(r.cssRules); } };
      for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch (e) {} } }
    RULES.forEach(([r, dk]) => { r.media.mediaText = (dk === (MODE === 'dark')) ? 'all' : 'not all'; });
    document.documentElement.style.colorScheme = MODE;
    document.querySelectorAll('meta[name=theme-color]').forEach(m => m.removeAttribute('media')); };
  addEventListener('message', e => { if (e.data && e.data.previewMode) { MODE = e.data.previewMode; theme(); } });
  /* 휴대폰처럼: 스크롤 막대 숨김 + 마우스로 누른 채 끌어서 위아래로(놓으면 조금 미끄러짐), 살짝 누르면 그냥 누르기 */
  addEventListener('DOMContentLoaded', () => { theme(); parent.postMessage({ previewReady: 1 }, '*');
    const st = document.createElement('style'); st.textContent = '*{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}html,body{cursor:grab}';
    document.head.appendChild(st); });
  const scroller = el => { for (; el && el !== document.documentElement; el = el.parentElement) { const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY + cs.overflowX) && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1)) return el; }
    return document.scrollingElement; };
  let drag = null, moved = false;
  addEventListener('mousedown', e => { if (e.button || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const el = scroller(e.target); drag = { el, x: e.clientX, y: e.clientY, t: el.scrollTop, l: el.scrollLeft, vy: 0, ly: e.clientY, lt: performance.now() }; moved = false; }, true);
  addEventListener('mousemove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!moved && Math.hypot(dx, dy) < 6) return; moved = true; document.documentElement.style.cursor = 'grabbing';
    drag.el.scrollTop = drag.t - dy; drag.el.scrollLeft = drag.l - dx;
    const t = performance.now(); drag.vy = (e.clientY - drag.ly) / Math.max(1, t - drag.lt); drag.ly = e.clientY; drag.lt = t; e.preventDefault(); }, true);
  addEventListener('mouseup', () => { if (!drag) return; const d = drag; drag = null; document.documentElement.style.cursor = '';
    if (moved) { let v = d.vy * 16; const glide = () => { if (Math.abs(v) < .5) return; d.el.scrollTop -= v; v *= .92; requestAnimationFrame(glide); }; glide(); } }, true);
  addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
})();</script>`;
const inner = app.replace(/<head>/i, '<head>' + (base ? `<base href="${base}">` : '') + shim);
const label = live ? '실제 서버' : data ? '자료 파일' : '예시 모드';
const clock = now ? now.slice(11) : new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 16);

const page = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} 미리보기</title>
<style>
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;gap:10px;padding:14px 10px;box-sizing:border-box;
  background:#e9eef5;color:#3c4a5c;font:13px/1.4 -apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Pretendard',sans-serif;transition:background .25s,color .25s}
body.dk{background:#0d1117;color:#c9d1d9}
.mode{display:flex;gap:4px;background:rgba(127,127,127,.18);border-radius:999px;padding:4px}
.mode button{border:0;border-radius:999px;padding:7px 16px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;background:transparent;color:inherit}
.mode button.on{background:#fff;color:#1b2a3c;box-shadow:0 1px 4px rgba(0,0,0,.18)}body.dk .mode button.on{background:#2b3442;color:#fff}
.cap{font-weight:700}.cap small{font-weight:500;opacity:.75;margin-left:6px}
.phone{width:min(390px,94vw);aspect-ratio:390/844;border-radius:54px;padding:12px;background:#111;box-shadow:0 18px 50px rgba(0,0,0,.28),inset 0 0 0 2px #333;position:relative;box-sizing:border-box}
.phone::before{content:'';position:absolute;top:22px;left:50%;transform:translateX(-50%);width:120px;height:34px;border-radius:20px;background:#000;z-index:2}
.scr{width:100%;height:100%;border-radius:42px;overflow:hidden;background:#f3f5f8;display:flex;flex-direction:column}body.dk .scr{background:#10141b}
.sb{height:50px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:6px 30px 0;font-weight:700;font-size:15px;color:#111}body.dk .sb{color:#fff}
iframe{width:100%;flex:1;border:0;background:transparent;display:block}
</style></head><body>
<div class="mode" role="group" aria-label="화면 모드"><button type="button" data-m="light">☀️ 주간</button><button type="button" data-m="dark">🌙 야간</button></div>
<div class="cap">${title} · 미리보기<small>${label}${now ? ' · ' + now.replace('T', ' ') + ' 기준' : ''}</small></div>
<div class="phone"><div class="scr"><div class="sb"><span>${clock}</span><span>LTE ▮▮▮</span></div><iframe title="앱 미리보기" srcdoc="${inner.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></iframe></div></div>
<script>(() => {
  const fr = document.querySelector('iframe'), K = 'webapp-preview-mode';
  let mode = ${JSON.stringify(dark ? 'dark' : 'light')}; try { mode = localStorage.getItem(K) || mode; } catch (e) {}
  const apply = () => { document.body.classList.toggle('dk', mode === 'dark');
    document.querySelectorAll('.mode button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
    try { fr.contentWindow.postMessage({ previewMode: mode }, '*'); } catch (e) {} };
  document.querySelectorAll('.mode button').forEach(b => b.onclick = () => { mode = b.dataset.m; try { localStorage.setItem(K, mode); } catch (e) {} apply(); });
  addEventListener('message', e => { if (e.data && e.data.previewReady) apply(); });
  fr.addEventListener('load', () => setTimeout(apply, 50)); apply();
})();</script>
</body></html>`;
fs.writeFileSync(out, page);
console.log(out);
