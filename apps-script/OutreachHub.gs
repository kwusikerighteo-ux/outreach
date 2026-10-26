/** @OnlyCurrentDoc  (only asks for access to this one spreadsheet, not all of your files) */

/**
 * OUTREACH HUB
 * One script that powers the dashboard, the phone app and the Unibox for one CRM sheet.
 *
 * Install: open the CRM sheet -> Extensions -> Apps Script -> paste this whole file -> Save.
 * Then follow HUB-SETUP.md. You never need to edit this code: everything is set from the
 * "Outreach" menu that appears in your Google Sheet.
 */

const CONFIG = {
  CRM_TAB: 'CRM Data',
  MESSAGES_TAB: 'Thread Messages',
  SYNC_EVERY_MINUTES: 5,      // how often each connected inbox is checked (1, 5, 10, 15 or 30)
  NOTIFY_MAX_AGE_HOURS: 6,    // only send phone alerts for replies newer than this
  MAX_BODY_CHARS: 4000,
  BACKFILL_BATCH: 150         // threads read per run during an inbox's first sync
};

const MSG_HEADERS = ['Message Id', 'Thread Id', 'Mailbox', 'Direction', 'From', 'To', 'Date', 'Subject', 'Body', 'Synced At'];
// 1-based column numbers in the CRM tab (A = 1)
const CRM_COL = { business: 1, contact: 2, email: 3, title: 4, status: 17, date: 18, threadId: 20, sender: 21 };
const ALLOWED_STATUSES = ['Pending', 'Sent1', 'Sent2', 'Sent3', 'Over', 'Interested', 'Uninterested',
  'Out of office', 'Wrong Person', 'Automatic reply', 'Uncertain'];

const props_ = () => PropertiesService.getScriptProperties();

