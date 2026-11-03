# Creative studio functional upgrade

Implemented: product-specific briefs; real Responses API structured creative output; three copy angles; real provider error display; availability-based model selection; durable drafts including creative plans; reference-based image editing; PNG composition; 15-second AVC/MP4 motion using browser WebCodecs and Mediabunny; secure marketing-asset upload tickets and draft attachment; consistent captions across copy/publish/schedule; one-time OAuth state and matching redirect URI for TikTok; Instagram professional-account mapping and Page messaging subscription after successful authorization; newer Instagram user tokens accepted for messaging.

Runtime diagnostics and OAuth states have RLS. Raw provider keys stay server-side. Public creative storage contains only marketing assets, not conversations.

Verification: build, 13 automated tests, isolated browser creative flow with fictitious product and copy. Local preview is HTTP and lacks VideoEncoder, so MP4 encoding must be verified in the HTTPS deployment with a signed-in session. No paid generation or real social messages were sent during this change. API account model access, balance, image access and Meta/TikTok app permissions must be verified through authenticated diagnostics. Content creation does not imply direct TikTok publishing, which requires separate approved Content Posting permissions.

Two automatic-review decisions: publisher repair remains blocked (see pending/README.md); Instagram deployment initially rejected because legacy ai_draft forwarded conversation context to OpenAI. The deployed safer revision removes that external AI pathway and keeps manual messaging. No private-conversation AI was enabled.

Remaining: authorize provider accounts, verify inbound/outbound real Instagram messages, confirm creative APIs and MP4 production export, approve and complete publisher repair, complete earlier Meta app renewals and Gmail inbox.
