# 14: User management

**What to build:** Owners add and deactivate users and set their role.

**Blocked by:** 01

**Status:** done (2026-10-13)

- [x] An Owner can invite a user by email and set Owner or Staff
- [x] A deactivated user loses access immediately
- [x] A Staff user cannot reach user management

Notes: no email is sent (none is set up). An owner adds name, email and role under Inställningar → Användare and gets a personal link (7 days, one use, only a hash stored, shown once) to send any way they like; the person chooses their own password at /valkommen/<token>. "Ny inloggningslänk" does the same for a forgotten password and signs them out everywhere. Switching off ends sessions and links, sign-in is refused, and every page checks it, so it holds through the 5-minute session cookie cache. An owner cannot change their own role or switch themselves off.