/* =====================================================================
 * 1) MENU IN THE GOOGLE SHEET (used by you, the owner)
 * ===================================================================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Outreach')
    .addItem('1. Set up', 'setup')
    .addItem('2. Save web app links', 'saveLinks')
    .addSeparator()
    .addItem('Show links', 'showLinks')
    .addItem('Connected inboxes', 'showInboxes')
    .addItem('Send test notification', 'testNotification')
    .addToUi();
}

function setup() {
  const p = props_();
  if (!p.getProperty('SECRET')) p.setProperty('SECRET', randomId_(40));
  if (!p.getProperty('NTFY_TOPIC')) p.setProperty('NTFY_TOPIC', 'outreach-' + randomId_(14).toLowerCase());
  p.setProperty('SHEET_ID', SpreadsheetApp.getActiveSpreadsheet().getId());
  p.setProperty('OWNER', Session.getEffectiveUser().getEmail());
  crmRows_();
  messagesSheet_();
  const msg = 'Step 1 done ✓  Next: create the two links (HUB-SETUP.md, step 3).';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); } // getUi() is unavailable when run from the editor
}

function saveLinks() {
  const ui = SpreadsheetApp.getUi();
  if (!props_().getProperty('SECRET')) { ui.alert('Please run Outreach → 1. Set up first.'); return; }
  const isWebApp = (u) => /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/.test(u);
  const ask = (title, text, check, bad) => {
    for (;;) {
      const r = ui.prompt(title, text, ui.ButtonSet.OK_CANCEL);
      if (r.getSelectedButton() !== ui.Button.OK) return null;
      const v = r.getResponseText().trim();
      if (check(v)) return v;
      ui.alert(bad);
    }
  };
  const dash = ask('Dashboard address (1 of 3)',
    'Paste your GitHub Pages address, e.g. https://your-name.github.io/outreach/',
    (v) => /^https:\/\/[^\s]+$/.test(v), 'That should start with https://');
  if (!dash) return;
  const api = ask('"Outreach API" link (2 of 3)',
    'Paste the Web app URL of the deployment that runs as YOU (ends with /exec).', isWebApp,
    'That doesn\'t look like a web app URL. It starts with https://script.google.com/ and ends with /exec');
  if (!api) return;
  const connect = ask('"Connect inbox" link (3 of 3)',
    'Paste the Web app URL of the deployment that runs as THE USER ACCESSING it (ends with /exec).', isWebApp,
    'That doesn\'t look like a web app URL. It starts with https://script.google.com/ and ends with /exec');
  if (!connect) return;
  if (api === connect) { ui.alert('Those two links are the same. You need two separate deployments (see HUB-SETUP.md).'); return; }
  props_().setProperties({ DASHBOARD_URL: dash.replace(/\/?$/, '/'), API_URL: api, CONNECT_URL: connect });
  showLinks();
}

function links_() {
  const p = props_().getProperties();
  if (!p.API_URL || !p.CONNECT_URL || !p.DASHBOARD_URL) return null;
  const token = Utilities.base64EncodeWebSafe(JSON.stringify({ u: p.API_URL, k: p.SECRET, t: p.NTFY_TOPIC }));
  return {
    app: p.DASHBOARD_URL + 'mobile-app/#c=' + token,
    desktop: p.DASHBOARD_URL + '#c=' + token,
    connect: p.CONNECT_URL + '?connect=1',
    alerts: 'https://ntfy.sh/' + p.NTFY_TOPIC
  };
}

function showLinks() {
  const l = links_();
  if (!l) { SpreadsheetApp.getUi().alert('Please run Outreach → 2. Save web app links first.'); return; }
  const rows = [
    ['📱 Phone app', 'Open on your phone. It connects automatically.', l.app],
    ['🖥️ Desktop dashboard', 'Open on a computer. It connects automatically.', l.desktop],
    ['📨 Connect an inbox', 'Open while signed in to a sending inbox, then click Connect.', l.connect],
    ['🔔 Reply alerts', 'Optional. Open on a phone with the free ntfy app installed.', l.alerts]
  ];
  const html = '<style>body{font-family:Arial,sans-serif;font-size:13px;color:#152447}b{font-size:14px}' +
    'p{margin:2px 0 6px;color:#5C6C8F}.r{margin-bottom:16px}.f{display:flex;gap:6px}' +
    'input{flex:1;padding:7px;border:1px solid #c9d6ee;border-radius:6px;font-size:12px}' +
    'button{padding:7px 12px;border:0;border-radius:6px;background:#3D6FE0;color:#fff;cursor:pointer}</style>' +
    rows.map((r, i) => `<div class="r"><b>${r[0]}</b><p>${r[1]}</p><div class="f"><input id="l${i}" readonly value="${r[2]}">` +
      `<button onclick="var x=document.getElementById('l${i}');x.select();document.execCommand('copy');this.textContent='Copied ✓'">Copy</button></div></div>`).join('') +
    '<p>Keep these links private: anyone with the app or dashboard link can see your data.</p>';
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(620).setHeight(470), 'Your Outreach links');
}

function showInboxes() {
  const list = inboxes_();
  const emails = Object.keys(list).sort();
  const fmt = (iso) => (iso ? Utilities.formatDate(new Date(iso), Session.getScriptTimeZone(), 'MMM d, HH:mm') : '-');
  const body = emails.length ? emails.map((e) => {
    const s = list[e];
    const state = s.disconnectedAt ? 'Disconnected' : s.lastError ? '⚠️ ' + s.lastError : '✓ Working';
    return `<tr><td>${e}</td><td>${fmt(s.connectedAt)}</td><td>${fmt(s.lastSync)}</td><td>${state}</td></tr>`;
  }).join('') : '<tr><td colspan="4">No inboxes connected yet. Send the "Connect an inbox" link (Outreach → Show links).</td></tr>';
  const html = '<style>body{font-family:Arial,sans-serif;font-size:12.5px;color:#152447}table{border-collapse:collapse;width:100%}' +
    'td,th{text-align:left;padding:7px;border-bottom:1px solid #e3eaf7}th{color:#5C6C8F}</style>' +
    `<p>${emails.length} inbox${emails.length === 1 ? '' : 'es'} connected.</p>` +
    `<table><tr><th>Inbox</th><th>Connected</th><th>Last check</th><th>Status</th></tr>${body}</table>`;
  SpreadsheetApp.getUi().showModalDialog(HtmlService.createHtmlOutput(html).setWidth(700).setHeight(460), 'Connected inboxes');
}

function testNotification() {
  notify_({ title: 'Outreach', message: 'Reply alerts are working ✓', tags: ['white_check_mark'] });
  SpreadsheetApp.getUi().alert('Test alert sent. If your phone is subscribed (Outreach → Show links → Reply alerts) it arrives in a few seconds.');
}

/* =====================================================================
 * 2) WEB APP (both deployments run this same code)
 * ===================================================================== */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action) return api_(p);
  if (p.connect) return connectPage_();
  return HtmlService.createHtmlOutput('<p style="font-family:Arial,sans-serif">Outreach Hub is running ✓</p>');
}

