/* Unibox data logic shared by the desktop dashboard (index.html) and the mobile app (mobile-app/index.html). */
(function () {
  'use strict';

  const MSG_TAB = 'Thread Messages';
  // 0-based columns
  const CRM = { business: 0, contact: 1, email: 2, title: 3, status: 16, threadId: 19, sender: 20 };
  const MSG = { id: 0, threadId: 1, mailbox: 2, direction: 3, from: 4, to: 5, date: 6, subject: 7, body: 8 };

  // Labels you can pick in the Unibox (written to the Email Status column).
  const STATUS_OPTIONS = ['Interested', 'Uninterested', 'Out of office', 'Wrong Person', 'Automatic reply', 'Uncertain'];
  const FILTERS = { all: 'All', interested: 'Interested', uninterested: 'Not interested', other: 'Other', unread: 'Unread' };

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  function statusMeta(status) {
    const s = norm(status);
    if (s === 'interested') return { label: 'Interested', cls: 'chip-green', cat: 'interested' };
    if (s === 'uninterested') return { label: 'Not interested', cls: 'chip-red', cat: 'uninterested' };
    if (s === 'out of office') return { label: 'Out of office', cls: 'chip-teal', cat: 'other' };
    if (s === 'automatic reply') return { label: 'Auto reply', cls: 'chip-slate', cat: 'other' };
    if (s === 'wrong person') return { label: 'Wrong person', cls: 'chip-amber', cat: 'other' };
    if (s === 'uncertain') return { label: 'Uncertain', cls: 'chip-amber', cat: 'other' };
    return { label: 'Unlabeled', cls: 'chip-blue', cat: 'other' }; // replied but status still Sent1/Over/...
  }

  // "Jane Doe <jane@x.com>" -> { name: "Jane Doe", email: "jane@x.com" }
  function parseFrom(from) {
    const s = String(from || '').trim();
    const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (m) return { name: m[1].trim(), email: m[2].trim() };
    return { name: '', email: s };
  }

  function leadIndex(crmValues) {
    const map = new Map();
    for (const r of crmValues || []) {
      if (!r) continue;
      const id = String(r[CRM.threadId] || '').trim();
      if (!id || norm(r[CRM.status]) === 'email status') continue;
      map.set(id, {
        business: String(r[CRM.business] || '').trim(),
        contact: String(r[CRM.contact] || '').trim(),
        email: String(r[CRM.email] || '').trim(),
        title: String(r[CRM.title] || '').trim(),
        status: String(r[CRM.status] || '').trim(),
        mailbox: String(r[CRM.sender] || '').trim()
      });
    }
    return map;
  }

  /** Group "Thread Messages" rows into conversations that have at least one reply, newest first. */
  function buildThreads(msgValues, leads) {
    const byId = new Map();
    for (const r of msgValues || []) {
      if (!r) continue;
      const id = String(r[MSG.threadId] || '').trim();
      const mid = String(r[MSG.id] || '').trim();
      if (!id || !mid || mid === 'Message Id') continue;
      const date = new Date(r[MSG.date]);
      if (isNaN(date)) continue;
      let t = byId.get(id);
      if (!t) { t = { mailbox: String(r[MSG.mailbox] || '').trim(), messages: [], ids: new Set() }; byId.set(id, t); }
      if (t.ids.has(mid)) continue;
      t.ids.add(mid);
      t.messages.push({
        id: mid,
        direction: /^received$/i.test(String(r[MSG.direction] || '').trim()) ? 'Received' : 'Sent',
        from: String(r[MSG.from] || ''),
        to: String(r[MSG.to] || ''),
        date,
        subject: String(r[MSG.subject] || ''),
        body: String(r[MSG.body] || '')
      });
    }

    // Bounce notices ("Message blocked", "Delivery failed") come from the mail server, not the lead.
    const isBounce = (m) => /mailer-daemon|postmaster@|mail delivery (subsystem|system)/i.test(m.from);
    const threads = [];
    for (const [id, t] of byId) {
      t.messages = t.messages.filter((m) => !(m.direction === 'Received' && isBounce(m)));
      const received = t.messages.filter((m) => m.direction === 'Received');
      if (!received.length) continue;
      t.messages.sort((a, b) => a.date - b.date);
      received.sort((a, b) => a.date - b.date);
      const lead = leads.get(id) || {};
      const from = parseFrom(received[0].from);
      const last = t.messages[t.messages.length - 1];
      threads.push({
        id,
        mailbox: lead.mailbox || t.mailbox,
        lead: {
          business: lead.business || '',
          contact: lead.contact || from.name || '',
          email: lead.email || from.email,
          title: lead.title || ''
        },
        status: lead.status || '',
        subject: t.messages[0].subject.replace(/^\s*((re|fwd?|aw)\s*:\s*)+/i, ''),
        messages: t.messages,
        lastDate: last.date,
        lastReceived: received[received.length - 1].date,
        lastFromMe: last.direction === 'Sent',
        snippet: last.body.replace(/\s+/g, ' ').trim().slice(0, 160)
      });
    }
    threads.sort((a, b) => b.lastDate - a.lastDate);
    return threads;
  }

  /* ---------- Read / unread (per device) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('emd.unibox.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('emd.unibox.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  };
  let seen = store.get('seen', {});
  let baseline = Number(store.get('baseline', 0));

  // The first time real data loads, everything already there counts as read.
  function ensureBaseline() {
    if (!baseline) { baseline = Date.now(); store.set('baseline', baseline); }
  }
  const isUnread = (t) => +t.lastReceived > Math.max(seen[t.id] || 0, baseline);
  function markRead(t) {
    if (!isUnread(t)) return;
    seen[t.id] = +t.lastReceived;
    store.set('seen', seen);
  }
  function markAllRead(threads) {
    threads.forEach((t) => { seen[t.id] = Math.max(seen[t.id] || 0, +t.lastReceived); });
    store.set('seen', seen);
  }

  function filterThreads(threads, { filter = 'all', mailbox = '', q = '' } = {}) {
    const query = q.trim().toLowerCase();
    return threads.filter((t) => {
      if (mailbox && t.mailbox.toLowerCase() !== mailbox.toLowerCase()) return false;
      if (filter === 'unread' && !isUnread(t)) return false;
      if ((filter === 'interested' || filter === 'uninterested' || filter === 'other') && statusMeta(t.status).cat !== filter) return false;
      if (query) {
        const hay = [t.lead.contact, t.lead.business, t.lead.email, t.subject, t.mailbox, t.snippet].join(' ').toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }

  function counts(threads, mailbox) {
    const c = { all: 0, interested: 0, uninterested: 0, other: 0, unread: 0 };
    for (const t of threads) {
      if (mailbox && t.mailbox.toLowerCase() !== mailbox.toLowerCase()) continue;
      c.all++;
      c[statusMeta(t.status).cat]++;
      if (isUnread(t)) c.unread++;
    }
    return c;
  }

  const mailboxes = (threads) => [...new Set(threads.map((t) => t.mailbox).filter(Boolean))].sort();

  /** Received messages present now that were not in `knownIds` (for "new reply" toasts). */
  function newReplies(threads, knownIds) {
    const out = [];
    for (const t of threads) for (const m of t.messages) if (m.direction === 'Received' && !knownIds.has(m.id)) out.push({ thread: t, message: m });
    return out;
  }
  const receivedIds = (threads) => new Set(threads.flatMap((t) => t.messages.filter((m) => m.direction === 'Received').map((m) => m.id)));

  /* ---------- Network ---------- */
  async function fetchMessages(cfg) {
    const range = `'${MSG_TAB}'!A:J`;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(cfg.sheetId)}/values/${encodeURIComponent(range)}?key=${encodeURIComponent(cfg.apiKey)}`;
    const res = await fetch(url, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (res.status === 400 && /parse range/i.test((body.error && body.error.message) || '')) return null; // tab not created yet
    if (!res.ok) throw new Error((body.error && body.error.message) || `HTTP ${res.status}`);
    return body.values || [];
  }

  /* ---------- Connection to the Outreach Hub (apps-script/OutreachHub.gs) ----------
   * The app/dashboard link from the Hub carries the connection: ...#c=<token>. It is saved on the device
   * the first time, so the installed app keeps working without any setup screen. */
  const CONN_KEY = 'emd.connection';

  function connection() {
    const m = location.hash.match(/[#&]c=([^&]+)/);
    if (m) {
      try {
        const json = JSON.parse(atob(decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/')));
        if (json && json.u && json.k) localStorage.setItem(CONN_KEY, JSON.stringify(json));
      } catch { /* malformed link: ignore */ }
      const rest = location.hash.replace(/^#/, '').split('&').filter((p) => p && !p.startsWith('c=')).join('&');
      history.replaceState(null, '', location.pathname + location.search + (rest ? '#' + rest : ''));
    }
    try {
      const c = JSON.parse(localStorage.getItem(CONN_KEY) || 'null');
      return c && c.u && c.k ? c : null;
    } catch { return null; }
  }

  async function hubData(conn) {
    let res;
    try { res = await fetch(`${conn.u}?action=data&key=${encodeURIComponent(conn.k)}`, { cache: 'no-store' }); }
    catch { const e = new Error('offline'); e.offline = true; throw e; }
    const data = await res.json().catch(() => ({ ok: false, error: `Your data service did not answer (HTTP ${res.status}).` }));
    if (!data.ok) throw new Error(data.error === 'Access denied' ? 'This link is no longer valid. Get a new one from your sheet: Outreach → Show links.' : data.error || 'Could not load your data.');
    return data;
  }

  async function hubCall(conn, payload) {
    if (!conn) throw new Error('Open the link from your sheet (Outreach → Show links) to change labels.');
    let res;
    // No custom headers: a plain-text POST avoids a CORS preflight, which Apps Script can't answer.
    try { res = await fetch(conn.u, { method: 'POST', body: JSON.stringify(Object.assign({ key: conn.k }, payload)) }); }
    catch { throw new Error('No connection. Please try again.'); }
    const data = await res.json().catch(() => ({ ok: false, error: 'The data service did not answer. Please try again.' }));
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  const setStatus = (conn, threadId, status) => hubCall(conn, { action: 'setStatus', threadId, status }).then((d) => d.status);
  const alertsUrl = (conn) => (conn && conn.t ? 'https://ntfy.sh/' + encodeURIComponent(conn.t) : '');
  // Deep links from notifications: #thread=<id>
  const threadFromHash = () => { const m = location.hash.match(/[#&]thread=([^&]+)/); return m ? decodeURIComponent(m[1]) : null; };

  /* ---------- Formatting ---------- */
  function timeAgo(d) {
    const diff = (Date.now() - d) / 1000;
    if (diff < 60) return 'now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    if (diff < 7 * 86400) return Math.floor(diff / 86400) + 'd';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  const fmtFull = (d) => d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function initials(name) {
    const parts = String(name || '?').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  const AVATARS = ['#3D6FE0', '#6C63FF', '#1FB6C9', '#2A52B8', '#4E45D6', '#128FA0'];
  function avatarColor(key) {
    let h = 0;
    for (const ch of String(key || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return AVATARS[h % AVATARS.length];
  }
  const displayName = (t) => t.lead.contact || t.lead.business || t.lead.email || 'Unknown lead';

  /* ---------- Sample inbox (preview before the scripts are installed) ---------- */
  function sampleData() {
    const now = Date.now();
    const ago = (min) => new Date(now - min * 60000).toISOString();
    const people = [
      ['Northwind Logistics', 'Sarah Chen', 'sarah@northwind.example', 'Head of Talent', 'Interested', 'alex@oriontalent.example', 18,
        ['Hi Sarah,\n\nNoticed Northwind is hiring 4 warehouse supervisors. We place pre-vetted ops leaders in under 3 weeks. Worth a quick chat?\n\nAlex',
          'Hi Alex,\n\nTiming is good, we have been struggling to fill these. Can you do Thursday at 2pm?\n\nThanks,\nSarah']],
      ['Bluepeak Health', 'Marcus Reid', 'marcus@bluepeak.example', 'COO', 'Interested', 'jordan@orionslink.example', 95,
        ['Hi Marcus,\n\nSaw the 3 nursing manager roles on your careers page. We have two candidates who match closely. Open to seeing profiles?\n\nJordan',
          'Yes please send them over. What are your fees?',
          'Hi Marcus,\n\nSending both profiles now. Our fee is 18% of first-year salary, with a 90-day guarantee.\n\nJordan',
          'Got them, the second one looks great. Let\'s set up an interview next week.\n\nBest,\nMarcus']],
      ['Cobalt Robotics', 'Priya Nair', 'priya@cobalt.example', 'VP Engineering', 'Uninterested', 'alex@oriontalent.example', 240,
        ['Hi Priya,\n\nCobalt is hiring senior firmware engineers. We have a strong bench in embedded systems. Interested?\n\nAlex',
          'Thanks Alex, but we only work with our in-house recruiting team. Please remove me from your list.']],
      ['Greenline Foods', 'Tom Alvarez', 'tom@greenline.example', 'HR Director', 'Out of office', 'sam@orionsplug.example', 600,
        ['Hi Tom,\n\nQuick note about your open plant manager role. We can share 3 vetted candidates this week.\n\nSam',
          'I am out of the office until November 3 with limited access to email. For urgent matters contact hr@greenline.example.']],
      ['Atlas Fintech', 'Jenna Brooks', 'jenna@atlasfin.example', 'Talent Partner', 'Interested', 'sam@orionsplug.example', 1500,
        ['Hi Jenna,\n\nAtlas has 6 open engineering roles. We specialise in fintech backend hiring. Worth 15 minutes?\n\nSam',
          'Hi Sam, possibly. Can you share a couple of example placements in payments?\n\nCheers,\nJenna']],
      ['Harbor Analytics', 'Leo Park', 'leo@harbor.example', 'CTO', 'Wrong Person', 'jordan@orionslink.example', 2900,
        ['Hi Leo,\n\nHarbor is growing the data team. We can help you hire faster.\n\nJordan',
          'I am not the right person for this, please reach out to our recruiting lead, Dana.']],
      ['Summit Retail', 'Amy Ford', 'amy@summit.example', 'Recruiter', 'Sent2', 'casey@orionsmatch.example', 3300,
        ['Hi Amy,\n\nWe noticed 12 store manager openings at Summit. Happy to help.\n\nCasey',
          'What locations do your candidates cover?']],
      ['Vertex Media', 'Chris Lowe', 'chris@vertex.example', 'Head of People', 'Automatic reply', 'casey@orionsmatch.example', 5200,
        ['Hi Chris,\n\nVertex is hiring video producers. We have a great pool ready.\n\nCasey',
          'Thank you for your email. This inbox is not monitored. Please use our careers portal.']]
    ];
    const crm = [];
    const msgs = [];
    people.forEach(([business, contact, email, title, status, mailbox, minutesAgo, bodies], i) => {
      const threadId = 'sample' + i;
      const row = new Array(21).fill('');
      row[CRM.business] = business; row[CRM.contact] = contact; row[CRM.email] = email; row[CRM.title] = title;
      row[CRM.status] = status; row[CRM.threadId] = threadId; row[CRM.sender] = mailbox; row[17] = ago(minutesAgo + 2000);
      crm.push(row);
      bodies.forEach((body, j) => {
        const fromMe = j % 2 === 0;
        const at = minutesAgo + (bodies.length - 1 - j) * (j === 0 ? 1440 : 45);
        msgs.push([threadId + '-' + j, threadId, mailbox, fromMe ? 'Sent' : 'Received',
          fromMe ? mailbox : `${contact} <${email}>`, fromMe ? email : mailbox, ago(at),
          (j ? 'Re: ' : '') + 'Hiring at ' + business, body]);
      });
    });
    return { crm, msgs };
  }

  window.UniboxCore = {
    MSG_TAB, STATUS_OPTIONS, FILTERS, statusMeta, parseFrom, leadIndex, buildThreads,
    ensureBaseline, isUnread, markRead, markAllRead, filterThreads, counts, mailboxes, newReplies, receivedIds,
    fetchMessages, connection, hubData, setStatus, alertsUrl, threadFromHash, timeAgo, fmtFull, esc, initials, avatarColor, displayName, sampleData
  };
})();
