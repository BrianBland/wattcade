# Media server settings

- URL, enabled state, buffer and access token persist together in browser local storage.
- Legacy session-only tokens migrate on configuration read; persisted empty tokens win.
- Session storage failures cannot reset saved server settings.
- Connection UI reports persistent storage write failures and explains local token storage.
- Regression coverage: browser session end, legacy migration, token clearing, unavailable
  session storage, write failure, and connection form edits followed by remount.