function doPost(e) {
  let req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  return api_(req);
}

function api_(req) {
  if (!req.key || req.key !== props_().getProperty('SECRET')) return json_({ ok: false, error: 'Access denied' });
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    switch (req.action) {
      case 'ping': return json_({ ok: true });
      case 'data': return json_(Object.assign({ ok: true }, data_()));
      case 'threads': return json_({ ok: true, threads: threadsFor_(req.mailboxes) });
      case 'ingest':
        lock.waitLock(30000); locked = true;
        return json_(Object.assign({ ok: true }, ingest_(req)));
      case 'setStatus':
        lock.waitLock(30000); locked = true;
        return json_(Object.assign({ ok: true }, setStatus_(req.threadId, req.status)));
      default: return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  } finally {
    if (locked) lock.releaseLock();
  }
}

/* ---------- Data for the dashboard ---------- */

// The sheet this script is attached to (also works inside the web app and triggers).
function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(props_().getProperty('SHEET_ID'));
}

const cell_ = (v) => (v instanceof Date ? v.toISOString() : String(v == null ? '' : v));

function crmRows_() {
  const sh = ss_().getSheetByName(CONFIG.CRM_TAB);
  if (!sh) throw new Error('Tab "' + CONFIG.CRM_TAB + '" not found');
  const last = sh.getLastRow();
  return { sheet: sh, rows: last < 2 ? [] : sh.getRange(2, 1, last - 1, 21).getValues() };
}

// Only the columns the dashboard needs, in the same positions as the sheet (A..U).
function data_() {
  const keep = [CRM_COL.business, CRM_COL.contact, CRM_COL.email, CRM_COL.title, CRM_COL.status, CRM_COL.date, CRM_COL.threadId, CRM_COL.sender].map((c) => c - 1);
  const crm = [];
  crmRows_().rows.forEach((r) => {
    if (!r[CRM_COL.status - 1] && !r[CRM_COL.business - 1] && !r[CRM_COL.email - 1]) return;
    const out = new Array(21).fill('');
    keep.forEach((i) => { out[i] = cell_(r[i]); });
    crm.push(out);
  });
  const sh = ss_().getSheetByName(CONFIG.MESSAGES_TAB);
  const last = sh ? sh.getLastRow() : 0;
  const messages = last > 1 ? sh.getRange(2, 1, last - 1, 9).getValues().map((r) => r.map(cell_)) : [];
  return { crm, messages, at: new Date().toISOString() };
}

function threadsFor_(mailboxes) {
  const list = Array.isArray(mailboxes) ? mailboxes : String(mailboxes || '').split(',');
  const mine = new Set(list.map((m) => String(m).trim().toLowerCase()).filter(String));
  const ids = [];
  crmRows_().rows.forEach((r) => {
    const id = String(r[CRM_COL.threadId - 1] || '').trim();
    if (id && mine.has(String(r[CRM_COL.sender - 1] || '').trim().toLowerCase())) ids.push(id);
  });
  return ids;
}

/* ---------- Save messages ---------- */

function messagesSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(CONFIG.MESSAGES_TAB);
  if (!sh) {
    sh = ss.insertSheet(CONFIG.MESSAGES_TAB);
    sh.getRange(1, 1, 1, MSG_HEADERS.length).setValues([MSG_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:J').setNumberFormat('@'); // keep everything as plain text
  }
  return sh;
}

// Text that starts with = + - @ would be treated as a formula; the leading ' keeps it as text.
const safe_ = (v) => { const s = String(v == null ? '' : v); return /^[=+\-@]/.test(s) ? "'" + s : s; };

function ingest_(req) {
  const msgs = Array.isArray(req.messages) ? req.messages : [];
  if (!msgs.length) return { added: 0 };
  const sh = messagesSheet_();
  const last = sh.getLastRow();
  const existing = new Set(last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues().map((r) => String(r[0])) : []);
  const fresh = msgs.filter((m) => m && m.id && !existing.has(String(m.id)));
  if (!fresh.length) return { added: 0 };
  const now = new Date().toISOString();
  const rows = fresh.map((m) => [m.id, m.threadId, req.mailbox || '', m.direction, m.from, m.to, m.date, m.subject, m.body, now].map(safe_));
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, MSG_HEADERS.length).setValues(rows);
  if (!req.backfill) alertNewReplies_(fresh);
  return { added: rows.length };
}

/* ---------- Relabel from the Unibox ---------- */

function setStatus_(threadId, status) {
  const id = String(threadId || '').trim();
  const canonical = ALLOWED_STATUSES.filter((s) => s.toLowerCase() === String(status || '').trim().toLowerCase())[0];
  if (!id) throw new Error('Missing conversation');
  if (!canonical) throw new Error('Unknown label "' + status + '"');
  const crm = crmRows_();
  let updated = 0;
  crm.rows.forEach((r, i) => {
    if (String(r[CRM_COL.threadId - 1] || '').trim() === id) {
      crm.sheet.getRange(i + 2, CRM_COL.status).setValue(canonical);
      updated++;
    }
  });
  if (!updated) throw new Error('Conversation not found in ' + CONFIG.CRM_TAB);
  return { updated, status: canonical };
}

/* ---------- Phone alerts (ntfy) ---------- */

function notify_(payload) {
  const topic = props_().getProperty('NTFY_TOPIC');
  if (!topic) return;
  UrlFetchApp.fetch('https://ntfy.sh/', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify(Object.assign({ topic }, payload))
  });
}

function alertNewReplies_(msgs) {
  const fresh = msgs.filter((m) => m.direction === 'Received' &&
    Date.now() - new Date(m.date).getTime() < CONFIG.NOTIFY_MAX_AGE_HOURS * 3600 * 1000);
  if (!fresh.length) return;
  const leads = {};
  crmRows_().rows.forEach((r) => {
    const id = String(r[CRM_COL.threadId - 1] || '').trim();
    if (id) leads[id] = { business: r[CRM_COL.business - 1], contact: r[CRM_COL.contact - 1], status: r[CRM_COL.status - 1] };
  });
  const dash = props_().getProperty('DASHBOARD_URL');
  fresh.forEach((m) => {
    const lead = leads[m.threadId] || {};
    const who = lead.contact || lead.business || m.from;
    const status = String(lead.status || '');
    const interested = /^interested$/i.test(status);
    const payload = {
      title: 'New reply: ' + who + (lead.business && lead.contact ? ' (' + lead.business + ')' : ''),
      message: (status ? '[' + status + '] ' : '') + String(m.body || '').slice(0, 220),
      tags: [interested ? 'star' : 'envelope'],
      priority: interested ? 4 : 3
    };
    if (dash) payload.click = dash + 'mobile-app/#thread=' + encodeURIComponent(m.threadId);
    notify_(payload);
  });
}

/* =====================================================================
 * 3) CONNECT AN INBOX (runs as the person who opens the Connect link)
 * ===================================================================== */

