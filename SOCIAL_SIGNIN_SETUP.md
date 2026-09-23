# Tend: Google and Microsoft Sign-in Setup

## Status

App-side implementation is complete in the review branch. Google and Microsoft were both disabled in the selected Supabase project when checked on September 19, 2026. Neither provider has been activated by this work.

The provider controls read the backend’s enabled flags. They remain disabled with “Setup pending” until the provider is configured. Email/password sign-in remains available.

No client secrets, service-role keys, payment changes, or changes to the church-access policies were introduced.

## Required provider configuration

### Shared callback

Register this exact callback in both provider consoles:

`https://hvrdkrtismqbrkbmcgne.supabase.co/auth/v1/callback`

This callback goes to Supabase, not directly to the Vercel application. After authentication, Supabase returns to the initiating Tend site.

In Supabase Auth URL Configuration, allow the deployed Tend application’s exact root URL. The existing pilot is:

`https://tendpray.com/`

Before testing a separate Vercel preview, add that exact preview root as an allowed redirect. Do not add arbitrary external redirects. Promote the new callback code together with the new sign-in controls so an old production build cannot receive a new flow.

### Google

1. Use a Google Cloud project controlled by the business.
2. Configure the Google Auth Platform consent screen with Tend as the app name and a verified, monitored support contact.
3. Use an audience that can serve intended external churches. Testing mode may require explicit test users before general availability.
4. Create a Web application OAuth client and add the shared callback above as an authorized redirect URI.
5. Configure the Google Client ID and Client Secret in Supabase Auth Providers, then enable Google.
6. Test a real account before public release.

Google’s setup documentation:
https://supabase.com/docs/guides/auth/social-login/auth-google

Do not publish the owner's personal details merely to fill branding fields. Confirm what the consent screen will expose before saving it.

### Microsoft

1. Register Tend under Microsoft Entra ID.
2. For churches outside one organization, select the appropriate multi-tenant audience. If personal Microsoft accounts should also work, choose the audience supporting both organizational and personal accounts.
3. Add the shared callback as a **Web** redirect URI.
4. Create a client secret; put its value, not its secret ID, into Supabase’s Azure provider settings.
5. Configure the Application Client ID. Use the `common` tenant endpoint when consistent with the chosen supported-account audience.
6. Include the `email` and `xms_edov` optional claims as recommended by Supabase. Do not enable unverified-email behavior.
7. Enable the provider only after configuration is complete. Record the secret expiry date and its rotation owner.
8. Test organizational accounts and, if enabled, personal accounts before release.

Microsoft-specific instructions and email-verification cautions:
https://supabase.com/docs/guides/auth/social-login/auth-azure

## Runtime behavior

- UI labels: Continue with Google; Continue with Microsoft.
- Microsoft’s Supabase provider identifier is `azure`.
- Both request `openid email profile` and ask the user to choose an account.
- No mail, calendar, contacts, church-directory, or offline-provider-access scope is requested.
- The initiating tab retains its PKCE verifier in memory. The separate sign-in window returns only an authorization code.
- The initiating tab checks both the exact window reference and origin, then exchanges the code through Supabase.
- The callback clears codes and legacy token fragments from the URL.
- Legacy implicit access-token fragments are not accepted as a new sign-in session.
- Session tokens stay in memory. Refreshing the page requires sign-in again.
- Pop-up blockers, closure, denial, timeout, invalid exchange, and provider-settings failures show recoverable errors.
- Embedded preview frames do not start social sign-in. Use a standalone deployed application tab for a real provider test.
- A provider login authenticates a person; it does not grant access to any church without the existing ownership authorization.

## Testing completed

- TypeScript checks and production build.
- Twelve unit tests covering existing inbox features plus OAuth scopes, provider gating, callback parsing, and cross-window validation.
- Browser tests with simulated Google and Microsoft responses; confirmed matching SHA-256 PKCE verifier/challenge and return to the app.
- Browser failure tests for canceled consent, closed windows, blocked pop-ups, failed token exchange, and unavailable provider settings.
- URL cleanup and no-opener recovery.
- Desktop/mobile and dark-mode layout checks.

These are app-side tests with simulated providers, not a successful real Google or Microsoft login. Live OAuth consent, account linking, email verification claims, cross-origin provider behavior, and provider-specific account policies still require end-to-end testing after the two provider registrations are configured.

## Credential handling

Enter provider secrets directly into Supabase or use a secure credential workflow. Never paste secrets into chat, put them into frontend source, or add them as `VITE_` environment variables.

## Release gate

1. Configure both provider applications and Supabase.
2. Review public consent-screen branding for privacy.
3. Test live Google and Microsoft sign-in and cancellation.
4. Test existing-account linking using verified emails; do not link accounts using a client-supplied email alone.
5. Recheck that one church’s user cannot access another church’s inbox.
6. Promote the tested review build to the production domain.
