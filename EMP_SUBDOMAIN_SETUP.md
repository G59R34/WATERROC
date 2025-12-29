# emp.waterroc.com setup

This repo now includes an employee-only portal under `emp/`:

- `emp/login.html`: employee-only login
- `emp/index.html`: mobile-friendly task list (requires login)

## DNS

Create a DNS record:

- **Type**: CNAME (recommended)
- **Name/Host**: `emp`
- **Target**: the same host you use for `www.waterroc.com` (whatever currently serves this site)

That will send `emp.waterroc.com` traffic to the same deployment, and the root `index.html` will automatically redirect employees to `/emp/login.html`.

## Hosting note (GitHub Pages)

GitHub Pages only supports **one** custom domain per site via a single root `CNAME` file. If you are currently using `www.waterroc.com`, you generally **cannot** add `emp.waterroc.com` to the same Pages site.

If you’re on GitHub Pages and need `emp.waterroc.com`, use one of these approaches:

- **Option A (recommended)**: Move hosting to a provider that supports multiple hostnames for one site (Cloudflare Pages / Netlify / Vercel).
- **Option B**: Create a second site/project for the employee portal and deploy the same repo (or a separate repo) with `emp/` as the entry point.

## Supabase

The employee portal uses the same Supabase integration already in the repo:

- `/scripts/config.js` for `SUPABASE_URL` + `SUPABASE_ANON_KEY`
- `/scripts/supabase.js` for auth + data access

Employees must exist in Supabase with:

- `users.auth_id` linked to the Supabase Auth user
- `employees.user_id` linked to `users.id`
- `employee_profiles.employee_id` linked to `employees.id`
- `employee_profiles.employment_status = 'active'` (otherwise access is blocked)

Also ensure Supabase Auth allows the subdomain:

- Add `emp.waterroc.com` to **Auth → URL Configuration** (Site URL / Redirect URLs), depending on how you have auth configured.

