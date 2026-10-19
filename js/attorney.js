/* Attorney view: build checklists, persist drafts locally, generate client links. */
(function () {
  'use strict';
  var LIB = window.CC_LIBRARY, CC = window.CC;
  var KEY = 'cc.attorney.v1';
  var $ = function (id) { return document.getElementById(id); };
  var TYPE_LABEL = { doc: 'Document', email: 'Email', phone: 'Phone', online: 'Online/mail', custom: 'Custom' };

  /* ---------------- persistence ---------------- */
  var store = CC.lsGet(KEY, null);
  function save() { if (cur()) cur().updatedAt = new Date().toISOString(); CC.lsSet(KEY, store); renderDrafts(); }
  function cur() { return store && store.drafts[store.currentId]; }

  function newTask(libId, extra) {
    return Object.assign({ id: CC.uid('tk_'), libId: libId, due: '', note: '', o: {}, title: '', text: '' }, extra || {});
  }
  function newDraft(name) {
    return { id: CC.uid('cl_'), rev: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      clientName: name || '', lang: 'en', caseType: 'family_gc', message: '', defaultDue: '',
      attorney: { name: '', phone: '', email: '' }, reminders: { email: false, sms: false, emailAddr: '', phone: '', time: '09:00' },
      tasks: [], lastLink: null, lastLinkSig: null };
  }
  function exampleDraft() {
    var d = newDraft('Maria Example'), t = CC.today();
    d.lang = 'es'; d.caseType = 'family_gc';
    d.message = 'These are the things we need from you for your green card case. Take them one at a time — you can do this. Call us with any question.';
    d.attorney = { name: 'Example Immigration Law Office', phone: '(555) 555-0100', email: 'office@example.com' };
    d.reminders = { email: true, sms: true, emailAddr: '', phone: '', time: '18:00' };
    var plan = [
      ['birth_cert', -1], ['passport_copy', 3], ['marriage_cert', 7], ['joint_financial', 14], ['relationship_photos', 14],
      ['employment_letter', 5, { o: { toName: 'HR – ACME Corp (example)', to: 'hr@example.com' } }],
      ['affidavit_request', 21], ['irs_transcript_phone', 2, { note: 'We need 2023, 2024 and 2025.' }],
      ['irs_transcript_online', 10], ['police_certificate', 30], ['passport_photos', 21]
    ];
    d.tasks = plan.map(function (p) { return newTask(p[0], Object.assign({ due: CC.ymd(CC.addDays(t, p[1])) }, p[2] || {})); });
    d.defaultDue = CC.ymd(CC.addDays(t, 21));
    return d;
  }
  if (!store || !store.drafts || !Object.keys(store.drafts).length) {
    var ex = exampleDraft();
    store = { drafts: {}, currentId: ex.id, exampleId: ex.id };
    store.drafts[ex.id] = ex; CC.lsSet(KEY, store);
  }
  if (!cur()) store.currentId = Object.keys(store.drafts)[0];

  /* ---------------- payload ---------------- */
  function toPayload(d) {
    return { v: CC.SCHEMA, id: d.id, rev: d.rev, c: d.clientName, l: d.lang, ct: d.caseType, m: d.message,
      a: d.attorney, r: d.reminders, cr: d.createdAt.slice(0, 10),
      t: d.tasks.map(function (t) {
        var o = { id: t.id, i: t.libId || 'custom' };
        if (t.due) o.d = t.due; if (t.note) o.n = t.note;
        var ov = {}; Object.keys(t.o || {}).forEach(function (k) { if (t.o[k]) ov[k] = t.o[k]; });
        if (Object.keys(ov).length) o.o = ov;
        if (!t.libId) { o.ti = t.title; if (t.text) o.tx = t.text; if (t.custom) o.cu = t.custom; }
        return o;
      }) };
  }
  function linkFor(d) {
    return new URL('client.html', location.href).href + '#d=' + CC.encodePayload(toPayload(d));
  }

  /* ---------------- render ---------------- */
  function renderDrafts() {
    var ids = Object.keys(store.drafts).sort(function (a, b) { return store.drafts[b].updatedAt.localeCompare(store.drafts[a].updatedAt); });
    $('drafts').innerHTML = ids.map(function (id) {
      var d = store.drafts[id];
      return '<button class="draft' + (id === store.currentId ? ' active' : '') + '" data-id="' + id + '"><b>' + CC.esc(d.clientName || 'Untitled client') +
        '</b><small>' + d.tasks.length + ' tasks · ' + CC.esc((LIB.CASE_TYPES[d.caseType] || {}).label || '') + '</small></button>';
    }).join('');
  }

  function renderForm() {
    var d = cur();
    $('clientName').value = d.clientName; $('lang').value = d.lang; $('caseType').value = d.caseType;
    $('message').value = d.message; $('defaultDue').value = d.defaultDue || '';
    $('attName').value = d.attorney.name; $('attPhone').value = d.attorney.phone; $('attEmail').value = d.attorney.email;
    $('remEmail').checked = !!d.reminders.email; $('remSms').checked = !!d.reminders.sms;
    $('remEmailAddr').value = d.reminders.emailAddr || ''; $('remPhone').value = d.reminders.phone || ''; $('remTime').value = d.reminders.time || '09:00';
    renderTasks(); renderLibrary(); renderLink(); renderRepoShare();
  }

  function taskTitle(t) { var it = LIB.byId[t.libId]; if (it) return it.title.en; var ct = t.custom && t.custom.title; return t.title || (ct && (ct.en || ct)) || 'Custom task'; }

  function renderTasks() {
    var d = cur();
    $('taskCount').textContent = '(' + d.tasks.length + ')';
    if (!d.tasks.length) { $('tasks').innerHTML = '<p class="muted">No tasks yet. Add suggested tasks, use Quick add, or pick from the library →</p>'; return; }
    $('tasks').innerHTML = d.tasks.map(function (t, idx) {
      var it = LIB.byId[t.libId], type = it ? it.type : 'custom', extra = '';
      if (type === 'email') {
        extra = '<input data-k="o.toName" placeholder="Recipient name (e.g. HR – Company)" value="' + CC.esc(t.o.toName || '') + '">' +
                '<input data-k="o.to" placeholder="Recipient email ' + (it.placeholderTo ? '(placeholder – please fill in)' : '(optional)') + '" value="' + CC.esc(t.o.to || '') + '">';
      } else if (type === 'phone' && it.placeholder) {
        extra = '<span class="badge warn" style="align-self:center">Placeholder number</span><input data-k="o.phone" placeholder="Phone number to call (fill in)" value="' + CC.esc(t.o.phone || '') + '">';
      }
      var preview = it ? '<details><summary>Preview template</summary><div class="small" style="margin-top:.3rem">' + CC.esc(it.summary.en) +
        (it.phoneDisplay ? '<br>Phone: <b>' + it.phoneDisplay + '</b> ' + (it.verified ? '✓ verified' : '') : '') +
        (it.url ? '<br>Link: <a href="' + it.url + '" target="_blank" rel="noopener">' + it.url + '</a> ' + (it.verified ? '✓ verified' : '') : '') +
        (it.source ? '<br>Source: <a href="' + it.source + '" target="_blank" rel="noopener">' + it.source + '</a>' : '') +
        (it.subject ? '<br>Subject: <i>' + CC.esc(it.subject.en) + '</i>' : '') +
        '<br><span class="muted">Example template — review before sending.</span></div></details>' : '';
      var customFields = !it ? '<input data-k="title" placeholder="Task title" value="' + CC.esc(t.title) + '" style="grid-column:1/-1">' +
        '<textarea data-k="text" rows="2" placeholder="Instructions for the client (shown as written)" style="grid-column:1/-1">' + CC.esc(t.text) + '</textarea>' : '';
      return '<div class="task-item" data-idx="' + idx + '"><div class="head"><span class="badge ' + type + '">' + TYPE_LABEL[type] + '</span>' +
        '<span class="title">' + CC.esc(taskTitle(t)) + '</span>' +
        '<button class="btn small ghost" data-act="up" title="Move up">↑</button><button class="btn small ghost" data-act="down" title="Move down">↓</button>' +
        '<button class="btn small ghost" data-act="remove" title="Remove">✕</button></div>' +
        '<div class="opts"><input type="date" data-k="due" value="' + (t.due || '') + '" title="Due date">' +
        '<input data-k="note" placeholder="Note to client (optional)" value="' + CC.esc(t.note) + '">' + customFields + extra + '</div>' + preview + '</div>';
    }).join('');
  }

  function renderLibrary() {
    var q = $('libSearch').value.trim().toLowerCase(), ty = $('libType').value, used = {};
    cur().tasks.forEach(function (t) { if (t.libId) used[t.libId] = 1; });
    $('library').innerHTML = LIB.ITEMS.filter(function (it) {
      return (!ty || it.type === ty) && (!q || (it.title.en + ' ' + it.summary.en + ' ' + it.keywords.join(' ')).toLowerCase().indexOf(q) >= 0);
    }).map(function (it) {
      var v = it.phoneDisplay ? ' · ' + it.phoneDisplay + (it.verified ? ' ✓' : '') : (it.placeholder ? ' · <span class="badge warn">placeholder</span>' : (it.url && it.verified ? ' · link ✓' : ''));
      return '<div class="lib-item' + (used[it.id] ? ' added' : '') + '"><div class="t"><b>' + CC.esc(it.title.en) + '</b><span class="badge ' + it.type + '">' + TYPE_LABEL[it.type] + '</span>' +
        '<span class="small muted">' + v + '</span></div><button class="btn small" data-add="' + it.id + '"' + (used[it.id] ? ' disabled' : '') + '>' + (used[it.id] ? 'Added' : 'Add') + '</button></div>';
    }).join('');
  }

  /* Repo client files (read-only view; edit here then download JSON, or let the AI assistant commit) */
  var repoFiles = {};
  function loadRepoClients() {
    $('repoClients').textContent = 'Loading…';
    CC.listRepoClients().then(function (paths) {
      return Promise.all(paths.map(function (p) { return CC.fetchRepoJSON(p).then(function (r) { return r.data; }).catch(function () { return null; }); }));
    }).then(function (docs) {
      repoFiles = {}; docs.filter(Boolean).forEach(function (d) { repoFiles[d.id] = d; });
      var ids = Object.keys(repoFiles);
      $('repoClients').innerHTML = ids.length ? ids.map(function (id) { var d = repoFiles[id];
        return '<button class="draft" data-repo="' + id + '"><b>' + CC.esc(d.client.name) + '</b><small>' + d.tasks.filter(function (t) { return !t.deleted; }).length + ' tasks · rev ' + d.rev + ' · ' + CC.esc((LIB.CASE_TYPES[d.caseType] || {}).label || '') + '</small></button>'; }).join('') : 'No client files yet.';
      renderRepoShare();
    }).catch(function (e) { $('repoClients').textContent = 'Could not reach GitHub (' + e.message + ').'; });
  }
  $('repoClients').addEventListener('click', function (e) {
    var b = e.target.closest('[data-repo]'); if (!b) return;
    var f = repoFiles[b.getAttribute('data-repo')], ex = store.drafts[f.id];
    if (ex && !ex.fromRepo && !confirm('A local draft with this id exists. Replace it with the repo version?')) return;
    store.drafts[f.id] = CC.fileToDraft(f); store.currentId = f.id; save(); renderForm();
  });
  $('repoRefresh').onclick = loadRepoClients;
  $('exportJson').onclick = function () {
    var d = cur(), file = CC.draftToFile(d, d.repoFile || null);
    CC.download(d.id + '.json', JSON.stringify(file, null, 2) + '\n', 'application/json');
    toast('Downloaded ' + d.id + '.json — commit it to data/clients/');
  };
  function renderRepoShare() {
    var d = cur(), on = !!(d.fromRepo || repoFiles[d.id]);
    $('repoShare').classList.toggle('hidden', !on);
    if (on) { var l = new URL('client.html?c=' + d.id, location.href).href; $('repoLinkText').textContent = l; $('openRepoLink').href = l; $('copyRepoLink').onclick = function () { CC.copyText(l).then(function () { toast('Link copied'); }); }; }
  }

  function sig(d) { return JSON.stringify(toPayload(Object.assign({}, d, { rev: 0 }))); }
  function renderLink() {
    var d = cur();
    if (!d.lastLink) { $('linkOut').classList.add('hidden'); return; }
    $('linkOut').classList.remove('hidden');
    $('linkText').textContent = d.lastLink; $('openLink').href = d.lastLink;
    var stale = d.lastLinkSig !== sig(d);
    $('linkMeta').innerHTML = 'version ' + d.rev + ' · ' + d.lastLink.length.toLocaleString() + ' chars' + (stale ? ' · <b style="color:#8a5a00">changed since — generate again</b>' : '');
  }

  /* ---------------- events ---------------- */
  function bindField(id, setter) { $(id).addEventListener('input', function (e) { setter(cur(), e.target.type === 'checkbox' ? e.target.checked : e.target.value); save(); renderLink(); }); $(id).addEventListener('change', function () { save(); renderLink(); }); }
  bindField('clientName', function (d, v) { d.clientName = v; });
  bindField('lang', function (d, v) { d.lang = v; });
  bindField('caseType', function (d, v) { d.caseType = v; });
  bindField('message', function (d, v) { d.message = v; });
  bindField('defaultDue', function (d, v) { d.defaultDue = v; });
  bindField('attName', function (d, v) { d.attorney.name = v; });
  bindField('attPhone', function (d, v) { d.attorney.phone = v; });
  bindField('attEmail', function (d, v) { d.attorney.email = v; });
  bindField('remEmail', function (d, v) { d.reminders.email = v; });
  bindField('remSms', function (d, v) { d.reminders.sms = v; });
  bindField('remEmailAddr', function (d, v) { d.reminders.emailAddr = v; });
  bindField('remPhone', function (d, v) { d.reminders.phone = v; });
  bindField('remTime', function (d, v) { d.reminders.time = v; });

  $('caseType').innerHTML = Object.keys(LIB.CASE_TYPES).map(function (k) { return '<option value="' + k + '">' + LIB.CASE_TYPES[k].label + '</option>'; }).join('');
  $('verifiedOn').textContent = LIB.VERIFIED_ON;

  function addLib(id, extra) {
    var d = cur();
    if (d.tasks.some(function (t) { return t.libId === id; })) return false;
    d.tasks.push(newTask(id, Object.assign({ due: d.defaultDue || '' }, extra || {}))); return true;
  }
  $('addSuggested').onclick = function () {
    var n = 0; (LIB.CASE_TYPES[cur().caseType].suggested || []).forEach(function (id) { if (addLib(id)) n++; });
    save(); renderTasks(); renderLibrary(); renderLink(); toast(n ? 'Added ' + n + ' suggested tasks' : 'All suggested tasks are already in the list');
  };
  $('applyDue').onclick = function () { var d = cur(); if (!d.defaultDue) return; d.tasks.forEach(function (t) { if (!t.due) t.due = d.defaultDue; }); save(); renderTasks(); renderLink(); };
  $('addCustom').onclick = function () { cur().tasks.push(newTask(null, { title: '', due: cur().defaultDue || '' })); save(); renderTasks(); renderLink(); };
  $('library').addEventListener('click', function (e) { var id = e.target.getAttribute('data-add'); if (id && addLib(id)) { save(); renderTasks(); renderLibrary(); renderLink(); } });
  $('libSearch').oninput = renderLibrary; $('libType').onchange = renderLibrary;

  $('tasks').addEventListener('input', function (e) {
    var k = e.target.getAttribute('data-k'); if (!k) return;
    var t = cur().tasks[+e.target.closest('.task-item').getAttribute('data-idx')];
    if (k.indexOf('o.') === 0) t.o[k.slice(2)] = e.target.value; else t[k] = e.target.value;
    if (k === 'title') e.target.closest('.task-item').querySelector('.title').textContent = e.target.value || 'Custom task';
    save(); renderLink();
  });
  $('tasks').addEventListener('click', function (e) {
    var act = e.target.getAttribute('data-act'); if (!act) return;
    var d = cur(), i = +e.target.closest('.task-item').getAttribute('data-idx');
    if (act === 'remove') d.tasks.splice(i, 1);
    if (act === 'up' && i > 0) d.tasks.splice(i - 1, 0, d.tasks.splice(i, 1)[0]);
    if (act === 'down' && i < d.tasks.length - 1) d.tasks.splice(i + 1, 0, d.tasks.splice(i, 1)[0]);
    save(); renderTasks(); renderLibrary(); renderLink();
  });

  $('drafts').addEventListener('click', function (e) { var b = e.target.closest('.draft'); if (!b) return; store.currentId = b.getAttribute('data-id'); CC.lsSet(KEY, store); renderDrafts(); renderForm(); });
  $('newDraft').onclick = function () { var d = newDraft(''); store.drafts[d.id] = d; store.currentId = d.id; save(); renderForm(); $('clientName').focus(); };
  $('resetExample').onclick = function () {
    // Keeps the same checklist id so a client's existing progress for the example link still applies.
    var old = store.exampleId && store.drafts[store.exampleId], ex = exampleDraft();
    if (old) { ex.id = old.id; ex.rev = old.rev; ex.tasks.forEach(function (t) { var m = old.tasks.filter(function (o) { return o.libId === t.libId; })[0]; if (m) t.id = m.id; }); }
    store.drafts[ex.id] = ex; store.exampleId = ex.id; store.currentId = ex.id; save(); renderForm();
  };

  /* Quick add / dictation */
  $('parseBtn').onclick = function () {
    var items = window.CC_PARSE.parse($('dictation').value), d = cur(), added = [], skipped = 0;
    items.forEach(function (p) {
      if (p.libId) {
        var existing = d.tasks.filter(function (t) { return t.libId === p.libId; })[0];
        if (existing) { if (p.due && !existing.due) existing.due = p.due; skipped++; return; }
        d.tasks.push(newTask(p.libId, { due: p.due || d.defaultDue || '' })); added.push(LIB.byId[p.libId].title.en);
      } else {
        d.tasks.push(newTask(null, { title: p.title, due: p.due || d.defaultDue || '' })); added.push(p.title + ' (custom)');
      }
    });
    save(); renderTasks(); renderLibrary(); renderLink();
    $('parseMsg').textContent = items.length ? 'Added ' + added.length + (skipped ? ', ' + skipped + ' already in list' : '') + ': ' + added.join(' · ') : 'Nothing recognized — try one task per line.';
    if (added.length) $('dictation').value = '';
  };
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null;
  if (!SR) { $('micBtn').disabled = true; $('micBtn').title = 'Speech recognition is not available in this browser — type instead (or use your keyboard\'s dictation).'; }
  $('micBtn').onclick = function () {
    if (!SR) return;
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = false;
    var base = $('dictation').value;
    rec.onresult = function (ev) { var txt = ''; for (var i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript + ' '; $('dictation').value = (base ? base + '\n' : '') + txt.trim(); };
    rec.onend = function () { rec = null; $('micBtn').classList.remove('on'); $('micBtn').textContent = '🎤 Dictate'; };
    rec.start(); $('micBtn').classList.add('on'); $('micBtn').textContent = '■ Stop';
  };

  /* Share */
  $('genLink').onclick = function () {
    var d = cur();
    if (!d.tasks.length) { toast('Add at least one task first'); return; }
    var s = sig(d);
    if (s !== d.lastLinkSig) { d.rev = (d.rev || 0) + 1; d.lastLinkSig = s; }
    d.lastLink = linkFor(d); save(); renderLink();
  };
  $('copyLink').onclick = function () { CC.copyText(cur().lastLink).then(function () { toast('Link copied'); }); };

  var tt;
  function toast(msg) {
    var el = document.querySelector('.toast') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toast' }));
    el.textContent = msg; el.classList.remove('hidden'); clearTimeout(tt); tt = setTimeout(function () { el.classList.add('hidden'); }, 2500);
  }

  renderDrafts(); renderForm(); loadRepoClients();
  window.__attorney = { store: function () { return store; }, linkFor: linkFor, toPayload: toPayload };
})();
