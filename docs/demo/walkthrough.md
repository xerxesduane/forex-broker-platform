# Aurion Markets — demonstration walkthrough

A script for showing this platform to a client, and a plain statement of
what is real and what is simulated. Roughly 15 minutes end to end; the
short version at the bottom takes five.

Every account below uses the password **`AurionDemo!2026`**.

---

## 1. What this is

Aurion Markets is a working Forex brokerage operations platform: a public
site, a client portal, and a back-office console, over a Postgres database
with row-level security, an immutable double-entry ledger and an audit
trail.

It is **not** a trading terminal. There are no charts, order tickets or
open positions, and that is a deliberate boundary rather than a gap —
execution belongs in MetaTrader 5. This platform is everything around it:
onboarding, verification, funding, account provisioning, partner payouts,
support and the controls over all of them.

Every integration runs in **simulation mode**. No real MT5 server, payment
provider, KYC vendor, email or SMS gateway is contacted at any point, and
no real personal data exists anywhere in the dataset. Simulated values are
labelled as such in the interface, not just in the code.

---

## 2. Sign-in credentials

### Client portal — `/portal`

| Who              | Email                                       | What they show                                                                |
| ---------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| Samuel Reyes     | `samuel.reyes@demo.aurion-markets.test`     | The full picture: verified, funded, live + demo accounts, transaction history |
| Aisha Rahman     | `aisha.rahman@demo.aurion-markets.test`     | A large withdrawal held for a second approver; an open support ticket         |
| Imogen Hale      | `imogen.hale@demo.aurion-markets.test`      | An active Introducing Broker with a downline and commission history           |
| Grace Oyelowo    | `grace.oyelowo@demo.aurion-markets.test`    | Verification sent back for more information                                   |
| Viktor Ostrovsky | `viktor.ostrovsky@demo.aurion-markets.test` | A restricted account — funding is blocked, with the reason shown              |
| Jordan Ellery    | `jordan.ellery@demo.aurion-markets.test`    | A brand-new client at step one                                                |

### Admin console — `/admin`

| Role                | Email                                    | Sees                                                             |
| ------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Super Administrator | `ava.morgan@aurion-markets.example`      | Everything                                                       |
| KYC Analyst         | `noah.whitfield@aurion-markets.example`  | Verification queue only — no money, no settings                  |
| Finance Operator    | `priya.desai@aurion-markets.example`     | Deposits, withdrawals, ledger — read and prepare, cannot approve |
| Head of Finance     | `marcus.oyelaran@aurion-markets.example` | Can approve money movement and post adjustments                  |
| Finance Approver    | `yuki.tanaka@aurion-markets.example`     | The second signature on a large withdrawal                       |
| Support Agent       | `lena.brooks@aurion-markets.example`     | Tickets and client context — no money, no compliance decisions   |
| Trading Operations  | `tomas.iversen@aurion-markets.example`   | Account provisioning and lifecycle                               |
| Partnerships        | `sofia.marchetti@aurion-markets.example` | Partners, commissions, rebates                                   |
| Administrator       | `rachel.okonkwo@aurion-markets.example`  | Staff, roles, settings, integrations                             |
| Auditor             | `henry.laurent@aurion-markets.example`   | Read-only across everything                                      |

> **Worth doing live:** sign in as the KYC Analyst and then as the Head of
> Finance. The navigation, the pages and the buttons differ, because they
> are driven by the same permission checks the server enforces — not by a
> separate list of what to hide.

---

## 3. The full walkthrough

### Act 1 — A client arrives (3 min)

1. Open the public site. Note the demonstration banner: it never comes off.
2. **Register** a new account with any email. You land in the portal on a
   four-step checklist.
3. Complete the profile, then submit **verification**. Attach any small
   text file — the document-storage adapter is simulated and stores
   metadata only.
4. Note the status: _Submitted_. The client is told what happens next in
   plain language.

### Act 2 — The back office responds (4 min)

5. In a second browser (or a private window), sign in to `/admin` as
   **Noah Whitfield**, the KYC Analyst.
6. The new case is at the top of the **KYC queue**. Open it and **claim**
   it — the case is now assigned, so two analysts cannot work it in
   parallel.
7. Accept or reject each document individually, add an internal risk flag,
   then **approve** with a reason.
8. Scroll to **Audit evidence** on the same page. Every step you just took
   is there with your name, your role, the reason and a correlation ID.

### Act 3 — Money moves (5 min)

9. Back in the client portal, refresh. Verification is approved and the
   wallet has unlocked.
10. **Deposit** $1,000. The simulated provider returns instructions and a
    reference; press *Simulate provider confirmation* to stand in for the
    webhook. Because $1,000 is under the auto-credit limit, it posts
    immediately and the balance moves.
