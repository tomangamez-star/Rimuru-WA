# Boy Alone mod dashboard

Set a new Render secret named `BOY_ALONE_PASSWORD`. It must be different from `DASHBOARD_PASSWORD`.

Both users open `/dashboard`:

- `DASHBOARD_PASSWORD` opens the complete Lily owner control room.
- `BOY_ALONE_PASSWORD` opens only the limited Boy Alone control room.

The mod dashboard cannot pair/remove accounts, view Lily, inspect provider incidents, take deployment ownership, or read Lily memory. It can control the first paired account in `autoreply` mode: personality, global on/off, 5–600 second cooldown, group behavior, muted chats, reconnection and Boy Alone-scoped memories.

New secondary pairings default to Boy Alone. Default replies are short and the cooldown is 30 seconds. In groups, Boy Alone responds only when named, mentioned, or directly replied to.

WhatsApp owner shortcuts:

- Send `/ai off` or `/ai on` in the account's message-yourself chat to change the global state.
- Send the same command in another DM or group to mute/unmute only that chat.
