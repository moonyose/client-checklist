// Live end-to-end test acting as the attorney's AI assistant:
// dictation -> new client file via commit -> live page shows it -> check off -> add task via another commit
// -> earlier check-off still done, new task open -> remove a task via a third commit -> it drops, check-off stays.
// Usage: node test/agent-e2e.mjs   (needs git push access; uses EXAMPLE data only)
import { execSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const puppeteer = require('puppeteer-core');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = process.env.CC_SITE || 'https://moonyose.github.io/client-checklist/';
const ID = process.env.CC_E2E_ID || 'cl_jose_example';
const sh = (c) => execSync(c, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const git = (msg) => { sh('git add data/clients'); sh(`git -c user.name=moonyose -c user.email=moonyose@users.noreply.github.com commit -qm "${msg}"`); sh('git push -q origin main'); return sh('git rev-parse --short HEAD'); };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

sh('git pull -q --rebase origin main');
if (fs.existsSync(path.join(ROOT, 'data/clients', ID + '.json'))) { fs.rmSync(path.join(ROOT, 'data/clients', ID + '.json')); sh('node scripts/cc.mjs index'); git(`client(${ID}): reset for e2e test`); }

const dictation = 'Jose needs his birth certificate and tax transcripts by Nov 15';
console.log(`Agent step 1: "${dictation}"`);
console.log(sh(`node scripts/cc.mjs new --id ${ID} --name "Jose Example" --lang es --case naturalization --reminder-time 18:00 --message "Hola Jose, aquí está lo que necesitamos. Vaya paso a paso."`).replace(/^/gm, '    '));
console.log(sh(`node scripts/cc.mjs dictate ${ID} "${dictation}"`).replace(/^/gm, '    '));
sh('node scripts/cc.mjs validate');
const c1 = git(`client(${ID}): new client from dictation — birth certificate + tax transcripts due Nov 15`);
console.log('    commit ' + c1);

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 30000, userDataDir: fs.mkdtempSync('/tmp/cc-agent-') });
const page = await browser.newPage(); await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const errs = []; page.on('pageerror', e => errs.push(e.message));
const URL_ = SITE + 'client.html?c=' + ID;
const state = async () => page.evaluate(() => ({
  via: window.__loadedVia, h1: (document.querySelector('.hello h1') || {}).textContent,
  active: [...document.querySelectorAll('#activeList .acc')].map(e => ({ id: e.dataset.task, t: e.querySelector('b').textContent })),
  done: [...document.querySelectorAll('#doneList .acc')].map(e => ({ id: e.dataset.task, t: e.querySelector('b').textContent })),
  notice: (document.querySelector('.notice.info') || {}).textContent || '' }));
const load = async () => { await page.goto('about:blank'); await page.goto(URL_, { waitUntil: 'networkidle0' }); await sleep(300); return state(); };

console.log('Live page after commit 1');
let s = await load();
ok(s.via === 'api', 'read fresh from GitHub API (no Pages rebuild needed): via=' + s.via);
ok(/Hola Jose/.test(s.h1) && s.active.length === 2, 'live page shows Jose with 2 tasks: ' + s.active.map(x => x.t).join(' | '));
const birth = s.active.find(x => /nacimiento/i.test(x.t));
ok(!!birth && s.active.some(x => /impuestos/i.test(x.t)), 'tasks = birth certificate + IRS tax transcripts');
const dues = await page.$$eval('#activeList .due', e => e.map(x => x.textContent)); ok(dues.every(d => /15 de noviembre/.test(d)), 'both due Nov 15: ' + dues.join(' / '));
// client checks off the birth certificate
if (!(await page.$eval(`.acc[data-task="${birth.id}"] .acc-head`, e => e.getAttribute('aria-expanded') === 'true'))) await page.click(`.acc[data-task="${birth.id}"] .acc-head`);
await page.click(`.acc[data-task="${birth.id}"] .act-done`); await sleep(200);
await page.reload({ waitUntil: 'networkidle0' }); s = await state();
ok(s.done.some(x => x.id === birth.id), 'client checked off birth certificate; survives refresh');
await page.screenshot({ path: path.join(ROOT, 'shots/agent-e2e-1-jose-after-dictation.png') });

console.log('Agent step 2: "Also add his FBI background check, due Nov 30"');
console.log(sh(`node scripts/cc.mjs add ${ID} --library fbi_idhs --due 2026-11-30 --note "Pida el resultado electrónico."`).replace(/^/gm, '    '));
const c2 = git(`client(${ID}): add FBI background check (due 2026-11-30)`); console.log('    commit ' + c2);
s = await load();
ok(s.via === 'api' && s.active.length + s.done.length === 3, 'live page shows 3 tasks right after commit 2');
ok(s.done.some(x => x.id === birth.id), 'earlier check-off (birth certificate) is STILL done');
ok(s.active.some(x => /FBI/.test(x.t)), 'new FBI task appears open');
ok(/1 tarea/.test(s.notice), 'client sees "added 1 new task" notice: ' + s.notice.trim());
await page.screenshot({ path: path.join(ROOT, 'shots/agent-e2e-2-jose-after-add.png') });

console.log('Agent step 3: "Remove the tax transcripts, we already have them"');
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/clients', ID + '.json'), 'utf8'));
const tax = doc.tasks.find(t => t.library === 'irs_transcript_online');
console.log(sh(`node scripts/cc.mjs remove ${ID} ${tax.id}`).replace(/^/gm, '    '));
const c3 = git(`client(${ID}): remove tax transcripts (already received)`); console.log('    commit ' + c3);
s = await load();
ok(!s.active.concat(s.done).some(x => x.id === tax.id), 'tombstoned task dropped from the list');
ok(s.done.some(x => x.id === birth.id) && s.active.some(x => /FBI/.test(x.t)), 'birth certificate still done, FBI still open');
ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
await browser.close();
console.log(`\nCommits: ${c1} (create from dictation), ${c2} (add task), ${c3} (remove task)\nClient link: ${URL_}\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
