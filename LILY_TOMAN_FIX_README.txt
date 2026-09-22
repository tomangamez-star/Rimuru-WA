LILY TOMAN IDENTITY + PERSONA FIX

Upload each file to the matching path in the Rimuru-WA repository:

  package.json
  src/server.js
  src/ai-v2.js
  src/identity.js
  test/lily-owner-identity.test.js

What changed:
- Resolves WhatsApp LID identities to their real phone-number JID before routing.
- Recognizes 2349110799878 as Toman even when the WhatsApp display name is EMC.
- Prevents EMC from replacing Toman in Lily's owner-facing replies.
- Gives a deterministic in-character response to owner identity checks.
- Removes generic assistant closers such as "What's on your mind today?"
- Hard-blocks serious factual, biography, advice, money strategy, homework,
  calculation and translation answers; Lily now deflects them in character.

No environment-variable change is required. Deploy/restart after uploading.
