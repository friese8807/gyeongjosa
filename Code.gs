/**
 * 경조사 기록장 — 구글 시트 서버 (Apps Script)
 *
 * 쓰는 법
 *  1. 이 코드가 들어갈 구글 시트를 열고 [확장 프로그램 → Apps Script] 를 누른다.
 *  2. Code.gs 내용을 모두 지우고 이 파일 내용을 붙여 넣은 뒤 저장한다.
 *  3. [배포 → 새 배포 → 유형: 웹 앱] · 실행: 나 · 액세스: 모든 사용자 → 배포 → 권한 허용.
 *  4. 나온 …/exec 주소를 앱 [설정 → 구글 시트 백업] 에 붙여 넣는다.
 *  코드를 고친 뒤에는 [배포 관리 → 수정 → 새 버전] 으로 다시 배포해야 반영된다(주소는 그대로).
 *
 * 시트
 *  · 기록 : 한 줄에 경조사 한 건. 1행은 제목. 시트에서 직접 고쳐도 앱에 반영된다.
 *  · 항목 : 앱의 [항목 관리] 목록(누구의·종류·사이·금액 버튼·표시)을 JSON 으로 저장.
 */
const TZ = 'Asia/Seoul';
const HEAD = ['id', '날짜', '구분', '이름', '누구의', '종류', '금액', '나와의 사이', '표시', '연락처', '메모', '수정시각', '캘린더'];

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) {}
  return out_(handle_(p));
}
/* 아이폰 홈 화면 앱에서 fetch 가 막힐 때 쓰는 JSONP: …/exec?callback=이름&p=JSON */
function doGet(e) {
  const cb = e.parameter.callback;
  let p = {};
  try { p = JSON.parse(e.parameter.p || '{}'); } catch (err) {}
  const res = cb ? handle_(p) : { ok: true, data: '경조사 기록장 서버가 동작하고 있어요.' };
  if (cb && /^[A-Za-z0-9_]+$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + JSON.stringify(res) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return out_(res);
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function handle_(p) {
  try {
    switch (p.action) {
      case 'load': return { ok: true, data: { recs: readAll_(), cats: readCats_() } };
      case 'save': return withLock_(() => { saveOne_(p.rec, p.cal !== false); return true; });
      case 'del':  return withLock_(() => { delOne_(p.id); return true; });
      case 'bulk': return withLock_(() => { (p.recs || []).forEach(r => saveOne_(r, false)); return true; });
      case 'cats': return withLock_(() => { sheet_('항목').getRange('A1').setValue(JSON.stringify(p.cats || {})); return true; });
      default: return { ok: false, code: 'bad', message: '알 수 없는 요청이에요' };
    }
  } catch (err) {
    return { ok: false, code: 'error', message: '서버에서 처리하지 못했어요: ' + err.message };
  }
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return { ok: true, data: fn() }; } finally { lock.releaseLock(); }
}

/* ── 시트 ── */
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (name === '기록') { sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold'); sh.setFrozenRows(1); }
  }
  if (name === '기록') sh.getRange('B:B').setNumberFormat('@');   // 날짜를 글자로 두어 시간대 문제를 막는다
  return sh;
}
const fmtDate_ = v => v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || '').trim().replace(/[./]/g, '-');

function readAll_() {
  const sh = sheet_('기록'), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const rows = sh.getRange(2, 1, n, HEAD.length).getValues();
  const recs = [];
  rows.forEach((r, i) => {
    if (!r[3]) return;                                   // 이름이 없는 줄은 건너뛴다
    if (!r[0]) { r[0] = 'r' + Date.now().toString(36) + i; sh.getRange(i + 2, 1).setValue(r[0]); }   // 시트에 직접 쓴 줄은 id 를 붙인다
    recs.push({
      id: String(r[0]), date: fmtDate_(r[1]), dir: /받/.test(r[2]) ? 'recv' : 'give', name: String(r[3]),
      who: String(r[4] || ''), type: String(r[5] || ''), amount: Number(String(r[6]).replace(/[^0-9]/g, '')) || 0,
      grp: String(r[7] || ''), tags: String(r[8] || '').split(/[\s,#]+/).filter(String), phone: String(r[9] || ''),
      memo: String(r[10] || ''), upd: r[11] instanceof Date ? r[11].getTime() : Number(r[11]) || 0,
    });
  });
  return recs;
}
function findRow_(sh, id) {
  const n = sh.getLastRow() - 1; if (n < 1) return 0;
  const ids = sh.getRange(2, 1, n, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}
function saveOne_(r, cal) {
  if (!r || !r.id || !r.name) throw new Error('이름이 없는 기록이에요');
  const sh = sheet_('기록'), row = findRow_(sh, r.id);
  const oldEv = row ? String(sh.getRange(row, 13).getValue() || '') : '';
  const ev = cal ? syncEvent_(r, oldEv) : oldEv;
  const vals = [[r.id, r.date, r.dir === 'recv' ? '받음' : '보냄', r.name, r.who || '', r.type || '', Number(r.amount) || 0,
    r.grp || '', (r.tags || []).map(t => '#' + t).join(' '), r.phone ? "'" + r.phone : '', r.memo || '', new Date(), ev]];
  if (row) sh.getRange(row, 1, 1, HEAD.length).setValues(vals);
  else sh.getRange(sh.getLastRow() + 1, 1, 1, HEAD.length).setValues(vals);
}
function delOne_(id) {
  const sh = sheet_('기록'), row = findRow_(sh, id);
  if (!row) return;
  const ev = String(sh.getRange(row, 13).getValue() || '');
  if (ev) { try { CalendarApp.getDefaultCalendar().getEventById(ev)?.deleteEvent(); } catch (e) {} }
  sh.deleteRow(row);
}
function readCats_() {
  const v = sheet_('항목').getRange('A1').getValue();
  try { return v ? JSON.parse(v) : null; } catch (e) { return null; }
}

/* ── 구글 캘린더 ── 오늘 이후 경조사는 종일 일정 + 전날 오전 9시 알림 */
function syncEvent_(r, evId) {
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const calApp = CalendarApp.getDefaultCalendar();
  let ev = null;
  if (evId) { try { ev = calApp.getEventById(evId); } catch (e) {} }
  if (r.date < today) return ev ? ev.getId() : '';
  const [y, m, d] = r.date.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const title = `[경조사] ${r.name} ${[r.who, r.type].filter(String).join(' ')}`;
  const desc = [`${r.dir === 'recv' ? '받음' : '보냄'} ${Number(r.amount || 0).toLocaleString('ko-KR')}원`, r.phone, r.memo].filter(String).join('\n');
  if (ev) { ev.setTitle(title); ev.setAllDayDate(day); ev.setDescription(desc); }
  else { ev = calApp.createAllDayEvent(title, day, { description: desc }); }
  ev.removeAllReminders(); ev.addPopupReminder(900);   // 종일 일정 시작(자정) 15시간 전 = 전날 오전 9시
  return ev.getId();
}

/* 처음 한 번 [실행]해 두면 권한 허용 창이 미리 떠서 배포가 수월하다 */
function setup() { sheet_('기록'); sheet_('항목'); CalendarApp.getDefaultCalendar(); }
