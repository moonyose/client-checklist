/* Client view: mobile-first, one task at a time.
 * HARD RULE: client progress (done-state) is stored separately from the link, keyed by
 * checklistId + taskId, with timestamps. Loading any link (old, same, or updated) never resets it. */
(function () {
  'use strict';
  var LIB = window.CC_LIBRARY, CC = window.CC;
  var $ = function (id) { return document.getElementById(id); };
  var NS = 'cc.client.v1.';

  var S = {
    en: {
      hi: 'Hi {name},', defaultMsg: 'Here is what we need from you. Take it one step at a time — we will guide you through each one.',
      progress: '{done} of {total} done', next: 'Up next', start: 'Start', open: 'To do', doneSec: 'Done ({n})', undo: 'Restore',
      allDone: 'Everything is done!', allDoneTxt: 'Thank you. Please send anything you gathered to your attorney\'s office. We will be in touch.',
      back: '← All tasks', markDone: 'Mark as done ✓', haveIt: 'I have it ✓', skip: 'Skip for now →', reopen: 'Not done yet — move back to my list',
      movedDone: 'Moved to Done. Nice work!', restored: 'Moved back to your list.', undoBtn: 'Undo',
      dueToday: 'Due today', dueTomorrow: 'Due tomorrow', dueIn: 'Due in {n} days — coming up soon', due: 'Due {date}',
      overdue: 'Was due {date}. That\'s OK — please do it as soon as you can.', noDue: 'No due date',
      fromAtt: 'Note from your attorney', what: 'What this is', where: 'Where to find it', accepted: 'What we can accept', tips: 'Helpful tips',
      yourInfo: 'Your information (fills in the blanks below)', yourInfoNote: 'Saved only on this device.',
      emailDraft: 'Your email is ready', to: 'To', subject: 'Subject', recipientPh: 'their email address', copy: 'Copy email', copied: 'Email copied',
      openMail: 'Open in my email app', emailHow: 'Send it to: {who}', afterSend: 'After you send it, tap "Mark as done".',
      call: 'Call', hours: 'When to call', haveReady: 'Have this ready', script: 'What to say — step by step', noNumber: 'Your attorney will give you this number. Ask the office if you don\'t have it.',
      openSite: 'Open the website', steps: 'Steps', links: 'Useful links',
      remTitle: 'Daily reminder', remTxt: 'Add a reminder to your phone\'s calendar. It repeats every day at {time} until {date}. Delete it when you finish.',
      remBtn: 'Add daily reminder to my calendar', remDl: 'Reminder downloaded — open the file to add it to your calendar.',
      remSoon: 'Your attorney may also send you reminders by text or email in the future.',
      newTasks: 'Your attorney added {n} new task(s) to your list.', olderLink: 'You opened an older link. Showing the newest version of your checklist.',
      badLink: 'This link looks incomplete.', badLinkTxt: 'Please open the full link your attorney sent you, or ask the office to send it again.',
      device: 'Your progress is saved on this phone/computer only. If you switch devices, tell your attorney what you have done.',
      clear: 'Erase my information from this device', clearConfirm: 'Erase your progress and information from this device?',
      taskOf: 'Task {i} of {n}', proto: 'Prototype - example templates, not legal advice',
      icsSummary: 'Checklist: {n} task(s) left', icsOpen: 'Open your checklist:', icsAlarm: 'Time for your checklist — just one task today is great!',
      icsFooter: 'When everything is done you can delete this reminder.', icsTasks: 'Still to do:'
    },
    es: {
      hi: 'Hola {name}:', defaultMsg: 'Esto es lo que necesitamos de usted. Vaya paso a paso — le guiaremos en cada uno.',
      progress: '{done} de {total} listos', next: 'Lo siguiente', start: 'Empezar', open: 'Pendientes', doneSec: 'Listos ({n})', undo: 'Restaurar',
      allDone: '¡Todo está listo!', allDoneTxt: 'Gracias. Envíe a la oficina de su abogada todo lo que reunió. Nos pondremos en contacto.',
      back: '← Todas las tareas', markDone: 'Marcar como hecho ✓', haveIt: 'Ya lo tengo ✓', skip: 'Dejar para después →', reopen: 'Todavía no — regresar a mi lista',
      movedDone: 'Pasó a "Listos". ¡Muy bien!', restored: 'Regresó a su lista.', undoBtn: 'Deshacer',
      dueToday: 'Vence hoy', dueTomorrow: 'Vence mañana', dueIn: 'Vence en {n} días — ya se acerca', due: 'Vence el {date}',
      overdue: 'Vencía el {date}. No se preocupe — hágalo en cuanto pueda.', noDue: 'Sin fecha límite',
      fromAtt: 'Nota de su abogada', what: 'Qué es', where: 'Dónde encontrarlo', accepted: 'Qué podemos aceptar', tips: 'Consejos útiles',
      yourInfo: 'Sus datos (completan los espacios en blanco)', yourInfoNote: 'Se guardan solo en este dispositivo.',
      emailDraft: 'Su correo está listo', to: 'Para', subject: 'Asunto', recipientPh: 'su correo electrónico', copy: 'Copiar correo', copied: 'Correo copiado',
      openMail: 'Abrir en mi aplicación de correo', emailHow: 'Envíelo a: {who}', afterSend: 'Después de enviarlo, toque "Marcar como hecho".',
      call: 'Llamar', hours: 'Cuándo llamar', haveReady: 'Tenga esto a la mano', script: 'Qué decir — paso a paso', noNumber: 'Su abogada le dará este número. Pídalo a la oficina si no lo tiene.',
      openSite: 'Abrir la página web', steps: 'Pasos', links: 'Enlaces útiles',
      remTitle: 'Recordatorio diario', remTxt: 'Agregue un recordatorio al calendario de su teléfono. Se repite cada día a las {time} hasta el {date}. Bórrelo cuando termine.',
      remBtn: 'Agregar recordatorio diario a mi calendario', remDl: 'Recordatorio descargado — abra el archivo para agregarlo a su calendario.',
      remSoon: 'En el futuro, su abogada también podrá enviarle recordatorios por mensaje de texto o correo.',
      newTasks: 'Su abogada agregó {n} tarea(s) nueva(s) a su lista.', olderLink: 'Abrió un enlace anterior. Le mostramos la versión más reciente de su lista.',
      badLink: 'Este enlace parece incompleto.', badLinkTxt: 'Abra el enlace completo que le envió su abogada, o pida a la oficina que se lo envíe otra vez.',
      device: 'Su progreso se guarda solo en este teléfono/computadora. Si cambia de dispositivo, avise a su abogada lo que ya hizo.',
      clear: 'Borrar mis datos de este dispositivo', clearConfirm: '¿Borrar su progreso y sus datos de este dispositivo?',
      taskOf: 'Tarea {i} de {n}', proto: 'Prototipo - plantillas de ejemplo, no es asesoría legal (Prototype - example templates, not legal advice)',
      icsSummary: 'Lista: le quedan {n} tarea(s)', icsOpen: 'Abra su lista:', icsAlarm: 'Hora de su lista — ¡con una tarea hoy es suficiente!',
      icsFooter: 'Cuando termine todo, puede borrar este recordatorio.', icsTasks: 'Pendiente:'
    }
  };
  var ICON = { doc: '📄', email: '✉️', phone: '📞', online: '🌐', custom: '📝' };

  /* ---------------- load checklist (never touches done-state) ---------------- */
  var incoming = CC.readHashPayload(), list = null, notices = [];
  if (incoming) {
    var stored = CC.lsGet(NS + 'list.' + incoming.id, null);
    if (stored && (stored.rev || 0) > (incoming.rev || 0)) { list = stored; notices.push('olderLink'); }
    else { list = incoming; CC.lsSet(NS + 'list.' + list.id, list); }
  }
  window.addEventListener('hashchange', function () { location.reload(); });

  var app = $('app');
  if (!list) {
    renderLang('en');
    app.innerHTML = '<div class="card" style="margin-top:1rem"><h1>' + S.en.badLink + '</h1><p>' + S.en.badLinkTxt + '</p><hr><h1>' + S.es.badLink + '</h1><p>' + S.es.badLinkTxt + '</p></div>';
    return;
  }

  var CID = list.id;
  var K = { done: NS + 'done.' + CID, fields: NS + 'fields.' + CID, lang: NS + 'lang.' + CID, seen: NS + 'seen.' + CID, view: NS + 'view.' + CID };
  var doneMap = CC.lsGet(K.done, {});          // { taskId: {done, doneAt, updatedAt} }
  var fields = CC.lsGet(K.fields, {});
  var lang = CC.lsGet(K.lang, null) || (list.l === 'es' ? 'es' : 'en');
  var seen = CC.lsGet(K.seen, null);
  var tasks = list.t.filter(function (t) { return t.i === 'custom' || LIB.byId[t.i]; }); // removed tasks simply aren't in the link
  if (seen) { var nNew = tasks.filter(function (t) { return seen.indexOf(t.id) < 0; }).length; if (nNew) notices.push(['newTasks', nNew]); }
  CC.lsSet(K.seen, tasks.map(function (t) { return t.id; }));
  // Restore the open task only on a refresh; opening the link fresh starts at the overview.
  var nav = (performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {};
  var view = (nav.type === 'reload' && sessionStorage.getItem(K.view)) || 'overview';

  function T(key, vars) { var s = (S[lang][key] || S.en[key] || key); Object.keys(vars || {}).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); }); return s; }
  function tr(o) { return o ? (o[lang] || o.en || '') : ''; }
  function isDone(t) { return !!(doneMap[t.id] && doneMap[t.id].done); }
  function setDone(t, val) {
    // Re-read before writing so another open tab's changes are not lost.
    doneMap = CC.lsGet(K.done, {});
    var now = new Date().toISOString(), prev = doneMap[t.id] || {};
    doneMap[t.id] = { done: !!val, doneAt: val ? now : (prev.doneAt || null), updatedAt: now };
    CC.lsSet(K.done, doneMap);
  }
  window.addEventListener('storage', function (e) { if (e.key === K.done) { doneMap = CC.lsGet(K.done, {}); render(); } });

  function item(t) { return LIB.byId[t.i] || null; }
  function typeOf(t) { var it = item(t); return it ? it.type : 'custom'; }
  function title(t) { var it = item(t); return it ? tr(it.title) : (t.ti || 'Task'); }
  function sortKey(t) { return t.d || '9999-12-31'; }
  function openTasks() { return tasks.filter(function (t) { return !isDone(t); }).map(function (t, i) { return [t, i]; })
    .sort(function (a, b) { return sortKey(a[0]).localeCompare(sortKey(b[0])) || a[1] - b[1]; }).map(function (x) { return x[0]; }); }
  function doneTasks() { return tasks.filter(isDone).sort(function (a, b) { return (doneMap[b.id].doneAt || '').localeCompare(doneMap[a.id].doneAt || ''); }); }

  function dueInfo(d) {
    if (!d) return { cls: '', txt: T('noDue') };
    var n = CC.daysUntil(d), date = CC.fmtDate(d, lang);
    if (n < 0) return { cls: 'overdue', txt: T('overdue', { date: date }) };
    if (n === 0) return { cls: 'soon', txt: T('dueToday') };
    if (n === 1) return { cls: 'soon', txt: T('dueTomorrow') };
    if (n <= 3) return { cls: 'soon', txt: T('dueIn', { n: n }) };
    return { cls: '', txt: T('due', { date: date }) };
  }

  /* ---------------- language ---------------- */
  function renderLang(l) {
    document.documentElement.lang = l;
    document.querySelectorAll('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === l)); });
  }
  document.querySelectorAll('.lang button').forEach(function (b) {
    b.onclick = function () { lang = b.getAttribute('data-lang'); CC.lsSet(K.lang, lang); render(); };
  });

  /* ---------------- views ---------------- */
  function go(v) { view = v; sessionStorage.setItem(K.view, v); render(); window.scrollTo(0, 0); }

  function render() {
    renderLang(lang);
    $('firm').textContent = (list.a && list.a.name) || '';
    document.title = lang === 'es' ? 'Su lista' : 'Your checklist';
    var t = view !== 'overview' && tasks.filter(function (x) { return x.id === view; })[0];
    if (t) renderTask(t); else renderOverview();
  }

  function rowHTML(t) {
    var di = dueInfo(t.d), ty = typeOf(t);
    return '<button class="t-row" data-open="' + t.id + '"><span class="ic">' + ICON[ty] + '</span><span class="body"><b>' + CC.esc(title(t)) +
      '</b><span class="due ' + di.cls + '">' + CC.esc(di.txt) + '</span></span><span class="chev">›</span></button>';
  }

  function renderOverview() {
    $('bar').classList.add('hidden');
    var open = openTasks(), done = doneTasks(), total = tasks.length, pct = total ? Math.round(done.length / total * 100) : 0;
    var name = (list.c || '').split(' ')[0];
    var h = '';
    notices.forEach(function (n) { h += '<div class="notice info" style="margin-bottom:.6rem">' + (Array.isArray(n) ? T(n[0], { n: n[1] }) : T(n)) + '</div>'; });
    h += '<div class="hello"><h1>' + CC.esc(T('hi', { name: name })) + '</h1><p class="muted" style="margin:0">' + CC.esc(list.m || T('defaultMsg')) + '</p></div>';
    h += '<div style="margin:1rem 0"><div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><span style="width:' + pct + '%"></span></div>' +
         '<div class="small muted" id="progressText">' + T('progress', { done: done.length, total: total }) + '</div></div>';
    if (open.length) {
      var nx = open[0], di = dueInfo(nx.d);
      h += '<div class="card next-card"><div class="small muted">' + T('next') + '</div><h2 style="margin:.15rem 0">' + ICON[typeOf(nx)] + ' ' + CC.esc(title(nx)) + '</h2>' +
           '<div class="due ' + di.cls + '" style="margin-bottom:.6rem">' + CC.esc(di.txt) + '</div><button class="btn primary block" data-open="' + nx.id + '">' + T('start') + '</button></div>';
      h += '<h2 style="margin-top:1.25rem">' + T('open') + ' (' + open.length + ')</h2><div class="card" style="padding:.25rem .75rem" id="activeList">' + open.map(rowHTML).join('') + '</div>';
    } else {
      h += '<div class="card allset"><div class="big">🎉</div><h1>' + T('allDone') + '</h1><p>' + T('allDoneTxt') + '</p></div>';
    }
    h += '<details class="done-sec" id="doneSec"' + (sessionStorage.getItem(K.view + '.doneOpen') === '1' ? ' open' : '') + '><summary>' + T('doneSec', { n: done.length }) + '</summary><div class="card" style="padding:.25rem .75rem">' +
         (done.length ? done.map(function (t) { return '<div class="done-row" data-task="' + t.id + '"><span>✅</span><span class="tt">' + CC.esc(title(t)) + '</span><button class="btn small" data-restore="' + t.id + '">' + T('undo') + '</button></div>'; }).join('') : '<p class="muted small">—</p>') +
         '</div></details>';
    if (open.length) {
      var last = open.reduce(function (m, t) { return t.d && t.d > m ? t.d : m; }, '');
      var until = remUntil(last), time = (list.r && list.r.time) || '09:00';
      h += '<div class="card" style="margin-top:1rem"><h2>🔔 ' + T('remTitle') + '</h2><p class="small" style="margin:.2rem 0 .6rem">' +
           CC.esc(T('remTxt', { time: fmtTime(time), date: CC.fmtDate(until, lang) })) + '</p><button class="btn teal block" id="icsBtn">' + T('remBtn') + '</button>' +
           ((list.r && (list.r.email || list.r.sms)) ? '<p class="small muted" style="margin:.5rem 0 0">' + T('remSoon') + '</p>' : '') + '</div>';
    }
    h += contactHTML();
    h += '<footer class="c-foot"><p>' + T('device') + '</p><p>' + T('proto') + '</p><button class="btn small ghost" id="clearBtn">' + T('clear') + '</button></footer>';
    app.innerHTML = h;
    $('doneSec').addEventListener('toggle', function () { sessionStorage.setItem(K.view + '.doneOpen', $('doneSec').open ? '1' : '0'); });
    if ($('icsBtn')) $('icsBtn').onclick = downloadICS;
    $('clearBtn').onclick = function () {
      if (!confirm(T('clearConfirm'))) return;
      [K.done, K.fields, K.lang, K.seen, NS + 'list.' + CID].forEach(function (k) { localStorage.removeItem(k); });
      location.reload();
    };
  }

  function contactHTML() {
    var a = list.a || {}; if (!a.phone && !a.email) return '';
    return '<div class="card" style="margin-top:1rem"><h3>' + CC.esc(a.name || '') + '</h3><div class="row">' +
      (a.phone ? '<a class="btn small" href="tel:' + a.phone.replace(/[^\d+]/g, '') + '">📞 ' + CC.esc(a.phone) + '</a>' : '') +
      (a.email ? '<a class="btn small" href="mailto:' + CC.esc(a.email) + '">✉️ ' + CC.esc(a.email) + '</a>' : '') + '</div></div>';
  }
  function fmtTime(hm) { var p = hm.split(':'), d = new Date(2000, 0, 1, +p[0], +p[1]); return d.toLocaleTimeString(lang === 'es' ? 'es-US' : 'en-US', { hour: 'numeric', minute: '2-digit' }); }
  function remUntil(lastDue) { var min = CC.ymd(CC.addDays(CC.today(), 7)); return lastDue && lastDue > min ? lastDue : min; }

  function fieldsHTML(keys) {
    if (!keys.length) return '';
    return '<section class="card"><h3>' + T('yourInfo') + '</h3><div class="fields">' + keys.map(function (k) {
      return '<div><label for="f_' + k + '">' + CC.esc(CC.fieldLabel(k, lang)) + '</label><input id="f_' + k + '" data-field="' + k + '" value="' + CC.esc(fields[k] || '') + '"></div>';
    }).join('') + '</div><p class="small muted" style="margin:.4rem 0 0">' + T('yourInfoNote') + '</p></section>';
  }
  function listHTML(arr, check) {
    if (!arr || !arr.length) return '';
    return check ? '<ul class="checklist">' + arr.map(function (x) { return '<li><label><input type="checkbox"> <span>' + CC.fillHTML(tr(x), fields, lang) + '</span></label></li>'; }).join('') + '</ul>'
                 : '<ul>' + arr.map(function (x) { return '<li>' + CC.fillHTML(tr(x), fields, lang) + '</li>'; }).join('') + '</ul>';
  }

  function renderTask(t) {
    var it = item(t), ty = typeOf(t), open = openTasks(), done = isDone(t), di = dueInfo(t.d);
    var idx = open.indexOf(t);
    var h = '<div class="task"><button class="btn ghost" id="backBtn" style="padding-left:0">' + T('back') + '</button>';
    h += '<div class="meta"><span class="badge ' + ty + '">' + ICON[ty] + ' ' + tr(LIB.TYPES[ty]) + '</span>' +
         (idx >= 0 ? '<span class="small muted">' + T('taskOf', { i: idx + 1, n: open.length }) + '</span>' : '<span class="badge ok">✓</span>') + '</div>';
    h += '<h1>' + CC.esc(title(t)) + '</h1><div class="due ' + di.cls + '">' + CC.esc(di.txt) + '</div>';
    if (t.n) h += '<section class="att-note"><b>' + T('fromAtt') + ':</b> ' + CC.esc(t.n) + '</section>';
    if (!it) {
      h += '<section><p style="white-space:pre-wrap">' + CC.esc(t.tx || '') + '</p></section>';
    } else {
      h += '<section><p style="margin:0">' + CC.esc(tr(it.summary)) + '</p></section>';
      var keys = (it.fields || []).slice();
      [it.subject, it.body].forEach(function (x) { if (x) CC.fieldsIn(tr(x)).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
      if (ty === 'doc') {
        h += '<section><h3>' + T('where') + '</h3>' + listHTML(it.where) + '</section>';
        h += '<section><h3>' + T('accepted') + '</h3>' + listHTML(it.accepted, true) + '</section>';
      }
      if (ty === 'email') {
        h += '<section><h3>' + T('emailDraft') + '</h3><p class="small muted" style="margin:0 0 .4rem">' + CC.esc(T('emailHow', { who: (t.o && t.o.toName) || tr(it.toLabel) })) + '</p>' +
             (tr(it.bodyNote) ? '<p class="small notice info" style="margin:0 0 .5rem">' + CC.esc(tr(it.bodyNote)) + '</p>' : '') +
             '<div class="email-box"><div class="hdr"><b>' + T('to') + ':</b> <input id="emailTo" type="email" placeholder="' + T('recipientPh') + '" value="' + CC.esc(fields['__to_' + t.id] || (t.o && t.o.to) || '') + '"></div>' +
             '<div class="hdr"><b>' + T('subject') + ':</b> <span id="emailSubj"></span></div><pre id="emailBody"></pre></div>' +
             '<div class="row" style="margin-top:.6rem"><button class="btn" id="copyEmail">📋 ' + T('copy') + '</button><a class="btn primary grow" id="mailtoBtn">✉️ ' + T('openMail') + '</a></div>' +
             '<p class="small muted">' + T('afterSend') + '</p></section>' + fieldsHTML(keys);
      }
      if (ty === 'phone') {
        var num = it.phone || (t.o && t.o.phone ? '+1' + t.o.phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '') : '');
        var disp = it.phoneDisplay || (t.o && t.o.phone) || '';
        h += '<section>' + (num ? '<a class="callbtn" id="callBtn" href="tel:' + num + '"><small>📞 ' + T('call') + '</small>' + CC.esc(disp) + '</a>' : '<div class="notice">' + T('noNumber') + '</div>') + '</section>';
        h += '<section><h3>' + T('hours') + '</h3><p style="margin:0">' + CC.esc(tr(it.hours)) + '</p></section>';
        h += fieldsHTML(keys);
        h += '<section><h3>' + T('haveReady') + '</h3><div id="ready">' + listHTML(it.haveReady, true) + '</div></section>';
        h += '<section><h3>' + T('script') + '</h3><ol id="script">' + it.script.map(function (x) { return '<li>' + CC.fillHTML(tr(x), fields, lang) + '</li>'; }).join('') + '</ol></section>';
      }
      if (ty === 'online') {
        h += '<section><a class="btn primary block" href="' + it.url + '" target="_blank" rel="noopener noreferrer">🌐 ' + T('openSite') + '</a><p class="small muted" style="margin:.3rem 0 0;word-break:break-all">' + CC.esc(it.url) + '</p></section>';
        h += fieldsHTML(keys);
        h += '<section><h3>' + T('steps') + '</h3><ol id="steps">' + it.steps.map(function (x) { return '<li>' + CC.fillHTML(tr(x), fields, lang) + '</li>'; }).join('') + '</ol></section>';
      }
      if (it.tips && it.tips.length) h += '<section><h3>' + T('tips') + '</h3>' + listHTML(it.tips) + '</section>';
      if (it.links && it.links.length) h += '<section><h3>' + T('links') + '</h3><ul>' + it.links.map(function (l) { return '<li><a href="' + l.url + '" target="_blank" rel="noopener noreferrer">' + CC.esc(tr(l.label)) + '</a></li>'; }).join('') + '</ul></section>';
    }
    h += contactHTML() + '</div>';
    app.innerHTML = h;
    $('backBtn').onclick = function () { go('overview'); };

    // bottom bar
    $('bar').classList.remove('hidden');
    $('barIn').innerHTML = done ? '<button class="btn" id="reopenBtn">' + T('reopen') + '</button>'
      : '<button class="btn primary" id="doneBtn">' + (ty === 'doc' ? T('haveIt') : T('markDone')) + '</button>' + (open.length > 1 ? '<button class="btn" id="skipBtn">' + T('skip') + '</button>' : '');
    if ($('doneBtn')) $('doneBtn').onclick = function () {
      setDone(t, true); var rest = openTasks();
      toast(T('movedDone'), function () { setDone(t, false); go(t.id); });
      var nextT = rest.filter(function (x) { return sortKey(x) >= sortKey(t); })[0] || rest[0];
      go(nextT ? nextT.id : 'overview');
    };
    if ($('skipBtn')) $('skipBtn').onclick = function () { go(open[(idx + 1) % open.length].id); };
    if ($('reopenBtn')) $('reopenBtn').onclick = function () { setDone(t, false); toast(T('restored')); render(); };

    // live fill-ins
    app.querySelectorAll('input[data-field]').forEach(function (inp) {
      inp.addEventListener('input', function () { fields[inp.getAttribute('data-field')] = inp.value; CC.lsSet(K.fields, fields); refreshFills(t); });
    });
    if ($('emailTo')) $('emailTo').addEventListener('input', function () { fields['__to_' + t.id] = $('emailTo').value.trim(); CC.lsSet(K.fields, fields); refreshFills(t); });
    if ($('copyEmail')) $('copyEmail').onclick = function () { var e = emailParts(t); CC.copyText((e.to ? T('to') + ': ' + e.to + '\n' : '') + T('subject') + ': ' + e.subject + '\n\n' + e.body).then(function () { toast(T('copied')); }); };
    refreshFills(t);
  }

  function emailParts(t) {
    var it = item(t);
    return { to: fields['__to_' + t.id] || (t.o && t.o.to) || '', subject: CC.fillText(tr(it.subject), fields, lang), body: CC.fillText(tr(it.body), fields, lang) };
  }
  function refreshFills(t) {
    var it = item(t); if (!it) return;
    if (it.type === 'email') {
      $('emailSubj').innerHTML = CC.fillHTML(tr(it.subject), fields, lang);
      $('emailBody').innerHTML = CC.fillHTML(tr(it.body), fields, lang);
      var e = emailParts(t); $('mailtoBtn').href = CC.buildMailto(e.to, e.subject, e.body);
    }
    var lists = { script: it.script, steps: it.steps };
    Object.keys(lists).forEach(function (id) { if ($(id) && lists[id]) $(id).innerHTML = lists[id].map(function (x) { return '<li>' + CC.fillHTML(tr(x), fields, lang) + '</li>'; }).join(''); });
    if ($('ready') && it.haveReady) {
      $('ready').querySelectorAll('li span').forEach(function (sp, i) { sp.innerHTML = CC.fillHTML(tr(it.haveReady[i]), fields, lang); });
    }
  }

  /* ---------------- calendar reminder (.ics) ---------------- */
  function downloadICS() {
    var open = openTasks(); if (!open.length) return;
    var last = open.reduce(function (m, t) { return t.d && t.d > m ? t.d : m; }, '');
    var time = (list.r && list.r.time) || '09:00', p = time.split(':'), now = new Date();
    var start = CC.today(); if (now.getHours() * 60 + now.getMinutes() >= +p[0] * 60 + +p[1]) start = CC.addDays(start, 1);
    var desc = T('icsTasks') + '\n' + open.map(function (t) { return '• ' + title(t) + (t.d ? ' (' + CC.fmtDate(t.d, lang) + ')' : ''); }).join('\n') +
      '\n\n' + T('icsOpen') + '\n' + location.href + '\n\n' + T('icsFooter');
    var ics = CC.buildICS({ uid: CID + '-daily@client-checklist.local', summary: T('icsSummary', { n: open.length }), description: desc,
      url: location.href, time: time, startDate: start, untilYMD: remUntil(last), alarmText: T('icsAlarm') });
    CC.download('checklist-reminder.ics', ics, 'text/calendar;charset=utf-8');
    toast(T('remDl'));
    window.__lastICS = ics;
  }

  /* ---------------- toast ---------------- */
  var tt;
  function toast(msg, undo) {
    var el = document.querySelector('.toast') || document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toast' }));
    el.innerHTML = '<span>' + CC.esc(msg) + '</span>' + (undo ? '<button>' + T('undoBtn') + '</button>' : '');
    el.classList.remove('hidden'); if (undo) el.querySelector('button').onclick = function () { el.classList.add('hidden'); undo(); };
    clearTimeout(tt); tt = setTimeout(function () { el.classList.add('hidden'); }, 4000);
  }

  // Overview click delegation
  app.addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]'); if (o) { go(o.getAttribute('data-open')); return; }
    var r = e.target.closest('[data-restore]');
    if (r) { var t = tasks.filter(function (x) { return x.id === r.getAttribute('data-restore'); })[0]; setDone(t, false); toast(T('restored')); render(); }
  });

  render();
  window.__client = { doneMap: function () { return CC.lsGet(K.done, {}); }, list: list, checklistId: CID };
})();
