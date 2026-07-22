## Services

**Identity**

There is one user. Sign-up, email verification, and password reset are theatre for a single person, and are not built.

1. Access is guarded by a **single passphrase**, verified server-side (PBKDF2-SHA256 via WebCrypto, 600,000 iterations). Failed attempts are rate-limited.
2. On success the server issues a signed token with a 90-day expiry. The client holds it in IndexedDB and sends it as a bearer token.
3. **There is no reset flow.** A lost passphrase is recovered by restoring the data export. This is the second reason the export exists.
4. Image storage is private. Images are served through the API, never from a public URL.
5. The schema carries a `user_id` column regardless, so a second person costs a migration rather than a rewrite.

**Data**

1. It must be possible to import and export the application's data as a single backup file. This is always available, regardless of album state.

2. **Recommended stack — free forever, no card, no trial.**

   The constraint is *zero cost with no expiry*, so every choice below sits on a permanent free tier, not a trial. The server, not the browser, is the source of truth; local storage is only a cache.

   | Concern        | Choice                 | Why it stays free                                            |
   | -------------- | ---------------------- | ------------------------------------------------------------ |
   | Static hosting | Cloudflare Pages       | Unlimited static requests, unlimited bandwidth on the free plan. |
   | API            | Cloudflare Workers     | 100,000 requests/day free, shared with Pages Functions. One user comes nowhere near it. |
   | Database       | Cloudflare D1 (SQLite) | 5 GB storage; generous daily read/write allowances that reset every day. |
   | Image storage  | Cloudflare R2          | 10 GB storage and no egress fees — the usual charge that sinks image apps. |
   | Reminders      | Web Push (VAPID)       | Free and open; needs no third party. Works on iOS only for the installed PWA. |
   | Install        | Home-screen PWA        | No Apple Developer account, no store, no fee.                |

   One vendor keeps the moving parts to a minimum: one login, one dashboard, one place for the API, the database, and the images to talk without leaving the network. **Deliberately avoided:** Supabase (its free project pauses after a week of inactivity — the exact failure mode a habit app cannot tolerate) and anything that scales to zero with a cold-start penalty on the critical path.

3. **Backup as a real feature, not a menu item.** The single-file export is the recovery story — it is how a lost passphrase is recovered, and the insurance against browser eviction. The app should prompt for a backup after any album is created or completed, and quietly keep the last export date visible in settings.

---

*Part of the Sticker Collector spec. Index: [`docs/prd/README.md`](./README.md)*
