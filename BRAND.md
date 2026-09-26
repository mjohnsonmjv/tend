# Tend brand direction: First Light

## Positioning

Get a QR code for your church. Your congregation scans it to share prayer needs. See requests in one place, ready to pray and follow up.

Primary headline: “One QR code. A place for every prayer.”
Primary action: “Get your church’s QR code.”
Brand line: “Make room for every prayer.”

## Identity

- A lowercase wordmark in Instrument Serif paired with an original open-circle/person symbol. Concept: an invitation to be heard, not a closed institution.
- Instrument Serif for display and headlines. Instrument Sans for body and controls.
- First Light palette: white `#FFFFFF` canvas, morning ivory `#FBF8F1` surfaces, dawn gold `#EFC65E` signal accent used sparingly (primary CTAs, answered-prayer moments, key highlights), pale blush `#E9D3C6` highlight states, sage `#93A68B` secondary, warm charcoal `#2A2521` text, stone `#E2DACA` hairlines.
- Feel: quiet morning prayer. Generous whitespace, hairline dividers, light and breathable, reverent. Warm minimal, clean typography.
- Clear, warm, direct language. No em dashes. No audience-size restriction in the hero.
- No invented church endorsements, member counts, or popularity claims. Product illustrations are labeled examples.
- Marketing, public forms, dashboard, favicon, and print poster share the identity.

## Research informing the direction

These references inform design principles, not a claim of an objective “best” ranking. Tend's mark and layouts are original.

- Passion City Church: purposeful attention to every communication and design detail, without ostentation. https://passioncontent.s3.amazonaws.com/USBooklet/PCC_US_Book.pdf
- EFCA: simplify the mark for small-screen legibility, preserve clear space, and use consistent typography and color across media. https://go.efca.org/sites/default/files/resources/docs/2013/09/efca-brand-identity-guide_2013_0.pdf
- Christ Fellowship's creative director case study: a structured brand guide improved signage, print collateral, and web assets. https://milenkatorres.com/christfellowshipbrandbook
- Logos: visual decisions should express mission, with a clear message and consistent story. https://www.logos.com/grow/church-branding-mission/

## Revision checks

- Removed the church-size eyebrow and fictional bulletin-placement caption.
- Removed em dashes throughout first-party client, server, and shared source.
- Type check and production build pass.
- Landing tested at 1440px and 375px, including dark mode.
- Pricing, signup, prayer form, confirmation, inbox, QR page, and settings checked at 1280px and 375px without horizontal overflow.
- Exercised landing CTA, workflow scroll, prayer submission, anonymous toggle, inbox detail, status change, notes save, QR PNG download, poster popup, and copy-link.
- Verified unknown-church error and disabled empty signup.

## Pilot limitations

The initial branding preview used fictional data. The current app now includes Supabase authentication and owner-based database authorization; see DEPLOYMENT.md for the implementation and verification boundaries. Production privacy review, billing, and automated notifications remain unfinished. Use fictional information for demos and QA. Do not add unsupported encryption, privacy, instant-notification, or subscription-enforcement claims; planned pricing features remain explicitly labeled.

The live domain is tendpray.com. Preview QR codes use the current page address.
