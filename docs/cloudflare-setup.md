# Cloudflare Setup — From Zero

Target repo path: `docs/cloudflare-setup.md`

You do this **once, by hand, before opening Claude Code**. About 30 minutes.

Do it yourself rather than delegating it. Half these steps are browser clicks an agent can't make, and the other half produce IDs and tokens that need to end up in the right place. An agent that has to guess your `database_id` will invent one, and you'll spend longer debugging that than doing this.

At the end you'll have four values written down. Task `F-02` needs them.

---

## Before you start

```bash
node -v      # need a current LTS. If this errors or says < 20, install from nodejs.org
git --version
npx wrangler --version   # downloads wrangler on first run; confirms Node is new enough
```

`wrangler` is Cloudflare's CLI. You don't install it globally — `npx wrangler` runs the version pinned in your project, which is what CI will use too.

---

## Step 1 — Account

Go to **dash.cloudflare.com/sign-up**. Email and password, then verify the email.

Cloudflare will immediately push you to **add a website or domain**. **Skip it.** You don't need a domain. Workers gives you a free subdomain and your app will be reachable from day one. Look for "I'll do this later", or just navigate away to the dashboard.

No card is needed at this point.

---

## Step 2 — Claim your `workers.dev` subdomain

In the left sidebar: **Compute (Workers)** → **Workers & Pages**.

The first time you land here, Cloudflare asks you to choose an account subdomain. Pick something short — this is effectively permanent and it's the second half of every URL you'll use:

```
https://sticker-collector.<your-subdomain>.workers.dev
```

Write the subdomain down.

---

## Step 3 — Log wrangler in

```bash
npx wrangler login
```

A browser tab opens asking you to authorise wrangler. Approve it. Then confirm:

```bash
npx wrangler whoami
```

That prints your email and, usefully, your **Account ID**. Write the Account ID down — it's a 32-character hex string.

If you ever need it from the dashboard instead: **Workers & Pages** → the right-hand sidebar, under *Account details*.

---

## Step 4 — Create the database

```bash
npx wrangler d1 create sticker-collector
```

Output looks roughly like:

```
✅ Successfully created DB 'sticker-collector'

[[d1_databases]]
binding = "DB"
database_name = "sticker-collector"
database_id = "a1b2c3d4-...-...."
```

**Copy that `database_id`.** It goes into `wrangler.jsonc` in task `F-02`. Nothing else can produce it.

Optionally create the preview database now too, so `F-08` doesn't stall:

```bash
npx wrangler d1 create sticker-collector-preview
```

No card required. D1's free tier is genuinely free.

---

## Step 5 — Object storage: read this before clicking

This is the one place your spec's *"free forever, no card"* constraint breaks. Cloudflare requires a payment method on file to activate R2, even though the free tier is real and generous (10 GB, no egress fees) and you will not come close to exceeding it.

Your app stores roughly **9 MB per 60-sticker album**, so 10 GB is about a thousand albums. You are never going to be billed. But you do have to hand over a card to open the door.

### Option A — Activate R2 ✅ **this is the chosen path**

Dashboard → **R2 Object Storage** in the sidebar → follow the activation prompt → add a payment method.

Two cautions while you're in there:

- **Decline any prompt to upgrade to the Workers Paid plan.** It's $5/month and you don't need it. At least one user has reported being charged $5 immediately after adding a card to enable R2 — that charge is the Workers Paid subscription, not R2 itself. Read the confirmation screen before you accept it.
- Immediately afterwards, set a spend alert: **Manage Account → Notifications → Add → Billing usage**. Threshold at $1. Belt and braces.

Then:

```bash
npx wrangler r2 bucket create sticker-collector-images
npx wrangler r2 bucket create sticker-collector-images-preview
npx wrangler r2 bucket list     # verify
```

### Option B — No card: store images in D1 instead *(not taken — kept for reference)*

Perfectly workable at your scale, and it keeps the whole stack card-free.

