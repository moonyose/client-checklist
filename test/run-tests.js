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

  /* ---------- Client view ---------- */
  console.log('Client view');
  let c = await newPage(390, 844, true);
  await c.goto(link1, { waitUntil: 'networkidle0' });
  ok(/Hola Maria/.test(await c.$eval('.hello h1', e => e.textContent)), 'client opens in Spanish (Maria\'s language)');
  ok(await c.$eval('html', e => e.lang) === 'es', 'html lang=es');
  await c.screenshot({ path: path.join(SHOTS, 'client-390-overview-es.png'), fullPage: false });
  await c.click('.lang button[data-lang=en]');
  ok(/Hi Maria/.test(await c.$eval('.hello h1', e => e.textContent)), 'Spanish → English toggle works');
  ok(/0 of 11 done/.test(await c.$eval('#progressText', e => e.textContent)), 'progress shows 0 of 11');
  await c.screenshot({ path: path.join(SHOTS, 'client-390-overview.png') });

  // Email task
  const open = async (re) => { await c.goto('about:blank'); await c.goto(link1, { waitUntil: 'networkidle0' }); return clickText(c, '#activeList .t-row', re); };
  ok(await open(/employment letter/i), 'open email task');
  await c.type('#f_fullName', 'Maria Example'); await c.type('#f_employerName', 'ACME Corp'); await c.type('#f_jobTitle', 'Bookkeeper');
  const mailto = await c.$eval('#mailtoBtn', e => e.getAttribute('href'));
  const u = new URL(mailto);
  ok(u.protocol === 'mailto:' && u.pathname === 'hr@example.com', 'mailto recipient = attorney-provided hr@example.com');
  const subj = decodeURIComponent(/subject=([^&]*)/.exec(mailto)[1]), body = decodeURIComponent(/body=([^&]*)/.exec(mailto)[1]);
  ok(subj === 'Request for employment verification letter – Maria Example', 'mailto subject filled: ' + subj);
  ok(body.includes('ACME Corp letterhead') && body.includes('\r\n') && !/[^\r]\n/.test(body), 'mailto body filled and uses CRLF line breaks');
  ok(/^mailto:[^?]+\?subject=[^&]+&body=[^&]+$/.test(mailto) && !/[ \n]/.test(mailto), 'mailto URL well-formed (no raw spaces/newlines)');
  ok((await c.$$('#emailBody mark.blank')).length >= 1, 'unfilled blanks highlighted (startDate/phone)');
  await c.evaluate(() => window.scrollTo(0, 0)); await c.screenshot({ path: path.join(SHOTS, 'client-390-email-task.png') });
  await c.evaluate(() => document.querySelector('.email-box').scrollIntoView({ block: 'start' })); await c.evaluate(() => window.scrollBy(0, -12)); await c.screenshot({ path: path.join(SHOTS, 'client-390-email-draft.png') });
  await c.screenshot({ path: path.join(SHOTS, 'client-390-email-task-full.png'), fullPage: true });

  // Phone task
  ok(await open(/IRS tax transcripts by phone/i), 'open phone task');
  ok(await c.$eval('#callBtn', e => e.getAttribute('href')) === 'tel:+18009089946', 'tap-to-call tel:+18009089946');
  await c.type('#f_taxYears', '2023, 2024, 2025');
  ok(/2023, 2024, 2025/.test(await c.$eval('#script', e => e.textContent)), 'script fill-in updates live');
  await c.evaluate(() => window.scrollTo(0, 0)); await c.screenshot({ path: path.join(SHOTS, 'client-390-phone-task.png') });
  await c.screenshot({ path: path.join(SHOTS, 'client-390-phone-task-full.png'), fullPage: true });
  await c.click('.lang button[data-lang=es]');
  ok(/Llame al 800-908-9946/.test(await c.$eval('#script', e => e.textContent)), 'Spanish toggle translates task script');
  await c.screenshot({ path: path.join(SHOTS, 'client-390-phone-task-es.png') });
  await c.click('.lang button[data-lang=en]');

  // Check off 2 tasks via the walkthrough
  console.log('Done-state persistence');
  await c.click('#doneBtn'); // phone task done → advances to next task
  await sleep(200);
  const secondTitle = await c.$eval('.task h1', e => e.textContent);
  await c.click('#doneBtn');
  await sleep(200);
  await c.click('#backBtn');
  const doneIds = Object.keys(await c.evaluate(() => window.__client.doneMap())).filter(Boolean);
  const activeTitles = async () => c.$$eval('#activeList .t-row b', els => els.map(e => e.textContent));
  const doneTitles = async () => c.$$eval('#doneSec .done-row .tt', els => els.map(e => e.textContent));
  ok(doneIds.length === 2, '2 tasks stored as done (keyed by task id with doneAt): ' + JSON.stringify(await c.evaluate(() => window.__client.doneMap())));
  ok((await doneTitles()).length === 2 && !(await activeTitles()).some(t => /by phone/.test(t)), 'checked tasks left the active list and are in Done');
  ok(await c.$eval('#doneSec', e => !e.open), 'Done section is collapsed by default');
  await c.reload({ waitUntil: 'networkidle0' });
  ok((await doneTitles()).length === 2 && (await activeTitles()).length === 9, 'after refresh: still 2 done, 9 active');
  await c.close();
  c = await newPage(390, 844, true);
  await c.goto(link1, { waitUntil: 'networkidle0' });
  ok((await doneTitles()).length === 2 && (await activeTitles()).length === 9, 'close tab + reopen link: still 2 done');
  await c.click('#doneSec summary');
  await c.screenshot({ path: path.join(SHOTS, 'client-390-overview-done-open.png'), fullPage: true });

  // Restore one
  const restoredTitle = await c.$eval('.done-row .tt', e => e.textContent);
  await c.click('[data-restore]');
  ok((await doneTitles()).length === 1 && (await activeTitles()).length === 10, 'restore moves a task back to active');
  await c.reload({ waitUntil: 'networkidle0' });
  ok((await doneTitles()).length === 1, 'restore persists after refresh');
  // re-check it for the update test
  await clickText(c, '#activeList .t-row', new RegExp(restoredTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); await c.click('#doneBtn'); await sleep(150);

  // Updated link with one extra task
  console.log('Updated link merge');
  await a.bringToFront();
  await clickText(a, '#library .lib-item', /FBI background check/) ;
  const addBtn = await a.evaluateHandle(() => [...document.querySelectorAll('#library .lib-item')].find(e => /FBI background check/.test(e.textContent)).querySelector('button'));
  await addBtn.click();
  await a.click('#genLink');
  const link2 = await a.$eval('#linkText', e => e.textContent);
  ok(link2 !== link1 && /version 2/.test(await a.$eval('#linkMeta', e => e.textContent)), 'updated link v2 generated');
  await c.goto('about:blank'); await c.goto(link2, { waitUntil: 'networkidle0' });
  ok((await doneTitles()).length === 2, 'updated link: previous 2 tasks still done');
  ok((await activeTitles()).some(t => /FBI background check/.test(t)) && (await activeTitles()).length === 10, 'updated link: new FBI task appears open (10 active)');
  ok(/added 1 new task/.test(await c.$eval('.notice.info', e => e.textContent)), 'banner announces 1 new task');
  await c.goto('about:blank'); await c.goto(link1, { waitUntil: 'networkidle0' });
  ok((await activeTitles()).some(t => /FBI/.test(t)) && (await doneTitles()).length === 2, 're-opening the OLD link still shows newest version + done-state');
  // Removed task drops
  await a.bringToFront();
  const rm = await a.evaluateHandle(() => [...document.querySelectorAll('#tasks .task-item')].find(e => /Photos of you together/.test(e.textContent)).querySelector('[data-act=remove]'));
  await rm.click(); await a.click('#genLink');
  const link3 = await a.$eval('#linkText', e => e.textContent);
  await c.goto('about:blank'); await c.goto(link3, { waitUntil: 'networkidle0' });
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
