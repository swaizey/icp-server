# ICP Parish API

Cloudflare Worker API for the parish admin portal and public member registration.

## Local setup

1. From `server/`, run `npm install`.
2. Copy `.dev.vars.example` to `.dev.vars` and fill in Supabase values.
3. Create the R2 bucket named in `wrangler.jsonc`, or change the binding to your bucket.
4. Apply `supabase/schema.sql` in the Supabase SQL editor only on a fresh project. For an existing database, apply the incremental SQL migrations in `supabase/` in date order (including `20260921_families.sql`) instead of rerunning the bootstrap file.
5. Run `npm run dev`.

Set secrets in deployed environments with Wrangler, never in source:

```text
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put TURNSTILE_SECRET_KEY
```

`PUBLIC_R2_URL` should point to a public R2 custom domain or a separate authenticated image delivery Worker. Do not expose the R2 bucket directly without an access policy.

## API

- `POST /api/register`: public multipart registration with optional `image` field.`r`n- `POST /api/auth/admin/sign-in`: rate-limited admin authentication.
- `GET /api/admin/dashboard`
- `GET /api/admin/members`, `POST/PATCH/DELETE /api/admin/members/:id`
- `GET /api/admin/schedule`, `POST /api/admin/schedule/masses`, `POST /api/admin/schedule/events`
- `GET /api/admin/sacraments`
- `GET /api/admin/reports`
- `GET/POST /api/admin/roles`
- `POST /api/admin/users`: create a Supabase Auth user and linked `app_users` administrator account from the admin panel.

Admin routes require a Supabase Auth bearer token and an active `app_users` row with permissions from `role_permissions`.
Creating users requires the `users.write` permission. The Worker uses the Supabase service-role secret server-side; never expose that secret to the client.
