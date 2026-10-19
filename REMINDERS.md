# Design: daily reminders + synced progress (real version)

Goal: every client with unchecked tasks gets a short email and/or text once a day at the time the attorney
picked, until everything is done. Check-offs sync to the attorney, and reminders stop on their own.

## What the prototype does today
* The attorney view records reminder preferences (email/SMS, contact, time) inside the checklist data
  (`r: {email, sms, emailAddr, phone, time}`), labelled *"Reminders: coming in the real version"*.
* The client view offers **Add daily reminder to my calendar**, an `.ics` with `RRULE:FREQ=DAILY;UNTIL=…` plus a
  `VALARM`, listing the open tasks and the checklist link. It needs no server, but it can't know when tasks are done.
* Progress is stored **only on the client's device** (`localStorage`, keyed by checklistId + taskId). It survives
  refreshes, but not switching phones, and the attorney can't see it.

## Architecture (recommended: Supabase)
Supabase gives Postgres, Auth, row-level security (RLS), Edge Functions, and scheduled jobs (Supabase Cron /
`pg_cron`) in one hosted service. The **Free** plan works for development, but free projects pause after a week of
inactivity. Use **Pro (from $25/mo, includes $10 compute credit, daily backups kept 7 days)** for real client data.
Source: https://supabase.com/pricing. Alternative: Firebase on the **Blaze** plan (Cloud Functions, including
scheduled functions, require Blaze. Each Cloud Scheduler job is $0.10/mo, with 3 free per account).
Sources: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans,
https://firebase.google.com/docs/functions/schedule-functions.
**Either one needs an account the project owner would create** (and the firm should own it).

```
attorney (login + MFA) ──► web app ──► Supabase (Postgres + RLS + Auth)
client (secret link / magic link) ──► web app ──┘        │
                                   Supabase Cron (every 15 min) ──► Edge Function "send-reminders"
                                                                     ├─► email provider (Postmark / Resend)
                                                                     └─► Twilio SMS (A2P 10DLC)
inbound: Twilio webhook (STOP/HELP/START) ──► Edge Function ──► opt-out table
```

### Data model (sketch)
* `firms`, `attorneys` (Supabase Auth users, firm_id)
* `checklists`: id (the same `cl_…` ids), firm_id, client_name, lang, case_type, message, rev, created_by
* `checklist_tasks`: id (`tk_…`), checklist_id, library_item_id / custom title+text, due, note, overrides, sort, deleted_at
* `client_task_state`: checklist_id, task_id, **done, done_at, updated_at, updated_by_device**. This is the only progress table.
* `client_contacts`: checklist_id, email, phone, tz, reminder_time, email_opt_in_at, sms_opt_in_at, sms_opted_out_at, consent_text_version
* `client_access_tokens`: checklist_id, token_hash, expires_at, revoked_at. The link carries a random token, not the data.
* `reminder_log`: checklist_id, channel, sent_at, provider_message_id, status
* `audit_log`: who viewed/changed what, when

### Sync rule (this is what fixes "check-offs reappear")
* The client app sends **per-task** changes: `{task_id, done, updated_at}`. The server applies one only if
  `updated_at` is newer than the stored row (**newest wins per item**). The server **never** replaces a client's
  whole state with its own copy.
* On load, the app merges three sources by task id: local cache, server rows, and the current task list. A task that's
  done on any side with the newest timestamp stays done. New tasks start open. Deleted tasks (soft `deleted_at`) drop.
* Offline: queue changes locally and replay them when back online. The same rule makes replays harmless.
* Attorney edits to the task list never touch `client_task_state`.

### Daily job
Every 15 minutes, select checklists where the client's local time is within the window for `reminder_time`, there's
at least one open, non-deleted task, the client opted in on that channel, they haven't opted out, and nothing was sent
in the last 20 hours. Then send one short message, for example:
*"Hi Maria, 3 things left for your case (next: birth certificate, due Fri). Open: https://… Reply STOP to opt out."*
(The Spanish version goes to Spanish clients.) The job stops automatically when every task is done, the case is
closed, or the client opts out. Escalation is optional: notify the attorney when a task is X days overdue.

### Compliance and security
* **SMS consent.** Get the client's express opt-in (a checkbox on first open, or signed with the engagement letter). Store the
  consent text version and timestamp. Honor **STOP/UNSUBSCRIBE** right away, support **HELP**, and identify the
  firm in each message. Send only at reasonable local hours. Register the brand and campaign for **US A2P 10DLC** through
  Twilio (Low-Volume Standard brand if the firm has an EIN). Confirm TCPA obligations with counsel.
* **Email.** Use a transactional provider with SPF/DKIM/DMARC on the firm's domain, plus an unsubscribe link and suppression list.
* **Data.** Immigration data is highly sensitive. Use TLS everywhere, encrypt at rest, and protect every table with RLS
  (attorneys see only their firm, a client token sees only one checklist). Hash tokens and let them expire or be revoked. Attorneys use MFA.
  Keep audit logs and backups. Minimize data: reminder texts should not contain A-numbers, case details, or immigration status.
  Consider which providers will sign a DPA.
* **Attorney dashboard.** Every client, % done, overdue tasks, last activity, reminders sent and delivered, opt-out
  status, and a manual "nudge now" button.

## Rough monthly cost (pricing pages checked 2026-10-19)
Assumes **50 clients with open tasks**, one reminder per channel per day ≈ **1,500 messages/month per channel**.

| Item | Price used | Estimate / month | Source |
|---|---|---|---|
| Supabase Pro | $25/mo (includes $10 compute credit = one Micro project) | **$25** | https://supabase.com/pricing |
| Email: Resend Free *or* Postmark Basic | Resend: 3,000/mo free (100/day cap). Postmark: $15/mo for 10,000 | **$0–15** | https://resend.com/pricing · https://www.postmarkapp.com/pricing |
| SMS: Twilio long code | $0.0083/segment + carrier fee ≈ $0.0035–0.005 → ≈ $0.012–0.013/segment | 1,500 × 1–2 segments ≈ **$18–40** | https://www.twilio.com/en-us/sms/pricing/us |
| Twilio phone number | from $1.15/mo | **~$1.15** | https://www.twilio.com/en-us/pricing/messaging |
| A2P 10DLC campaign | $1.50–$10/mo per campaign (low-volume mixed $1.50) | **$1.50–10** | https://www.twilio.com/en-us/phone-numbers/a2p-10dlc |
| A2P 10DLC one-time | brand ≈ $4–4.50 (low-volume standard). $15 campaign vetting. Standard brand adds $41.50 vetting | **~$20–60 once** | https://www.twilio.com/en-us/phone-numbers/a2p-10dlc · https://www.twilio.com/docs/trust-hub/registrations/a2p-10dlc-brand |

**Total ≈ $45–90/month** for ~50 active clients on both channels (≈ $30–35 with email only). At 10 active clients,
SMS drops to ~$4–8. Notes: a Spanish text with accents (á, é, ñ) uses UCS-2 encoding, so one segment holds 70 characters,
not 160. Keep reminders short, or budget 2 segments. Failed messages cost $0.001 each. Prices change, so re-check before launch.

## Migration from the prototype
The ids already match. `cl_…` checklist ids and `tk_…` task ids become primary keys. On first load against the
backend, the client app uploads its local `cc.client.v1.done.<checklistId>` entries through the same newest-wins
rule, so nobody loses progress. Hash links get swapped for short token links (`/c/<token>`).
