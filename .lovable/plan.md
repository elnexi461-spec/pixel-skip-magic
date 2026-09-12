# Mifugo Farm — import the existing app and add "Skip setup"

## What you get

1. Your GitHub project (`pixel-perfect-playground-894`) copied into this Lovable project so work continues here.
2. The backend (accounts, farm data, wallet) re-created so login and data work again.
3. A **Skip for now** button on the "Set up your estate" screen, so a new user can go straight into the app after login.

## Part 1 — Bring the code in

- Copy every app file from the repo into this project: pages (home, login, reset password, dashboard, shop, farm, wallet, referrals, profile, admin), shared components, styles, images, and the M-Pesa payment callback.
- Replace the placeholder home page with the real landing page.
- Keep the existing roadmap file so remaining work stays visible.

## Part 2 — Backend

- Turn on Lovable Cloud (database, logins, server code) and apply the project's three existing database migrations unchanged, so tables, permissions, and the farm/wallet logic match the original app.
- Note: the old project's database contents (any existing users or balances) do not travel with the code. This is a fresh database, so accounts are created again on first login.

## Part 3 — Skip the setup page

- The setup screen appears whenever a signed-in user has no profile yet; it is shown on the dashboard and wallet pages.
- Add a secondary **Skip for now** action next to "Enter my estate". It creates a minimal profile (email plus a name taken from the email) with no phone number, then drops the user straight onto the dashboard.
- Once inside, a dismissible reminder points to the profile page for adding a real name, M-Pesa number, and referral code. The reminder only shows while the phone number is missing.
- Deposits and withdrawals still ask for an M-Pesa number at the moment of payment, so skipping cannot break money flows.

## Keeping credit use low

- Bulk-copy the repo files in as few steps as possible instead of rewriting them page by page.
- No redesign, no refactor, no extra features beyond the skip button — only what is listed above.
- One verification pass at the end (build check plus a quick look at login → skip → dashboard) rather than checking after every change.

## Technical notes

- Stack matches this template already: TanStack Start, Tailwind v4, shadcn UI, Supabase-backed Cloud.
- Skip uses a new server function `skipProfileSetup` that calls the existing `private.ensure_my_profile` RPC with `phone = null`; the column is already nullable, so no schema change is needed. The existing `createProfile` validator keeps requiring a valid `254…` number for the full form.
- `src/components/profile-setup.tsx` gains the skip button; the reminder banner lives in `src/components/farm-shell.tsx` and is driven by `useFarmData()`.
- Remaining open roadmap items (real M-Pesa credentials, publish, ZIP export) stay open and can be tackled next.