11. Now deposit **$5,000**. This one stops at _confirmed_ and queues for
    finance — the threshold is a setting, not a hardcoded number.
12. In the admin console as **Marcus Oyelaran** (Head of Finance), open
    **Deposits** and credit it.
13. Open **Wallets & ledger**. At the top: the trial balance, with debits
    and credits equal. Below it, the chart of accounts and the individual
    entries — including your deposit, as a debit to clearing and a credit
    to the client's wallet.

### Act 4 — The control that matters (3 min)

14. As the client, request a **$6,000 withdrawal**. Note that the balance
    drops the moment you submit: the funds are reserved by a real ledger
    posting, so the same money cannot be spent twice while the request is
    queued.
15. In **Withdrawals**, as Marcus, approve it. It does _not_ pay out — the
    queue shows _1 of 2_ approvals.
16. Try to approve it again as Marcus. The platform refuses: the second
    signature must come from a different person. That rule is enforced in
    the interface, in the server action, and by a unique constraint in the
    database.
17. Sign in as **Yuki Tanaka**, the second approver, and approve. Now it
    releases, and _Mark paid_ posts the payout.
18. Optional: **reject** a different pending withdrawal instead. The money
    returns to the client — but look at the ledger: it comes back as a new
    reversing entry that points at the original. Nothing was deleted.

---

## 4. Things worth pointing at

These are the parts that tend to separate this from an off-the-shelf
broker CRM.

**The trial balance is a live check, not a report.**
`/admin/ledger` recomputes debits and credits on every load and shows
pass or fail. It has never failed, because the only path into the ledger
is a database function that refuses an unbalanced posting. Try it: the
schema has no editable balance column to change.

**The audit log cannot be rewritten.**
`/admin/audit`. UPDATE and DELETE on that table raise an exception at the
database level — not "no policy grants it", but an outright refusal that
also binds the service role. The same is true of ledger entries.

**Permissions are one system, not two.**
`/admin/staff` holds a live matrix of 9 roles against 24 atomic
permissions. Tick a box and the change takes effect immediately — in the
console, in every server action, and in the row-level security policies,
because all three check the same key.

**Settings actually drive behaviour.**
`/admin/settings`. Change the deposit auto-credit limit to $100, then make
a $500 deposit as a client: it now queues for review instead of posting
straight through. The same is true of the dual-approval threshold and the
withdrawal fee.

**Integrations are honest about being simulated.**
`/admin/integrations` lists every adapter call ever made, with its
idempotency key, so a retry can be told from a duplicate. Going live means
writing one real adapter behind an interface that already exists — not
rewriting the platform.

---

## 5. The five-minute version

If time is short:

1. `/admin` as Ava Morgan → the **dashboard**: live queues, money in and
   out, and what needs attention.
2. **Wallets & ledger** → the trial balance, square, with the entries
   underneath it.
3. **Withdrawals** → the $6,400 item showing _1 of 2_ approvals, and the
   explanation of why it cannot move yet.
4. **Staff & roles** → the permission matrix.
5. `/portal` as Samuel Reyes → what the client sees: their balance, their
   statement, their accounts.

---

## 6. What is simulated, precisely

| Area        | In this build                                                                   | For a live launch                                                        |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| MT5         | Simulated adapter; logins prefixed 8/9 so they cannot be mistaken for real ones | A reviewed MT5 Manager API adapter behind the same interface             |
| Payments    | Simulated provider; the confirmation step is a button instead of a webhook      | A real PSP adapter plus signed inbound webhooks (helper already present) |
| KYC         | Simulated vendor; documents are metadata only                                   | A real provider; document storage is already private and RLS-protected   |
| Email / SMS | Written to the integration log, never sent                                      | A transactional provider; templates are already admin-editable           |
| Identities  | Fictional, on reserved non-resolvable domains                                   | Real client data, under the retention policy in the AML document         |
| Money       | No real funds move at any point                                                 | Not in scope without regulatory authorisation                            |

The ledger, the permission system, the audit trail, the state machines and
the row-level security are **not** simulated. Those are the parts that
would carry over unchanged.

---

## 7. Known limits

Stated plainly, because a client will find them anyway:

- **Two-factor is available but not enforced.** Clients can enrol and it
  works (real TOTP, verified against the RFC test vectors); requiring it
  at sign-in is an auth-layer change, not built here.
- **One currency.** The schema is multi-currency and the money code
  refuses to mix currencies without an explicit rate, but only USD wallets
  are provisioned and there is no FX conversion.
- **No scheduled jobs.** MT5 snapshot refreshes are on demand rather than
  on a timer.
- **The provider confirmation step is manual** so it is visible during a
  demonstration. In production it would arrive as a signed webhook.
- **Commission is calculated on credited deposits**, not on traded volume,
  because this build has no trading data to calculate volume from.
