## Employee subdomain (`emp.waterroc.com`) setup

This repo now includes a dedicated, mobile-first employee tasks portal under `emp/`:

- **Login**: `emp/login.html`
- **Tasks app**: `emp/index.html`

These pages use the existing Supabase integration (`/scripts/config.js` + `/scripts/supabase.js`) and authenticate employees **on the `emp.waterroc.com` origin**.

### DNS

Create a DNS record for the subdomain:

- **Type**: CNAME
- **Name**: `emp`
- **Target**: your primary site host (commonly `waterroc.com` or your hosting provider’s assigned hostname)

If your host requires an A/AAAA record instead of CNAME (some setups do), use your host’s documented values.

### Hosting / routing

You need `emp.waterroc.com` to serve the same static build that contains:

- `/emp/login.html`
- `/emp/index.html`
- `/scripts/*`, `/styles/*`, `/favicon.png`, etc.

Then configure the subdomain to land on the employee login.

Two common approaches:

- **Approach A (recommended)**: serve the repo/site root for `emp.waterroc.com`, and rewrite `/` → `/emp/login.html`.
- **Approach B**: set the document root for `emp.waterroc.com` to the `emp/` folder, and rename/copy assets accordingly (not implemented here).

Example (nginx) rewrite for Approach A:

```nginx
server {
  server_name emp.waterroc.com;
  root /var/www/waterroc; # site root containing /emp, /scripts, /styles

  location = / {
    return 302 /emp/login.html;
  }

  location / {
    try_files $uri $uri/ =404;
  }
}
```

### Supabase Auth settings (required)

Because `emp.waterroc.com` is a different origin, Supabase needs to allow redirects/callbacks for it.

In Supabase Dashboard → **Authentication** → **URL Configuration**:

- **Site URL**: set to `https://emp.waterroc.com` (or keep your main site URL and add the subdomain below; either way, redirects must be allowed)
- **Additional Redirect URLs**: add:
  - `https://emp.waterroc.com/emp/login.html`
  - `https://emp.waterroc.com/emp/`
  - `https://emp.waterroc.com/emp/index.html`

If you test locally, add your local dev URLs too (example):

- `http://localhost:3000/emp/login.html`
- `http://localhost:3000/emp/index.html`

### What’s enforced

- **Employee-only login**: admin accounts are blocked on `emp/*`.
- **Employee linkage required**: user must have an `employees` row linked via `employees.user_id = users.id`.
- **Employment status**: `employee_profiles.employment_status` is checked (terminated/admin leave are blocked; extended leave is redirected to `/extended-leave.html`).
# emp.waterroc.com setup

This repo now includes an employee-only portal under `emp/`:

- `emp/login.html`: employee-only login
- `emp/index.html`: mobile-friendly task list (requires login)

## DNS

Create a DNS record:

- **Type**: CNAME (recommended)
- **Name/Host**: `emp`
- **Target**: the same host you use for `www.waterroc.com` (whatever currently serves this site)

That will end `emp.waterroc.com` traffic to the same deployment, and the root `index.html` will automatically redirect employees to `/emp/login.html`.

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

