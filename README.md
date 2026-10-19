# Client Checklist — prototype

A small website an immigration attorney can use to send a client a link that walks them, one step at a
time, through everything they have to do themselves: gather documents, request records by email
(with the email already written), call agencies (tap-to-call number, hours, and a script), and fill out
online requests. English and Spanish.

> **Prototype.** Static site (runs locally or on GitHub Pages). No backend, no accounts, nothing stored on a server, no real client data.
> **Every task template is an example.** The attorney must review the wording before sending it to a client. Not legal advice.

## Run it

```bash
cd /workspace/client-checklist
./serve.sh            # → http://127.0.0.1:8437/  (any static server works)
```

Or just open `index.html` in a browser (file:// works too).

* `index.html`: attorney view
* `client.html#d=…`: client view (the link the attorney sends)

The attorney view opens with a filled-in example client, **Maria Example** (family-based green card,
Spanish). Click **Generate client link → Open client view** to see what she would get.

## How it works

### Attorney view (`index.html`, `js/attorney.js`)
1. **Client**: name, language (EN/ES), case type (family-based green card, naturalization, asylum,
   DACA renewal, other). **Add suggested tasks** pulls a starting set for that case type. There's a default due
   date plus a due date per task. You can also set a message to the client and the office contact info.
2. **Daily reminders (coming in the real version)**: email and/or SMS, the contact for each, and a time of day.
   These are saved into the checklist data now so a future backend can use them (see `REMINDERS.md`).
3. **Quick add (type or dictate)**: free text like *"Birth certificate, tax transcripts and police clearance
   by November 15; employment letter in 2 weeks; letter from her pastor by Friday"* becomes tasks.
   Recognized items map to the library (EN or ES keywords). Anything else becomes a custom task. Dates it understands:
   "Nov 15", "15 de noviembre", "11/15", "2026-11-15", "in 2 weeks", "next week", "tomorrow", "by Friday".
   One date inside a clause applies to every item in that clause. The 🎤 button uses the browser's speech
   recognition where available (Chrome/Edge/Safari). Otherwise use the phone/OS keyboard dictation.
4. **Tasks**: reorder, remove, due date, note to client. Email tasks take a recipient name/address
   (e.g. the client's HR). Placeholder phone tasks take the number to call. Each task has a template preview.
5. **Task library**: 26 built-in tasks in 4 types (document, email, phone, online/mail), searchable.
6. **Share**: **Generate client link** packs the checklist into the link and shows its version and length.
   If you change something after generating, the link is marked as changed until you generate it again.

**Drafts persist.** Every edit autosaves to this browser's `localStorage` (`cc.attorney.v1`). The client list
on the left survives refreshes and restarts. Each checklist has a stable `checklistId` (`cl_…`) and each
task a stable `taskId` (`tk_…`), and both are created once and never regenerated.

### The link
`client.html#d=<LZ-string compressed JSON>`. The payload carries only the checklist definition
(ids, library item ids, due dates, notes, recipient overrides, attorney contact, reminder prefs) and never
any client progress. The library text itself ships with the app, so links stay short (~1–1.5k characters for
11 tasks). The data sits in the `#fragment`, which browsers do not send to servers, and the page sets
`referrer: no-referrer`.

### Client view (`client.html`, `js/client.js`)
* Mobile-first. Shows a greeting, the attorney's message, a progress bar, an **Up next** card, and the **To do**
  list sorted by due date. Due-date wording is gentle ("Due in 2 days, coming up soon", "Was due Oct 18.
  That's OK, please do it as soon as you can").
* **One task at a time**, with **Mark as done / I have it** and **Skip for now** in a fixed bottom bar.
  Marking a task done moves it to a **collapsed "Done" section** and opens the next one. **Undo** (toast) and
  **Restore** (in Done) put a task back.
* **Email tasks** show the drafted email with live fill-in fields (name, employer, dates…). Blanks
  are highlighted until filled. There's an editable **To** field, **Copy email**, and **Open in my email app** (a `mailto:`
  link with URL-encoded subject/body and CRLF line breaks). Emails that go to employers, schools, courts, and county
  clerks stay in English even in Spanish mode, with a Spanish explanation of what the email says.
* **Phone tasks** show a big tap-to-call button (`tel:+1…`), hours, a "have this ready" checklist, and a
  numbered script with the client's details filled in.
* **Online/mail tasks** have an "Open the website" button and numbered steps. **Document tasks** list where to find
  the document, what is accepted (including substitutes), and tips. There's no upload in the prototype.
* **Spanish toggle** (top right). It defaults to the language the attorney chose, and the client's own choice is remembered.
* **Add daily reminder to my calendar** downloads an `.ics` file with one event that repeats daily
  (`RRULE:FREQ=DAILY;UNTIL=<latest due date>`, at least 7 days out) at the attorney's chosen time, with a
  `VALARM`. The description lists the tasks still open plus the checklist link. It uses floating local time, so
  it rings at, say, 6 PM wherever the client is. It works with no server.

### Progress never resets (the "check-offs reappear" bug)
* Done-state lives **separately from the link** in `localStorage` key `cc.client.v1.done.<checklistId>`
  → `{ <taskId>: { done, doneAt, updatedAt } }`. Opening any link (the same one, an old one, or an updated one) never
  writes to it. Only the client's own taps do, and each write re-reads storage first so two open tabs don't
  clobber each other (a `storage` event keeps tabs in sync).
* **Updated links merge by task id.** The attorney edits the checklist and generates a new link (version
  number goes up). Done tasks stay done, new tasks show up open (with a "your attorney added 1 new task" note),
  and removed tasks drop from the list. Each newer version is cached
  (`cc.client.v1.list.<checklistId>`). If the client later opens an **older** link, the newer version is
  still shown.
* Covered by the headless tests: check off 2 → refresh → still done (in Done); close tab → reopen →
  still done; open an updated link with 1 extra task → the 2 are still done and the new one is open; open the
  old link again → still the newest version; a task removed in v3 drops while done tasks stay done.

**Important limitation:** in the prototype, progress lives **on the client's device only**. It survives
refreshes and restarts. It does **not** follow the client to another phone or browser, and the attorney **can't see** it.
The real version keeps state on a backend (below).

## Agency info verified (2026-10-19)
Only these public-agency numbers/links are hard-coded. Everything else is a clearly marked placeholder.

| Used for | Number / link | Source |
|---|---|---|
| IRS transcripts by phone (automated, 24/7, mailed in 5–10 days) | 800-908-9946 | https://www.irs.gov/individuals/get-transcript · hours: https://www.irs.gov/individuals/transcript-services-for-individuals-faqs |
| IRS Get Transcript online / by mail | https://www.irs.gov/individuals/get-transcript | same, plus https://www.irs.gov/taxtopics/tc156 |
| USCIS FOIA (online-only since Jan 22, 2026) | https://first.uscis.gov/ | https://www.uscis.gov/records/request-records-through-the-freedom-of-information-act-or-privacy-act |
| USCIS Contact Center (live M–F 8am–8pm ET; TTY 800-767-1833) | 800-375-5283 | https://www.uscis.gov/contactcenter |
| FBI Identity History Summary ($18, fingerprints) | https://www.edo.cjis.gov/ | https://www.edo.cjis.gov/ and https://www.fbi.gov/how-we-can-help-you/more-fbi-services-and-information/identity-history-summary-checks/identity-history-summary-checks-faqs |
| FBI CJIS questions / fee waiver | 304-625-5590, identity@fbi.gov | same FBI FAQ. Phone **hours are not published**, so the app says so |
| U.S. vital records offices by state | https://www.cdc.gov/nchs/w2w/index.htm | https://www.cdc.gov/nchs/w2w/guidelines.htm (also the "what to include" list used in scripts) |
| Foreign civil documents & police certificates by country | https://travel.state.gov/content/travel/en/us-visas/Visa-Reciprocity-and-Civil-Documents-by-Country.html | same, plus https://travel.state.gov/content/travel/en/us-visas/immigrate/the-immigrant-visa-process/step-5-collect-financial-evidence-and-other-supporting-documents/step-7-collect-civil-documents.html |

These are **placeholders**: county clerk / court / employer / school email addresses, the vital-records phone and
consulate phone tasks (the attorney fills in the number), and the office contact info. The CBP I-94 link is
included but marked unverified in the data.

## Files
```
index.html            attorney view
client.html           client view
css/styles.css        shared styles (calm navy/teal, system fonts)
js/library.js         task library (EN/ES), case-type presets, fill-in field labels, verified sources
js/common.js          link encode/decode, dates, template fill, mailto, storage, .ics builder
js/parse.js           type/dictate → tasks parser
js/attorney.js        attorney view logic (drafts persistence, link generation)
js/client.js          client view logic (walkthrough, done-state, merge, reminders)
vendor/lz-string.min.js  LZ-String 1.5 (MIT), vendored so it works offline
serve.sh              local static server (port 8437)
REMINDERS.md          design doc for real reminders + backend + cost estimate
shots/                screenshots + a sample .ics from the test run
test/run-tests.js     headless Chrome end-to-end tests (45 checks)
test/validate_ics.py  parses the downloaded .ics with icalendar + dateutil and expands the RRULE
test/fileurl-smoke.js checks the app also works from file://
```

### Run the tests
```bash
./serve.sh &                                   # port 8437
cd test && npm install && python3 -m venv .venv && .venv/bin/pip install icalendar python-dateutil
node run-tests.js && node fileurl-smoke.js
```

## Limitations (prototype only)
* **The hash-link approach is a prototype technique only.** Anyone who has the link can read the checklist (the
  client's first name, case type, task list, notes). Links get forwarded, synced, and stored in browser
  history. Immigration data is sensitive, so the real version needs a backend with authentication,
  encryption, and access control. Until then, keep identifying details out of notes.
* Progress, fill-in details, and language live only in the client's browser. They're not synced, and the attorney can't see them.
* No reminders are actually sent. The calendar file is a static snapshot (it won't update when tasks are done,
  so the client deletes it when finished).
* No file uploads. The client sends documents to the office the usual way.
* Two languages. Attorney-written notes and messages show exactly as typed (not translated).
* The library is bundled. If the template wording changes, old links show the new wording (fine for templates, but
  worth versioning in the real version).
* The templates have not had legal review.

## Suggested next steps for a real version
1. **Backend + accounts.** Attorney login (with MFA), a per-client secret link or magic-link login, data
   encrypted at rest and in transit, row-level access control, and audit logs. A concrete option is **Supabase**
   (Postgres + Auth + row-level security + scheduled jobs). The free tier is fine for building, and **Pro ($25/mo)** is
   recommended for real client data (no auto-pause, daily backups). Firebase (Blaze plan) is a reasonable
   alternative. Either needs an account the **project owner would create**. Details are in `REMINDERS.md`.
2. **Synced progress with safe merging.** Each task row stores `done`, `doneAt`, `updatedAt`. The client app sends
   per-task changes, and the server keeps the newest `updatedAt` per task. **Never do a blanket server overwrite of the
   client's state.** Keep the local cache as an offline fallback and merge it with the server on load.
3. **Reminders by SMS/email** that nudge clients daily until done and stop automatically when everything is
   checked off. That needs opt-in/STOP handling and A2P 10DLC registration (`REMINDERS.md`).
4. **Attorney dashboard** with every client's progress, overdue items, last activity, and a one-click "nudge".
5. **File uploads** (encrypted storage with malware scanning) so "I have it" can include the document itself.
6. **More languages** (e.g. Haitian Creole, Portuguese, Mandarin, Vietnamese) with professional translation.
7. **Legal review of every template** by the attorney, plus a review/approval flag and version per template, and
   firm-specific edits.
8. Template editor for the office's own tasks, state- and country-specific variants, and printable PDF checklists.
