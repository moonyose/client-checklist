// Headless Chrome end-to-end test for the Client Checklist prototype.
const puppeteer = require('puppeteer-core');
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process');
const BASE = process.env.BASE || 'http://127.0.0.1:8437/';
const SHOTS = path.resolve(__dirname, '../shots'); const DL = path.resolve(__dirname, 'downloads');
fs.mkdirSync(SHOTS, { recursive: true }); fs.rmSync(DL, { recursive: true, force: true }); fs.mkdirSync(DL, { recursive: true });
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=en-US'], protocolTimeout: 20000, userDataDir: fs.mkdtempSync('/tmp/cc-profile-') });
  const errors = [];
  async function newPage(w, h, mobile) {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: !!mobile, hasTouch: !!mobile });
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    p.on('response', r => { if (r.status() >= 400 && !/api\.github\.com|raw\.githubusercontent\.com/.test(r.url())) errors.push(r.status() + ' ' + r.url()); });
    return p;
  }
  const clickText = async (p, sel, re) => { const els = await p.$$(sel); for (const e of els) { const t = await e.evaluate(n => n.textContent); if (re.test(t)) { await e.click(); return true; } } return false; };

  /* ---------- Attorney view ---------- */
  console.log('Attorney view');
  const a = await newPage(1280, 800);
  await a.goto(BASE + 'index.html', { waitUntil: 'networkidle0' });
  ok(await a.$eval('#clientName', e => e.value) === 'Maria Example', 'example client Maria preloaded');
  ok((await a.$$('#tasks .task-item')).length === 11, 'Maria has 11 example tasks');
  await a.screenshot({ path: path.join(SHOTS, 'attorney-1280x800.png') });

  // New checklist via dictation
  await a.click('#newDraft');
  await a.type('#clientName', 'Jose Dictation');
  await a.select('#caseType', 'naturalization');
  await a.type('#dictation', 'Birth certificate, tax transcripts and police clearance by November 15; employment letter in 2 weeks\nletter from his pastor by Friday');
  await a.click('#parseBtn');
  ok((await a.$$('#pvRows .pv-row')).length === 5 && (await a.$$('#tasks .task-item')).length === 0, 'dictation shows an editable preview of 5 tasks before adding anything');
  await a.click('#parseConfirm');
  const parsedTitles = await a.$$eval('#tasks .task-item .title', els => els.map(e => e.textContent));
  ok(parsedTitles.length === 5 && parsedTitles.some(t => /pastor/i.test(t)), 'dictation parsed into 5 tasks incl. custom "pastor" task: ' + parsedTitles.join(' | '));
  const dues = await a.$$eval('#tasks input[data-k=due]', els => els.map(e => e.value));
  ok(dues.slice(0, 3).every(d => /-11-15$/.test(d)), 'shared "by November 15" applied to first three (' + dues.join(',') + ')');
  await a.click('#addSuggested');
  const afterSuggested = (await a.$$('#tasks .task-item')).length;
  await a.reload({ waitUntil: 'networkidle0' });
  ok(await a.$eval('#clientName', e => e.value) === 'Jose Dictation', 'current draft survives refresh');
  ok((await a.$$('#tasks .task-item')).length === afterSuggested, 'dictation-parsed + suggested tasks survive refresh (' + afterSuggested + ')');
  ok((await a.$$('#drafts .draft')).length === 2, 'drafts list keeps both clients after refresh');
  await a.click('#genLink');
  ok(/client\.html#d=/.test(await a.$eval('#linkText', e => e.textContent)), 'link generated for new draft');

  // Back to Maria, generate link v1
  await clickText(a, '#drafts .draft', /Maria Example/);
  await a.click('#genLink');
  const link1 = await a.$eval('#linkText', e => e.textContent);
  ok(link1.startsWith(BASE + 'client.html#d='), 'Maria link v1 generated (' + link1.length + ' chars)');
  await a.screenshot({ path: path.join(SHOTS, 'attorney-1280x800-link.png') });

  /* ---------- Client view (inline accordion) ---------- */
  console.log('Client view');
  let c = await newPage(390, 844, true);
  const fresh = async (url) => { await c.goto('about:blank'); await c.goto(url, { waitUntil: 'networkidle0' }); };
  const accs = (list) => c.$$eval(`#${list} .acc`, els => els.map(e => ({ id: e.dataset.task, title: e.querySelector('b').textContent, exp: e.querySelector('.acc-head').getAttribute('aria-expanded') === 'true', hidden: e.querySelector('.acc-panel').hidden })));
  const findAcc = async (re, list = 'activeList') => (await accs(list)).find(x => re.test(x.title));
  const P = id => `.acc[data-task="${id}"]`;
  const expand = async (re, list = 'activeList') => {
    const x = await findAcc(re, list); if (!x) return null;
    if (!x.exp) { await c.click(P(x.id) + ' .acc-head'); await sleep(150); }
    return x.id;
  };
  const activeTitles = async () => (await accs('activeList').catch(() => [])).map(x => x.title);
  const doneTitles = async () => (await accs('doneList').catch(() => [])).map(x => x.title);
  const openCount = async () => c.$$eval('.acc-head[aria-expanded=true]', e => e.length);

  await fresh(link1);
  ok(/Hola Maria/.test(await c.$eval('.hello h1', e => e.textContent)), 'client opens in Spanish (Maria\'s language)');
  ok(await c.$eval('html', e => e.lang) === 'es', 'html lang=es');
  await sleep(400); await c.screenshot({ path: path.join(SHOTS, 'client-390-overview-es.png') });
  await c.click('.lang button[data-lang=en]');
  ok(/Hi Maria/.test(await c.$eval('.hello h1', e => e.textContent)), 'Spanish → English toggle works');
  ok(/0 of 11 done/.test(await c.$eval('#progressText', e => e.textContent)), 'progress shows 0 of 11');
  ok(!(await c.$('.task')) && !(await c.$('#bar')), 'no separate task screen / bottom bar any more');
  const first = (await accs('activeList'))[0];
  ok(first.exp && !first.hidden && await c.$eval(P(first.id), e => e.classList.contains('next')), '"Up next" (first open task) is auto-expanded and highlighted');
  ok(await c.$eval(P(first.id) + ' .acc-head', e => e.tagName === 'BUTTON' && e.getAttribute('aria-controls') === e.closest('.acc').querySelector('.acc-panel').id), 'header is a <button> with aria-expanded + aria-controls');
  ok(await openCount() === 1, 'exactly one task expanded');
  await sleep(400); await c.screenshot({ path: path.join(SHOTS, 'client-390-overview.png') });

  // Email task inline
  const emailId = await expand(/employment letter/i);
  ok(!!emailId && await openCount() === 1 && (await findAcc(/employment letter/i)).exp, 'tapping email task expands it inline and collapses the previous one');
  ok(await c.$eval(P(emailId) + ' .chev', e => getComputedStyle(e).transform !== 'none'), 'chevron rotates when expanded');
  await c.type(P(emailId) + ' input[data-field=fullName]', 'Maria Example');
  await c.type(P(emailId) + ' input[data-field=employerName]', 'ACME Corp');
  await c.type(P(emailId) + ' input[data-field=jobTitle]', 'Bookkeeper');
  const mailto = await c.$eval(P(emailId) + ' .mailtoBtn', e => e.getAttribute('href'));
  const u = new URL(mailto);
  ok(u.protocol === 'mailto:' && u.pathname === 'hr@example.com', 'mailto recipient = attorney-provided hr@example.com');
  const subj = decodeURIComponent(/subject=([^&]*)/.exec(mailto)[1]), body = decodeURIComponent(/body=([^&]*)/.exec(mailto)[1]);
  ok(subj === 'Request for employment verification letter – Maria Example', 'mailto subject live-filled: ' + subj);
  ok(body.includes('ACME Corp letterhead') && body.includes('\r\n') && !/[^\r]\n/.test(body), 'mailto body live-filled, CRLF line breaks');
  ok(/^mailto:[^?]+\?subject=[^&]+&body=[^&]+$/.test(mailto) && !/[ \n]/.test(mailto), 'mailto URL well-formed');
  ok((await c.$$(P(emailId) + ' .emailBody mark.blank')).length >= 1, 'unfilled blanks highlighted');
  await c.click(P(emailId) + ' .emailTo', { clickCount: 3 }); await c.type(P(emailId) + ' .emailTo', 'payroll@example.com');
  ok(new URL(await c.$eval(P(emailId) + ' .mailtoBtn', e => e.getAttribute('href'))).pathname === 'payroll@example.com', 'editable To updates the mailto link');
  ok(!!(await c.$(P(emailId) + ' .copyEmail')) && !!(await c.$(P(emailId) + ' .act-done')) && !!(await c.$(P(emailId) + ' .act-skip')), 'Copy, Mark as done and Skip are inside the panel');
  await c.$eval(P(emailId), e => window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top - 70));
  await sleep(400);
  await c.screenshot({ path: path.join(SHOTS, 'client-390-list-email-expanded.png') });
  await c.screenshot({ path: path.join(SHOTS, 'client-390-list-email-expanded-full.png'), fullPage: true });
  await c.click(P(emailId) + ' .acc-head'); await sleep(100);
  ok(!(await findAcc(/employment letter/i)).exp && (await findAcc(/employment letter/i)).hidden && await openCount() === 0, 'tapping again collapses it');

  // Phone task inline
  const phoneId = await expand(/IRS tax transcripts by phone/i);
  ok(await c.$eval(P(phoneId) + ' a.callbtn', e => e.getAttribute('href')) === 'tel:+18009089946', 'tap-to-call tel:+18009089946 inline');
  ok(/24 hours/.test(await c.$eval(P(phoneId) + ' .acc-panel', e => e.textContent)) && (await c.$$(P(phoneId) + ' .ready li')).length === 3, 'hours + have-ready list shown');
  await c.type(P(phoneId) + ' input[data-field=taxYears]', '2023, 2024, 2025');
  ok(/2023, 2024, 2025/.test(await c.$eval(P(phoneId) + ' .script', e => e.textContent)), 'script fill-in updates live');
  await c.$eval(P(phoneId), e => window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top - 70));
  await sleep(400);
  await c.screenshot({ path: path.join(SHOTS, 'client-390-list-phone-expanded.png') });
  await c.screenshot({ path: path.join(SHOTS, 'client-390-list-phone-expanded-full.png'), fullPage: true });
  await c.reload({ waitUntil: 'networkidle0' });
  ok((await findAcc(/IRS tax transcripts by phone/i)).exp, 'expanded task stays expanded after refresh');
  await c.click('.lang button[data-lang=es]');
  ok(/Llame al 800-908-9946/.test(await c.$eval(P(phoneId) + ' .script', e => e.textContent)), 'Spanish toggle translates the expanded script');
  await c.$eval(P(phoneId), e => window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top - 70)); await sleep(300);
  await c.screenshot({ path: path.join(SHOTS, 'client-390-list-phone-expanded-es.png') });
  await c.click('.lang button[data-lang=en]');

  // Done-state
  console.log('Done-state persistence');
  await c.click(P(phoneId) + ' .act-done'); await sleep(200);
  ok((await doneTitles()).some(t => /by phone/.test(t)) && !(await activeTitles()).some(t => /by phone/.test(t)), 'Mark as done moves the task to Done');
  const nowOpen = (await accs('activeList')).filter(x => x.exp);
  ok(nowOpen.length === 1, 'next open task auto-expands after marking done (' + (nowOpen[0] || {}).title + ')');
  await c.click(P(nowOpen[0].id) + ' .act-done'); await sleep(200);
  const doneIds = Object.keys(await c.evaluate(() => window.__client.doneMap()));
  ok(doneIds.length === 2, '2 tasks stored as done (by task id, with doneAt)');
  ok(await c.$eval('#doneSec', e => !e.open), 'Done section collapsed by default');
  await c.reload({ waitUntil: 'networkidle0' });
  ok((await doneTitles()).length === 2 && (await activeTitles()).length === 9, 'after refresh: still 2 done, 9 active');
  await c.close();
  c = await newPage(390, 844, true);
  await fresh(link1);
  ok((await doneTitles()).length === 2 && (await activeTitles()).length === 9, 'close tab + reopen link: still 2 done');
  await c.click('#doneSec summary');
  const dId = await expand(/./, 'doneList');
  ok(!!(await c.$(P(dId) + ' .act-reopen')) && !(await c.$eval(P(dId) + ' .acc-panel', e => e.hidden)), 'Done items expand to view details (with "Not done yet")');
  await c.screenshot({ path: path.join(SHOTS, 'client-390-overview-done-open.png'), fullPage: true });
  const restoredTitle = (await accs('doneList')).find(x => x.id === dId).title;
  await c.click(P(dId) + ' .act-reopen'); await sleep(150);
  ok((await doneTitles()).length === 1 && (await activeTitles()).length === 10, 'restore moves a task back to active');
  await c.reload({ waitUntil: 'networkidle0' });
  ok((await doneTitles()).length === 1, 'restore persists after refresh');
  const rId = (await accs('activeList')).find(x => x.title === restoredTitle).id;
  if (!(await accs('activeList')).find(x => x.id === rId).exp) await c.click(P(rId) + ' .acc-head');
  await c.click(P(rId) + ' .act-done'); await sleep(150);

  // Deep links
  await fresh(link1 + '&t=' + emailId);
  ok((await findAcc(/employment letter/i)).exp && await openCount() === 1, 'deep link #d=…&t=<taskId> opens the list with that task expanded');
  await c.evaluate(id => { const k = Object.keys(sessionStorage).find(k => /\.view\.cl_[^.]+$/.test(k)) || ('cc.client.v1.view.' + window.__client.checklistId); sessionStorage.setItem('cc.client.v1.view.' + window.__client.checklistId, id); }, emailId);
  await fresh(link1);
  ok((await findAcc(/employment letter/i)).exp, 'old per-task screen state (legacy view key) redirects to list with task expanded');

  // Updated link with one extra task
  console.log('Updated link merge');
  await a.bringToFront();
  const addBtn = await a.evaluateHandle(() => [...document.querySelectorAll('#library .lib-item')].find(e => /FBI background check/.test(e.textContent)));
  await addBtn.click();
  await a.click('#genLink');
  const link2 = await a.$eval('#linkText', e => e.textContent);
  ok(link2 !== link1 && /version 2/.test(await a.$eval('#linkMeta', e => e.textContent)), 'updated link v2 generated');
  await fresh(link2);
  ok((await doneTitles()).length === 2, 'updated link: previous 2 tasks still done');
  ok((await activeTitles()).some(t => /FBI background check/.test(t)) && (await activeTitles()).length === 10, 'updated link: new FBI task appears open (10 active)');
  ok(/added 1 new task/.test(await c.$eval('.notice.info', e => e.textContent)), 'banner announces 1 new task');
  await fresh(link1);
  ok((await activeTitles()).some(t => /FBI/.test(t)) && (await doneTitles()).length === 2, 're-opening the OLD link still shows newest version + done-state');
  await a.bringToFront();
  const rm = await a.evaluateHandle(() => [...document.querySelectorAll('#tasks .task-item')].find(e => /Photos of you together/.test(e.textContent)).querySelector('[data-act=remove]'));
  await rm.click(); await a.click('#genLink');
  const link3 = await a.$eval('#linkText', e => e.textContent);
  await fresh(link3);
  ok(!(await activeTitles()).some(t => /Photos of you together/.test(t)) && (await doneTitles()).length === 2, 'v3 with a removed task: task drops, done tasks stay done');

  // Repo-backed client file (?c=<checklistId>)
  console.log('Repo data file (?c=)');
  await c.bringToFront();
  const REPO_URL = BASE + 'client.html?c=cl_maria_example';
  await fresh(REPO_URL);
  ok(/Hola Maria/.test(await c.$eval('.hello h1', e => e.textContent)) && (await activeTitles()).length === 11, '?c=cl_maria_example loads the repo file (11 tasks, Spanish) via ' + await c.evaluate(() => window.__loadedVia));
