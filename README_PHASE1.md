# Rimuru-WA Phase 1 — Economy Foundation

Upload the files in this ZIP to the matching paths in `tomangamez-star/Rimuru-WA`.

## What Phase 1 ports
- Persistent player accounts in Supabase/Postgres
- Original Rimuru starting balance: 500,000
- Wallet + bank separation
- `/balance` and `/bal`
- `/bank`
- `/dep` / `/deposit`
- `/wd` / `/withdraw`
- `/donate` by replying to a WhatsApp message (wallet → wallet)
- `/transfer` by replying to a WhatsApp message (bank → bank)
- Atomic Postgres transactions so transfers cannot partially apply
- WhatsApp JID normalization with `participantAlt` preference to reduce LID/PN identity splits

## Important
This deliberately does NOT port casino games, ranks, skins, cards, income, robbery, lottery, or other later phases.

The existing WhatsApp pairing/session storage, Telegram pairing controller, `/start` native button transport, `/mines` button test, and speed-test commands remain intact.

## Live test order
1. `/balance`
2. `/dep 100000`
3. `/balance`
4. `/wd 50000`
5. Reply to another user's message with `/donate 1000`
6. Deposit enough money, then reply with `/transfer 1000`
7. Have the recipient run `/balance`
8. Redeploy Render
9. Run `/balance` again and confirm the same wallet/bank values remain.

`DATABASE_URL` must remain configured. The economy uses a separate `rimuru_wa_users` table and does not alter `rimuru_wa_auth`.