Images become rows in an `image(key TEXT PRIMARY KEY, bytes BLOB, content_type TEXT, created_at TEXT)` table. D1's free tier gives you 5 GB — about 500 albums. Because images are content-addressed and served with `immutable` cache headers, each one is fetched roughly once per device and then lives in the service worker cache, so the read volume is trivial.

The costs of this choice: your database gets large, which makes D1 Time Travel and backup exports heavier, and you lose R2's streaming semantics for big objects. Neither matters much for a single-user app with 150 KB images.

### Either way, do this

Have task `A-02` put image storage behind a one-file interface:

```ts
// packages/api/src/storage.ts
export interface ImageStore {
  put(key: string, bytes: ArrayBuffer, contentType: string): Promise<void>
  get(key: string): Promise<{ body: ReadableStream; contentType: string } | null>
  has(key: string): Promise<boolean>
}
```

Two implementations, `R2Store` and `D1Store`, and a single line choosing between them. Then Option B is a starting point rather than a commitment — you can add the card in six months and switch by re-uploading, without touching a single route or component.

The interface earns its place regardless of the storage decision: it lets `A-02`'s tests use an in-memory store instead of hitting real R2, which is what makes that task fast to iterate on.

---

## Step 5b — Billing safety

You've added a card. Here is exactly what protects you, and what doesn't.

### Stay on Workers Free

Adding a payment method for R2 does **not** move you to Workers Paid. Verify after activation: **Workers & Pages → Plans** should still read *Workers Free*. If it reads *Workers Paid*, you're paying $5/month for capacity you don't need — downgrade.

What Workers Paid would actually buy you: no daily request cap (you use ~500 of 100,000) and a 30-second CPU ceiling instead of 10 ms. That second one sounds relevant, because the 10 ms limit is why `architecture.md` §0.2 moves the passphrase KDF into the browser. **Don't spend $5 to undo it.** Client-side stretching means the server never receives the passphrase at all — it's better security, arrived at for the wrong reason. Keep the plan free and keep the design.

Expected monthly bill on this setup: **$0.00.**

### There is no hard spending cap

Cloudflare's budget alerts are **informational only — they do not pause or cap usage.** They're also calculated daily against projected spend, not in real time, so an alert is a morning-after email rather than a circuit breaker.

That is worth knowing before you rely on one. Protection has to come from three places instead:

**1. A virtual card with a hard limit.** If your bank issues virtual cards with their own spending ceiling — most do now — use one and set it low. This is the only true cap in the chain, and it's the difference between "I get an email" and "the charge is declined."

**2. A budget alert at $1.** Dashboard → **Billing → Budget alerts** → threshold $1. Any non-zero spend on this account means something is wrong, so a $1 trigger is a genuine signal rather than noise. The **Billable Usage** dashboard in the same section shows a daily per-product breakdown.

**3. A guard in the upload code.** At your scale there is exactly one realistic path to a surprise bill, and it isn't storage — 10 GB is a thousand albums. It's **Class A operations** (writes), free up to 1,000,000/month. Sealing a 60-sticker album is ~61 writes. You would need to seal 16,000 albums in a month to exceed it, which won't happen by hand — but a retry loop in the upload path could do it overnight while you sleep.

So have task `A-02` build in two cheap guards, and check they're there at review:

- `has(key)` before every `put()`. Content-addressing already makes re-uploads redundant; skipping them also makes a retry loop idempotent instead of expensive.
- A hard ceiling on uploads per album-creation session (say 200), which fails loudly rather than looping.

Both are three lines. Neither is optional insurance you'll regret paying for.

---

## Step 6 — API token for GitHub Actions

`wrangler login` authorises *your laptop*. CI needs its own credential.

Dashboard → your profile icon (top right) → **Profile** → **API Tokens** → **Create Token**.

Use the **"Edit Cloudflare Workers"** template as a base, then add the storage permissions. You want:

| Type | Resource | Permission |
|---|---|---|
| Account | Workers Scripts | Edit |
| Account | Workers R2 Storage | Edit *(skip if you chose Option B)* |
| Account | D1 | Edit |
| Account | Account Settings | Read |

