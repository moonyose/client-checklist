/* Shared helpers: link encoding, ids, dates, templates, storage, ICS. */
(function (global) {
  'use strict';
  var LZ = global.LZString;
  var SCHEMA = 1;

  function uid(prefix) {
    var a = new Uint8Array(6);
    (global.crypto || global.msCrypto).getRandomValues(a);
    return prefix + Array.prototype.map.call(a, function (b) { return ('0' + b.toString(36)).slice(-2); }).join('');
  }

  /* ---- Link payload ----
   * The link carries ONLY checklist definition (never client progress):
   * { v, id, rev, c (client name), l (lang), ct (case type), a {name,phone,email},
   *   m (message), r {email,sms,emailAddr,phone,time}, t: [{id, i (library id|'custom'),
   *   d (due YYYY-MM-DD), n (note), o {to,toName,phone}, ti (custom title), tx (custom text)}] }
   */
  function encodePayload(obj) { return LZ.compressToEncodedURIComponent(JSON.stringify(obj)); }
  function decodePayload(str) {
    try {
      var json = LZ.decompressFromEncodedURIComponent(str);
      if (!json) return null;
      var o = JSON.parse(json);
      if (!o || !o.id || !Array.isArray(o.t)) return null;
      return o;
    } catch (e) { return null; }
  }
  function readHashPayload() {
    var m = /[#&]d=([^&]+)/.exec(global.location.hash);
    return m ? decodePayload(m[1]) : null;
  }

  /* ---- Dates (all due dates are local calendar dates YYYY-MM-DD) ---- */
  function parseYMD(s) { if (!s) return null; var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function ymd(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function addDays(d, n) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function today() { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); }
  function daysUntil(s) { var d = parseYMD(s); if (!d) return null; return Math.round((d - today()) / 86400000); }
  function fmtDate(s, lang) {
    var d = parseYMD(s); if (!d) return '';
    return d.toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'long', day: 'numeric' });
  }

  /* ---- Templates ---- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fieldLabel(key, lang) { var f = global.CC_LIBRARY.FIELD_DEFS[key]; return f ? (f[lang] || f.en) : key; }
  // Plain text fill; empty fields become [label]
  function fillText(tpl, values, lang) {
    return String(tpl || '').replace(/\{\{(\w+)\}\}/g, function (_, k) {
      var v = values && values[k] && String(values[k]).trim();
      return v ? v : '[' + fieldLabel(k, lang) + ']';
    });
  }
  // HTML fill; blanks highlighted
  function fillHTML(tpl, values, lang) {
    return String(tpl || '').split(/(\{\{\w+\}\})/).map(function (part) {
      var m = /^\{\{(\w+)\}\}$/.exec(part);
      if (!m) return esc(part);
      var v = values && values[m[1]] && String(values[m[1]]).trim();
      return v ? '<mark class="filled">' + esc(v) + '</mark>' : '<mark class="blank" data-field="' + m[1] + '">' + esc(fieldLabel(m[1], lang)) + '</mark>';
    }).join('');
  }
  function fieldsIn(tpl) { var out = []; String(tpl || '').replace(/\{\{(\w+)\}\}/g, function (_, k) { if (out.indexOf(k) < 0) out.push(k); }); return out; }

  function buildMailto(to, subject, body) {
    var q = 'subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body.replace(/\r?\n/g, '\r\n'));
    return 'mailto:' + (to ? encodeURIComponent(to).replace(/%40/g, '@') : '') + '?' + q;
  }

  /* ---- Storage ---- */
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /* ---- ICS (RFC 5545) ---- */
  function icsEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function icsFold(line) {
    // fold at 75 octets (UTF-8 aware)
    var out = [], cur = '', curBytes = 0, enc = new TextEncoder();
    for (var ch of line) {
      var b = enc.encode(ch).length;
      if (curBytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; curBytes = 0; }
      cur += ch; curBytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
  }
  function icsUTC(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  /**
   * opts: {uid, summary, description, url, time 'HH:MM', startDate Date, untilYMD 'YYYY-MM-DD', alarmText}
   * Uses floating local time (no TZID) so it fires at the same wall-clock time wherever the client is;
   * UNTIL is then also floating per RFC 5545 §3.3.10.
   */
  function buildICS(opts) {
    var t = (opts.time || '09:00').split(':');
    var s = opts.startDate;
    var dt = s.getFullYear() + ('0' + (s.getMonth() + 1)).slice(-2) + ('0' + s.getDate()).slice(-2) + 'T' + ('0' + t[0]).slice(-2) + ('0' + t[1]).slice(-2) + '00';
    var until = opts.untilYMD.replace(/-/g, '') + 'T235959';
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Client Checklist Prototype//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + opts.uid,
      'DTSTAMP:' + icsUTC(new Date()),
      'DTSTART:' + dt,
      'DURATION:PT15M',
      'RRULE:FREQ=DAILY;UNTIL=' + until,
      'SUMMARY:' + icsEscape(opts.summary),
      'DESCRIPTION:' + icsEscape(opts.description),
      'URL:' + opts.url,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:' + icsEscape(opts.alarmText || opts.summary), 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function copyText(text) {
    if (navigator.clipboard && global.isSecureContext) return navigator.clipboard.writeText(text);
    var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove(); return Promise.resolve();
  }

  global.CC = {
    SCHEMA: SCHEMA, uid: uid, encodePayload: encodePayload, decodePayload: decodePayload, readHashPayload: readHashPayload,
    parseYMD: parseYMD, ymd: ymd, addDays: addDays, today: today, daysUntil: daysUntil, fmtDate: fmtDate,
    esc: esc, fieldLabel: fieldLabel, fillText: fillText, fillHTML: fillHTML, fieldsIn: fieldsIn, buildMailto: buildMailto,
    lsGet: lsGet, lsSet: lsSet, buildICS: buildICS, download: download, copyText: copyText
  };
})(window);
