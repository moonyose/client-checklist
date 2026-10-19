import sys, re
from icalendar import Calendar
from dateutil.rrule import rrulestr
raw = open(sys.argv[1], 'rb').read()
txt = raw.decode('utf-8')
assert '\r\n' in txt and not re.search(r'(?<!\r)\n', txt), 'lines must end with CRLF'
for ln in txt.split('\r\n'):
    assert len(ln.encode('utf-8')) <= 75, 'line > 75 octets: %r' % ln
cal = Calendar.from_ical(raw)
ev = [c for c in cal.walk('VEVENT')]; assert len(ev) == 1
ev = ev[0]
alarms = [c for c in ev.walk('VALARM')]; assert len(alarms) == 1 and str(alarms[0]['ACTION']) == 'DISPLAY'
rr = ev['RRULE'].to_ical().decode()
assert re.fullmatch(r'FREQ=DAILY;UNTIL=\d{8}T\d{6}', rr), rr
dt = ev['DTSTART'].dt
rule = rrulestr('RRULE:' + rr, dtstart=dt)
occ = list(rule)
assert len(occ) >= 1
until = rule._until
assert dt.tzinfo is None and until.tzinfo is None, 'floating DTSTART must have floating UNTIL'
print('ICS OK: DTSTART', dt, '| RRULE', rr, '| occurrences', len(occ), '| first', occ[0], '| last', occ[-1])
print('SUMMARY:', ev['SUMMARY'])
print('DESCRIPTION:\n' + str(ev['DESCRIPTION'])[:600])