Scope **Account Resources** to your account only. Leave the TTL empty.

Click through to the end, and **copy the token immediately** — Cloudflare shows it exactly once. If you lose it, delete it and make another; there's no recovery.

---

## Step 7 — Put the token where CI can reach it

In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**. Add two:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from Step 6 |
| `CLOUDFLARE_ACCOUNT_ID` | from Step 3 |

Names must match exactly — `deploy.yml` references them literally.

Never put either of these in a file inside the repo. Not in `wrangler.jsonc`, not in `.env`, not in a comment. `.gitignore` already excludes `.dev.vars`, which is the only place a local secret belongs.

---

## Step 8 — The signing key (do this during `F-08`, not now)

Your app needs a secret to sign session tokens. Generate it:

```bash
openssl rand -base64 32
```

For local development, create `.dev.vars` at the repo root (already gitignored):

```
TOKEN_SIGNING_KEY=<the value you just generated>
```

For production, the Worker must exist first — so run this **after** the first successful deploy in task `F-08`:

```bash
npx wrangler secret put TOKEN_SIGNING_KEY
```

It prompts, you paste, it stores the value encrypted at Cloudflare. It is never readable again, including by you. If you lose it, set a new one; the only consequence is that existing sessions are invalidated and you log in again.

---

## Write these down

Keep them in a password manager, not a text file in the repo.

| | Value | Where it goes |
|---|---|---|
| workers.dev subdomain | | your app's URL |
| Account ID | | `CLOUDFLARE_ACCOUNT_ID` in GitHub |
| D1 `database_id` | | `wrangler.jsonc`, task `F-02` |
| D1 preview `database_id` | | `wrangler.jsonc`, task `F-02` |
| API token | | `CLOUDFLARE_API_TOKEN` in GitHub |
| Image storage | **R2** (decided) | task `A-02` |

---

## Verify before you open Claude Code

```bash
npx wrangler whoami                    # shows your account
npx wrangler d1 list                   # shows sticker-collector
npx wrangler r2 bucket list            # shows the buckets (Option A only)
gh secret list                         # shows both GitHub secrets
```

Four green lights and you're ready for `/task F-01`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `wrangler login` hangs or the browser never returns | Blocked callback on localhost | `export CLOUDFLARE_API_TOKEN=<token>` and skip the OAuth flow entirely |
| `Authentication error [code: 10000]` | Token missing a permission | Re-create it with all four rows from Step 6 |
| `D1_ERROR: no such table` | Migrations ran locally but not remotely | `npx wrangler d1 migrations apply sticker-collector --remote` — the `--remote` flag is the whole thing |
| Deploy succeeds but the URL 404s | `workers.dev` subdomain disabled | Worker → **Settings → Domains & Routes** → enable the workers.dev route |
| `Error 1027` in production | Free plan daily request cap | You'd need 100k requests in a day. Almost certainly a retry loop in your own code |
| `exceededCpu` | 10 ms CPU limit | Something heavy is running server-side. See `architecture.md` §0.2 — the KDF belongs in the browser |
| R2 sidebar item missing | Not activated | Step 5 |
| A charge appears at all | Almost certainly Workers Paid, not R2 usage | Check **Billing → Billable Usage** for the per-product line, then downgrade the plan |
| ~$1 pending charge right after adding the card | Card verification hold | Normal; it drops off within a few days |

---

## Free-tier boundaries, for reference

| | Free allowance | Your realistic load |
|---|---|---|
| Worker requests | 100,000/day | under 500 |
| Worker CPU | 10 ms per invocation | 2–4 ms |
| Static assets | free and unlimited | — |
| D1 storage | 5 GB | kilobytes (or a few hundred MB under Option B) |
| R2 storage | 10 GB, zero egress | ~9 MB per album |
| Cron triggers | 5 per account | 0 until push reminders |

You are two orders of magnitude inside every limit. The only genuine risk is accidentally clicking an upgrade prompt, which is why Step 5 says to read the confirmation screen.
