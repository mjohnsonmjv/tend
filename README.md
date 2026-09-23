# Tend

A QR-first prayer intake and pastoral-care application. Congregants submit requests without an account; church owners sign in to a private inbox.

## Project links

- Repository: https://github.com/mjohnsonmjv/tend
- Vercel project: https://vercel.com/mjohnson-1676s-projects/tend
- Pilot: https://tendpray.com
- Supabase: https://supabase.com/dashboard/project/hvrdkrtismqbrkbmcgne

## Development

Use a recent Node.js 22 release and npm.

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

The development server listens on port 5000. The build output is `dist/public`.

The frontend uses the real pilot Supabase project by default. Do not create test churches or submit test prayers to it without authorization. The `/demo` route uses fictional, in-memory data. Browser QA scripts mock backend responses.

## Architecture

- React, TypeScript, Vite, Tailwind, shadcn/ui.
- Hash-based client routing.
- Supabase Auth and Postgres with row-level security.
- Frontend Supabase configuration: `client/src/lib/supabase.ts`.
- Database schema and access rules: `supabase/migrations/20260918_tend_core.sql`.
- `client/src/lib/queryClient.ts` adapts logical API requests directly to Supabase. It does not require an Express production server.
- `server/`, `shared/schema.ts`, and the SQLite tooling are legacy prototype components, not the production backend.

## Security and launch status

Only the Supabase publishable key belongs in frontend code. Never commit private API keys, database passwords, service-role keys, OAuth client secrets, or `.env` files.

Authentication sessions are memory-only. Refreshing requires another sign-in. Church isolation is enforced by database policies, not by frontend filtering.

Google and Microsoft sign-in are implemented in the application, but require provider configuration and real end-to-end testing. Disabled providers appear as “Setup pending.” SMS and billing are not active.

See [DEPLOYMENT.md](DEPLOYMENT.md) for verified functionality, known limitations, and the superseded paid backend. See [SOCIAL_SIGNIN_SETUP.md](SOCIAL_SIGNIN_SETUP.md) for OAuth setup and testing. See [BRAND.md](BRAND.md) for the visual direction.
