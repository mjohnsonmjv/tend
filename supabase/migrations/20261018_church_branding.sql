-- Church branding for QR codes (website URL + logo).
--
-- NOT YET APPLIED. Apply via the Supabase dashboard SQL editor when the
-- QR church-logo feature ships. Until then, the client degrades gracefully:
-- GET /api/churches/:id/branding returns { websiteUrl: null, logoUrl: null }
-- and PATCH explains that the columns are missing.
--
-- Both columns are nullable and owner-updatable under the existing
-- tend_churches UPDATE policy (same as greeting_message).

alter table tend_churches
  add column if not exists website_url text;

alter table tend_churches
  add column if not exists logo_url text;