const CONNECT_HTML = `<!DOCTYPE html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{margin:0;font-family:Arial,sans-serif;background:linear-gradient(160deg,#E4EFFF,#CDE1FF);min-height:100vh;display:flex;align-items:center;justify-content:center;color:#152447}
.card{background:#fff;border-radius:24px;box-shadow:10px 10px 24px rgba(58,92,168,.25);padding:30px 26px;max-width:380px;width:calc(100% - 32px);text-align:center}
.icon{width:58px;height:58px;border-radius:18px;margin:0 auto 14px;background:linear-gradient(150deg,#3D6FE0,#4E45D6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px}
h1{font-size:20px;margin:0 0 8px}p{color:#5C6C8F;font-size:14px;line-height:1.5;margin:0 0 18px}
.email{display:inline-block;background:#eef4ff;color:#2A52B8;font-weight:bold;padding:6px 12px;border-radius:999px;margin-bottom:18px;font-size:13px;word-break:break-all}
button{border:0;border-radius:14px;padding:13px 22px;font-size:15px;font-weight:bold;cursor:pointer;width:100%}
.go{background:linear-gradient(150deg,#3D6FE0,#2A52B8);color:#fff}.off{background:#eef2f9;color:#5C6C8F;margin-top:10px}
.ok{color:#11845f;font-weight:bold}.err{color:#c8433f}
</style></head><body><div class="card">
<div class="icon">✉</div>
<h1 id="h"><?= connected ? 'This inbox is connected' : 'Connect this inbox' ?></h1>
<div class="email"><?= email ?></div>
<p id="t"><?= connected ? 'Replies to your outreach emails are being copied to the Unibox every few minutes.' : 'Replies to your outreach emails from this inbox will appear in the Unibox. Only email threads from your campaigns are read.' ?></p>
<button class="go" id="go" <?= connected ? 'hidden' : '' ?>>Connect</button>
<button class="off" id="off" <?= connected ? '' : 'hidden' ?>>Disconnect this inbox</button>
<p id="m" style="margin:14px 0 0"></p>
</div><script>
var go=document.getElementById('go'),off=document.getElementById('off'),m=document.getElementById('m');
function busy(b,txt){b.disabled=true;b.textContent=txt;}
go.onclick=function(){busy(go,'Connecting…');m.textContent='';
google.script.run.withSuccessHandler(function(r){go.hidden=true;off.hidden=false;off.disabled=false;off.textContent='Disconnect this inbox';
document.getElementById('h').textContent='Connected ✓';document.getElementById('t').textContent='All done. You can close this page. Conversations appear in the Unibox within about 10 minutes.';
m.className='ok';m.textContent='';}).withFailureHandler(function(e){go.disabled=false;go.textContent='Try again';m.className='err';m.textContent=e.message;}).connectInbox();};
off.onclick=function(){busy(off,'Disconnecting…');
google.script.run.withSuccessHandler(function(){off.hidden=true;go.hidden=false;go.disabled=false;go.textContent='Connect';
document.getElementById('h').textContent='Disconnected';document.getElementById('t').textContent='This inbox is no longer synced.';}).withFailureHandler(function(e){off.disabled=false;off.textContent='Disconnect this inbox';m.className='err';m.textContent=e.message;}).disconnectInbox();};
</script></body></html>`;

function connectPage_() {
  const t = HtmlService.createTemplate(CONNECT_HTML);
  t.email = Session.getEffectiveUser().getEmail();
  t.connected = ScriptApp.getProjectTriggers().some((tr) => tr.getHandlerFunction() === 'syncInbox');
  return t.evaluate().setTitle('Connect inbox').addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function connectInbox() {
  const res = callApi_('ping', {});
  if (!res.ok) throw new Error('The Hub is not reachable yet (' + res.error + '). Finish HUB-SETUP.md step 4 first.');
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === 'syncInbox') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncInbox').timeBased().everyMinutes(CONFIG.SYNC_EVERY_MINUTES).create();
  PropertiesService.getUserProperties().deleteAllProperties();
  CacheService.getUserCache().remove('ids');
  const me = myAddresses_()[0];
  setInboxStatus_(me, { connectedAt: new Date().toISOString(), disconnectedAt: '', lastError: '' });
  return { email: me };
}

