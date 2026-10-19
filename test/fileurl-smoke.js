// Smoke test: the prototype also works when index.html is opened directly from disk (file://).
const puppeteer = require('puppeteer-core'); const path = require('path'); const fs = require('fs');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--allow-file-access-from-files'], userDataDir: fs.mkdtempSync('/tmp/cc-file-') });
  const errs = []; const a = await b.newPage(); a.on('pageerror', e => errs.push(e.message));
  await a.goto('file://' + path.resolve(__dirname, '../index.html'));
  await a.click('#genLink'); const link = await a.$eval('#linkText', e => e.textContent);
  const c = await b.newPage(); c.on('pageerror', e => errs.push(e.message)); await c.goto(link);
  await c.click('#activeList .t-row'); await c.click('#doneBtn'); await c.goto('about:blank'); await c.goto(link);
  const done = await c.$$eval('#doneSec .done-row', e => e.length);
  console.log(link.slice(0, 60) + '…', '| done after reopen:', done, '| errors:', errs.length);
  await b.close(); process.exit(link.startsWith('file://') && done === 1 && !errs.length ? 0 : 1);
})();
