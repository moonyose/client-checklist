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
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=en-US'], userDataDir: fs.mkdtempSync('/tmp/cc-profile-') });
  const errors = [];
  async function newPage(w, h, mobile) {
    const p = await browser.newPage();
    await p.setViewport({ width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, isMobile: !!mobile, hasTouch: !!mobile });
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
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
  const addBtn = await a.evaluateHandle(() => [...document.querySelectorAll('#library .lib-item')].find(e => /FBI background check/.test(e.textContent)).querySelector('button'));
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

  // Bad link
  const b = await newPage(390, 844, true);
  await b.goto(BASE + 'client.html#d=garbage', { waitUntil: 'networkidle0' });
  ok(/incomplete/.test(await b.$eval('#app', e => e.textContent)), 'garbled link shows a friendly error');

  ok(errors.length === 0, 'no JS errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