function disconnectInbox() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === 'syncInbox') ScriptApp.deleteTrigger(t); });
  setInboxStatus_(myAddresses_()[0], { disconnectedAt: new Date().toISOString() });
  return true;
}

/** Runs every few minutes for each connected inbox, as that inbox. */
function syncInbox() {
  const me = myAddresses_();
  try {
    syncInboxNow_(me);
    setInboxStatus_(me[0], { lastSync: new Date().toISOString(), lastError: '' });
  } catch (err) {
    // Recorded for "Connected inboxes" instead of thrown, so inbox owners don't get failure emails.
    setInboxStatus_(me[0], { lastError: String((err && err.message) || err).slice(0, 200) });
  }
}

function syncInboxNow_(me) {
  const userProps = PropertiesService.getUserProperties();
  const cache = CacheService.getUserCache();
  const meSet = new Set(me);
  const startedAt = Date.now();
  const last = Number(userProps.getProperty('lastSync') || 0);

  // This inbox's campaign thread ids, refreshed every 30 minutes.
  let ids = JSON.parse(cache.get('ids') || 'null');
  if (!ids) {
    const res = callApi_('threads', { mailboxes: me });
    if (!res.ok) throw new Error(res.error);
    ids = res.threads || [];
    try { cache.put('ids', JSON.stringify(ids), 1800); } catch (e) { /* too large to cache: fetch again next run */ }
  }
  const idSet = new Set(ids);

  let threads;
  let backfill = false;
  let cursor = 0;
  if (!last) {
    backfill = true;
    cursor = Number(userProps.getProperty('cursor') || 0);
    threads = ids.slice(cursor, cursor + CONFIG.BACKFILL_BATCH).map((id) => {
      try { return GmailApp.getThreadById(id); } catch (e) { return null; }
    }).filter(Boolean);
    cursor += CONFIG.BACKFILL_BATCH;
  } else {
    const after = Math.floor((last - 15 * 60 * 1000) / 1000); // 15 min overlap for safety
    threads = GmailApp.search('after:' + after, 0, 300).filter((t) => idSet.has(t.getId()));
  }

  const out = [];
  threads.forEach((thread) => {
    const msgs = thread.getMessages();
    if (!msgs.some((m) => !meSet.has(address_(m.getFrom())))) return; // no reply from the lead yet
    msgs.forEach((m) => {
      if (m.isInTrash()) return;
      out.push({
        id: m.getId(),
        threadId: thread.getId(),
        direction: meSet.has(address_(m.getFrom())) ? 'Sent' : 'Received',
        from: m.getFrom(),
        to: m.getTo(),
        date: m.getDate().toISOString(),
        subject: m.getSubject(),
        body: cleanBody_(m.getPlainBody()).slice(0, CONFIG.MAX_BODY_CHARS)
      });
    });
  });

  for (let i = 0; i < out.length; i += 50) {
    const res = callApi_('ingest', { mailbox: me[0], backfill, messages: out.slice(i, i + 50) });
    if (!res.ok) throw new Error(res.error); // progress not saved, so this run is retried
  }

  if (backfill && cursor < ids.length) {
    userProps.setProperty('cursor', String(cursor));
  } else {
    userProps.deleteProperty('cursor');
    userProps.setProperty('lastSync', String(startedAt));
  }
}

/* ---------- Helpers ---------- */

function callApi_(action, data) {
  const p = props_().getProperties();
  if (!p.API_URL) return { ok: false, error: 'hub links not saved yet' };
  const res = UrlFetchApp.fetch(p.API_URL, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: true,
    payload: JSON.stringify(Object.assign({ key: p.SECRET, action }, data))
  });
  try { return JSON.parse(res.getContentText()); }
  catch (e) { return { ok: false, error: 'hub not reachable (HTTP ' + res.getResponseCode() + ')' }; }
}