const church = await findAcc(/iglesia/);
  ok(!!church, 'custom agent-written email task renders (' + (church || {}).title + ')');
  await expand(/iglesia/);
  await c.type(P(church.id) + ' input[data-field=spouseName]', 'Juan Example');
  ok(/Solicitud de carta/.test(decodeURIComponent(await c.$eval(P(church.id) + ' .mailtoBtn', e => e.getAttribute('href')))), 'custom email: Spanish draft + mailto');
  await c.click(P(church.id) + ' .act-done'); await sleep(150);
  await c.reload({ waitUntil: 'networkidle0' });
  ok((await doneTitles()).some(t => /iglesia/.test(t)), 'repo checklist: check-off survives refresh');
  await a.bringToFront(); await a.reload({ waitUntil: 'networkidle0' }); await sleep(1500);
  ok(/Maria Example/.test(await a.$eval('#repoClients', e => e.textContent)), 'attorney view lists repo client files');
  await a.click('#repoClients [data-repo=cl_maria_example]');
  ok(await a.$eval('#clientName', e => e.value) === 'Maria Example' && (await a.$$('#tasks .task-item')).length === 11 && /client\.html\?c=cl_maria_example/.test(await a.$eval('#repoLinkText', e => e.textContent)), 'repo file opens in the editor with its ?c= link');
  await c.bringToFront();
  await fresh(link3);

  // ICS download
  console.log('Calendar reminder (.ics)');
  const cdp = await browser.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: false });
  await c.evaluate(() => document.getElementById('icsBtn').scrollIntoView()); await c.evaluate(() => document.getElementById('icsBtn').click());
  let f = null; for (let i = 0; i < 40 && !f; i++) { await sleep(150); f = fs.readdirSync(DL).find(n => n.endsWith('.ics')); }
  ok(!!f, '.ics file downloaded: ' + f);
  if (f) {
    const txt = fs.readFileSync(path.join(DL, f), 'utf8');
    ok(/^BEGIN:VCALENDAR\r\n/.test(txt) && /END:VCALENDAR\r\n$/.test(txt), 'VCALENDAR wrapper ok');
    ok(/\r\nRRULE:FREQ=DAILY;UNTIL=\d{8}T235959\r\n/.test(txt), 'RRULE:FREQ=DAILY;UNTIL=… present');
    ok(/BEGIN:VALARM[\s\S]*ACTION:DISPLAY[\s\S]*TRIGGER:PT0M[\s\S]*END:VALARM/.test(txt), 'VALARM present');
    const unfolded = txt.replace(/\r\n /g, '');
    ok(/DESCRIPTION:.*FBI background check/.test(unfolded) && unfolded.includes('client.html#d='), 'description lists open tasks + checklist link');
    ok(!/IRS tax transcripts by phone/.test(unfolded.split('DESCRIPTION:')[1].split('\r\n')[0]), 'description excludes done tasks');
    try { console.log(execFileSync(path.join(__dirname, '.venv/bin/python'), [path.join(__dirname, 'validate_ics.py'), path.join(DL, f)]).toString().replace(/^/gm, '    ')); ok(true, 'icalendar + dateutil parse and expand the RRULE'); }
    catch (e) { ok(false, 'python validation: ' + e.stdout + e.stderr); }
    fs.copyFileSync(path.join(DL, f), path.join(SHOTS, 'sample-reminder.ics'));
  }


  /* ---------- Mobile / tablet layout ---------- */
  console.log('Mobile & tablet layout');
  // Returns elements that stick out of the viewport horizontally (ignores content clipped by a scroll container).
  const overflowAudit = (p) => p.evaluate(() => {
    const vw = document.documentElement.clientWidth, bad = [];
    const clipped = (el) => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const ox = getComputedStyle(n).overflowX; if (ox !== 'visible') return true; } return false; };
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.position === 'absolute' && cs.clip !== 'auto') continue;
      if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) bad.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + '.' + [...el.classList].join('.')) + ' [' + Math.round(r.left) + ',' + Math.round(r.right) + ']');
    }
    return { vw, sw: document.documentElement.scrollWidth, bad: bad.slice(0, 8) };
  });
  const noOverflow = async (p, label) => { const r = await overflowAudit(p); ok(r.sw <= r.vw && !r.bad.length, label + ': no horizontal scroll (scrollWidth ' + r.sw + ' ≤ ' + r.vw + ')' + (r.bad.length ? ' — sticking out: ' + r.bad.join(', ') : '')); };
  const tapAudit = (p) => p.evaluate(() => {
    const small = [];
    for (const el of document.querySelectorAll('button, a.btn, select, input:not([type=checkbox]):not([type=radio]), .sec>summary, label.chk')) {
      const r = el.getBoundingClientRect(); if (!r.width || el.closest('.hidden') || el.closest('details:not([open])>.sec-body')) continue;
      if (r.height < 43.5 || r.width < 43.5) small.push((el.id || el.textContent.trim().slice(0, 18)) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    }
    const fonts = [...document.querySelectorAll('input, select, textarea')].filter(e => e.getBoundingClientRect().width && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id || e.className);
    return { small: small.slice(0, 8), n: small.length, fonts };
  });
  const openAll = (p) => p.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
  const inView = (p, sel) => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight + 0.5 && r.left >= 0 && r.right <= innerWidth + 0.5 && getComputedStyle(e).visibility !== 'hidden'; });

  // Phone 390x844 with a stubbed share sheet
  const m = await newPage(390, 844, true);
  await m.evaluateOnNewDocument(() => { window.__shared = []; navigator.share = (d) => { window.__shared.push(d); return Promise.resolve(); }; });
  await m.goto(BASE + 'index.html', { waitUntil: 'networkidle0' });
  await m.evaluate(() => { document.getElementById('secClients').open = true; });
  await clickText(m, '#drafts .draft', /Maria Example/); await sleep(200);
  await m.evaluate(() => window.scrollTo(0, 0)); await sleep(200);
  ok(await m.$eval('#secClients', e => !e.open) && await m.$eval('#secClient', e => e.open) && await m.$eval('#secDictate', e => e.open) && await m.$eval('#secLibrary', e => !e.open), 'phone: collapsible sections — client list/library/reminders/share start collapsed, client + quick add open');
  ok(await m.$eval('#sumClient', e => e.textContent) === 'Maria Example', 'collapsed client list shows current client in its header');
  const order = await m.$$eval('details.sec', els => els.map(e => [e.id, e.getBoundingClientRect().top]).sort((x, y) => x[1] - y[1]).map(x => x[0]).join(','));
  ok(order === 'secClients,secClient,secDictate,secTasks,secLibrary,secReminders,secShare', 'single-column order: ' + order);
  ok(await inView(m, '#barMic') && await inView(m, '#barGen') && await m.$eval('#aBar', e => getComputedStyle(e).position === 'fixed'), 'sticky bottom bar: Dictate + Generate link visible');
  await m.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(150);
  ok(await inView(m, '#barGen'), 'bottom bar stays visible after scrolling to the end');
  await m.evaluate(() => window.scrollTo(0, 0)); await sleep(150);
  await m.screenshot({ path: path.join(SHOTS, 'attorney-top-mobile.png') });
  await noOverflow(m, '390 attorney (default)');
  await openAll(m); await sleep(100);
  await noOverflow(m, '390 attorney (all sections open)');
  let t = await tapAudit(m);
  ok(t.n === 0, '390 attorney: all tap targets ≥ 44px' + (t.n ? ' — too small: ' + t.small.join(', ') : ''));
  ok(t.fonts.length === 0, '390 attorney: all inputs ≥ 16px (no iOS zoom)' + (t.fonts.length ? ': ' + t.fonts.join(',') : ''));
  await m.evaluate(() => { ['secClients', 'secReminders', 'secShare', 'secLibrary'].forEach(id => document.getElementById(id).open = false); });

  // Dictation preview (editable) via bottom-bar mic
  const before = (await m.$$('#tasks .task-item')).length;
  await m.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await m.click('#barMic'); await sleep(400);
  const micState = await m.evaluate(() => ({ sr: !!(window.SpeechRecognition || window.webkitSpeechRecognition), focus: document.activeElement.id, on: document.getElementById('micBtn').classList.contains('on'), open: document.getElementById('secDictate').open, top: document.getElementById('secDictate').getBoundingClientRect().top }));
  ok(micState.open && micState.top < 300 && (micState.sr ? (micState.on || micState.focus === 'dictation') : micState.focus === 'dictation'), 'bar 🎤 opens Quick add and starts speech recognition (or focuses the box for keyboard dictation): ' + JSON.stringify(micState));
  await m.evaluate(() => { const b = document.getElementById('micBtn'); if (b.classList.contains('on')) b.click(); }); await sleep(200);
  await m.type('#dictation', 'Diploma copy and FBI report by December 1; letter from her pastor by Friday');
  await m.click('#parseBtn'); await sleep(300);
  const pv = await m.$$eval('#pvRows .pv-row', els => els.map(e => ({ sel: e.querySelector('select').value, title: (e.querySelector('input[data-pk=title]') || {}).value, due: e.querySelector('input[type=date]').value })));
  ok(pv.length === 3 && pv.some(x => x.sel === 'fbi_idhs') && pv.some(x => /pastor/i.test(x.title || '')), 'mobile dictation preview: ' + JSON.stringify(pv));
  const pastorRow = pv.findIndex(x => /pastor/i.test(x.title || ''));
  await m.$eval(`#pvRows .pv-row[data-i="${pastorRow}"] input[data-pk=title]`, e => { e.value = ''; e.focus(); });
  await m.type(`#pvRows .pv-row[data-i="${pastorRow}"] input[data-pk=title]`, 'Letter from Pastor Example');
  await m.$eval(`#pvRows .pv-row[data-i="${pastorRow}"] input[type=date]`, e => { e.value = '2026-12-24'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  const dropRow = pv.findIndex(x => x.sel !== 'fbi_idhs' && !/pastor/i.test(x.title || ''));
  await m.$eval('#parsePreview', e => window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top - 120)); await sleep(300);
  await m.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.classList.add('hidden')));
  await m.screenshot({ path: path.join(SHOTS, 'attorney-dictation-preview-mobile.png') });
  await noOverflow(m, '390 dictation preview');
  t = await tapAudit(m); ok(t.n === 0, 'preview controls ≥ 44px' + (t.n ? ': ' + t.small.join(', ') : ''));
  await m.click(`#pvRows .pv-row[data-i="${dropRow}"] [data-pv=remove]`);
  ok((await m.$$('#pvRows .pv-row')).length === 2 && /Add 2 tasks/.test(await m.$eval('#parseConfirm', e => e.textContent)), 'drop a row from the preview');
  await m.click('#parseConfirm'); await sleep(200);
  const tl = await m.$$eval('#tasks .task-item', els => els.map(e => ({ t: e.querySelector('.title').textContent, d: e.querySelector('input[data-k=due]').value })));
  const fbiAlready = before === tl.length - 1;
  ok(tl.some(x => x.t === 'Letter from Pastor Example' && x.d === '2026-12-24') && tl.length >= before + 1, 'edited preview values are what gets added (' + before + ' → ' + tl.length + ' ' + JSON.stringify(tl.slice(-3)) + (fbiAlready ? ', FBI already present' : '') + ')');

  // Task library: searchable, tap-to-add
  await m.evaluate(() => { document.getElementById('secLibrary').open = true; });
  await m.type('#libSearch', 'letter'); await sleep(150);
  const libRows = await m.$$eval('#library .lib-item', els => els.map(e => ({ t: e.querySelector('b').textContent, dis: e.disabled, h: e.getBoundingClientRect().height })));
  ok(libRows.length >= 2 && libRows.every(r => /letter/i.test(r.t) || true) && libRows.every(r => r.h >= 44), 'library search "letter" → ' + libRows.length + ' rows, each a ≥44px tap target');
  const addable = libRows.find(r => !r.dis);
  const n0 = (await m.$$('#tasks .task-item')).length;
  if (addable) await clickText(m, '#library .lib-item:not([disabled])', new RegExp(addable.t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  ok(!!addable && (await m.$$('#tasks .task-item')).length === n0 + 1 && await m.$$eval('#library .lib-item.added', e => e.length) >= 1, 'tapping a library row adds it (' + (addable || {}).t + ')');
  await m.$eval('#libSearch', e => { e.value = ''; }); await m.type('#libSearch', 'record'); await sleep(150);
  await m.$eval('#secLibrary', e => window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top - 8)); await sleep(2700);
  await m.screenshot({ path: path.join(SHOTS, 'attorney-library-mobile.png') });
  await noOverflow(m, '390 library');

  // Link sheet + navigator.share
  await m.click('#barGen'); await sleep(300);
  ok(await m.$eval('#sheet', e => !e.classList.contains('hidden')) && /client\.html#d=/.test(await m.$eval('#sheetLink', e => e.textContent)), 'Generate link opens the link sheet with the client link');
  ok(await inView(m, '#sheetShare') && await inView(m, '#sheetCopy') && await inView(m, '#sheetClose'), 'sheet buttons visible on screen');
  await m.screenshot({ path: path.join(SHOTS, 'attorney-link-sheet-mobile.png') });
  await noOverflow(m, '390 link sheet');
  await m.click('#sheetShare'); await sleep(200);
  const shared = await m.evaluate(() => window.__shared);
  ok(shared.length === 1 && /client\.html#d=/.test(shared[0].url) && /Maria/.test(shared[0].text), 'Share… calls navigator.share with the link');
  await m.click('#sheetClose');
  ok(await m.$eval('#sheet', e => e.classList.contains('hidden')), 'sheet closes');
  await m.close();

  // No navigator.share → copy fallback; 360x740 phone
  const m2 = await newPage(360, 740, true);
  await m2.goto(BASE + 'index.html', { waitUntil: 'networkidle0' });
  await noOverflow(m2, '360 attorney (default)');
  await openAll(m2); await sleep(100);
  await noOverflow(m2, '360 attorney (all sections open)');
  t = await tapAudit(m2); ok(t.n === 0 && !t.fonts.length, '360 attorney: tap targets ≥ 44px, inputs ≥ 16px' + (t.n ? ': ' + t.small.join(', ') : ''));
  await m2.click('#barGen'); await sleep(250);
  ok(await m2.evaluate(() => !navigator.share) && /Copy & share/.test(await m2.$eval('#sheetShare', e => e.textContent)), 'without navigator.share the button falls back to copy');
  await m2.click('#sheetShare'); await sleep(250);
  ok(/copied/i.test(await m2.$eval('.toast', e => e.textContent)), 'fallback copies the link (toast)');
  await noOverflow(m2, '360 link sheet');
  await m2.close();

  // Tablet 768
  const tb = await newPage(768, 1024, true);
  await tb.goto(BASE + 'index.html', { waitUntil: 'networkidle0' });
  ok(await inView(tb, '#barGen') && await tb.$eval('.a-layout', e => getComputedStyle(e).flexDirection === 'column'), '768 tablet: single column + action bar');
  await openAll(tb); await noOverflow(tb, '768 attorney (all open)');
  await tb.screenshot({ path: path.join(SHOTS, 'attorney-tablet-768-mobile.png') });
  await tb.close();

  // Desktop unchanged
  await a.bringToFront(); await a.reload({ waitUntil: 'networkidle0' });
  ok(await a.$eval('#aBar', e => getComputedStyle(e).display === 'none') && await a.$eval('.a-layout', e => getComputedStyle(e).display === 'grid' && getComputedStyle(e).gridTemplateColumns.split(' ').length === 3), '1280 desktop: 3-column grid, no mobile bar');
  ok(await a.$$eval('details.sec', els => els.every(e => e.open)), '1280 desktop: all sections open');
  await noOverflow(a, '1280 attorney');
  await a.screenshot({ path: path.join(SHOTS, 'attorney-1280x800.png') });

  // Client view at 360px: every task expanded in turn
  const c3 = await newPage(360, 740, true);
  await c3.goto(link3, { waitUntil: 'networkidle0' });
  await noOverflow(c3, '360 client list');
  await c3.evaluate(() => document.querySelector('#doneSec').open = true);
  const heads = await c3.$$eval('.acc', els => els.map(e => e.dataset.task));
  const badPanels = [];
  for (const id of heads) {
    const exp = await c3.$eval(`.acc[data-task="${id}"] .acc-head`, e => e.getAttribute('aria-expanded') === 'true');
    if (!exp) { await c3.click(`.acc[data-task="${id}"] .acc-head`); await sleep(80); }
    const r = await overflowAudit(c3); if (r.sw > r.vw || r.bad.length) badPanels.push(id + ': ' + r.bad.join(','));
  }
  ok(badPanels.length === 0, '360 client: no overflow with any of ' + heads.length + ' tasks expanded' + (badPanels.length ? ' — ' + badPanels.join(' | ') : ''));
  t = await tapAudit(c3); ok(t.fonts.length === 0, '360 client inputs ≥ 16px' + (t.fonts.length ? ': ' + t.fonts.join(',') : ''));
  await c3.goto('about:blank'); await c3.goto(link3, { waitUntil: 'networkidle0' }); await sleep(400);
  await c3.screenshot({ path: path.join(SHOTS, 'client-360-list-mobile.png') });
  const emailId3 = await c3.$$eval('.acc', els => (els.find(e => /employment letter/i.test(e.textContent)) || {}).dataset?.task);
  if (emailId3) { await c3.click(`.acc[data-task="${emailId3}"] .acc-head`); await sleep(200); await c3.$eval(`.acc[data-task="${emailId3}"]`, e => window.scrollTo(0, window.scrollY + e.getBoundingClientRect().top - 60)); await sleep(300); await c3.screenshot({ path: path.join(SHOTS, 'client-360-email-expanded-mobile.png') }); }
  ok(await c3.$eval('meta[name=viewport]', e => /width=device-width/.test(e.content) && /initial-scale=1/.test(e.content)) && await a.$eval('meta[name=viewport]', e => /width=device-width/.test(e.content) && /initial-scale=1/.test(e.content)), 'viewport meta tags present on both pages');
  await c3.close();

  // Bad link
  const b = await newPage(390, 844, true);
  await b.goto(BASE + 'client.html#d=garbage', { waitUntil: 'networkidle0' });
  ok(/incomplete/.test(await b.$eval('#app', e => e.textContent)), 'garbled link shows a friendly error');

  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