function inboxes_() {
  try { return JSON.parse(props_().getProperty('INBOXES') || '{}'); } catch (e) { return {}; }
}

function setInboxStatus_(email, fields) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const all = inboxes_();
    all[email] = Object.assign(all[email] || {}, fields);
    props_().setProperty('INBOXES', JSON.stringify(all));
  } finally {
    lock.releaseLock();
  }
}

function myAddresses_() {
  return [Session.getEffectiveUser().getEmail()].concat(GmailApp.getAliases())
    .map((a) => String(a).trim().toLowerCase()).filter(String);
}

// "Jane Doe <jane@x.com>" -> "jane@x.com"
function address_(from) {
  const m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

function randomId_(len) {
  let s = '';
  while (s.length < len) s += Utilities.getUuid().replace(/-/g, '');
  return s.slice(0, len);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Keep only the new text of an email: drops quoted earlier messages, signatures,
 * "Sent from my iPhone" lines, image placeholders and trailing contact details.
 */
function cleanBody_(text) {
  if (!text) return '';
  const original = String(text).replace(/\r\n?/g, '\n');
  let lines = original.split('\n');

  // 1) Cut at the start of quoted history / signature markers.
  const cutAt = [
    /^\s*On\b.{0,300}\bwrote:\s*$/i,
    /^\s*(Le|El|Il|Em|Op|Am)\b.{0,300}(écrit|escribió|scritto|escreveu|geschreven|schrieb).{0,60}:\s*$/i,
    /^\s*-{2,}\s*(Original Message|Forwarded message|Mensaje original|Message d'origine)\s*-{2,}/i,
    /^\s*_{8,}\s*$/,
    /^\s*Sent from my\b/i,
    /^\s*Get Outlook for\b/i,
    /^\s*Sent from (Mail|Outlook|Yahoo|Gmail)\b/i,
    /^--\s*$/
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const twoLines = line + ' ' + (lines[i + 1] || '');
    const outlookHeader = /^\s*From:\s/i.test(line) && /^\s*(Sent|Date|To):\s/i.test(lines[i + 1] || '');
    if (outlookHeader || cutAt.some((re) => re.test(line)) ||
        (/^\s*On\b/i.test(line) && /\bwrote:\s*$/i.test(twoLines) && twoLines.length < 400)) {
      lines = lines.slice(0, i);
      break;
    }
  }

  // 2) Drop quoted lines and image placeholders.
  lines = lines.filter((l) => !/^\s*>/.test(l) && !/^\s*\[(image|cid):[^\]]*\]\s*$/i.test(l));

  // 3) Signature after a sign-off near the end: keep the sign-off and the name, drop the rest.
  const signOff = /^\s*(best|best regards|kind regards|warm regards|warmest regards|regards|many thanks|thanks|thank you|thanks again|thanks so much|cheers|sincerely|yours sincerely|yours truly|respectfully|all the best|talk soon|take care|br)\s*[,.!]?\s*$/i;
  const start = Math.max(0, lines.length - 15);
  for (let i = lines.length - 1; i >= start; i--) {
    if (signOff.test(lines[i])) {
      let end = i + 1;
      const next = (lines[end] || '').trim();
      if (next && next.length <= 40 && !/[@\d]|https?:|www\./i.test(next)) end++;
      lines = lines.slice(0, end);
      break;
    }
  }

  // 4) Short trailing contact-detail lines (phone, url, email, social).
  const contact = /(\+?\d[\d\s().-]{6,}\d|https?:\/\/|www\.|@[\w.-]+\.\w+|linkedin\.com|^\s*(tel|phone|mobile|cell|m|t|e|w)\s*[:.]\s)/i;
  const isContactLine = (l) => l.trim().length < 70 && contact.test(l);
  while (lines.length && (!lines[lines.length - 1].trim() || isContactLine(lines[lines.length - 1]))) lines.pop();

  const cleaned = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return cleaned || original.trim().slice(0, 500);
}
