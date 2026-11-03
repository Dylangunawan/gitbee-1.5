# Task 4.5: local auth verification

Based on merged PR #64 (tasks 4.3 and 4.4). That PR already wired local role switching to `POST /api/auth/login-local/role`; this task exercises the flow and fixes the issues found during verification.

## Expected access

Access is based on assigned membership, not only `activeRole`. Switching roles changes the dashboard and navigation; an Admin, SCC or HoP retains their assigned Lecturer access. The backend refreshes membership from the database on protected requests.

| Local account | Frontend pages | RoleMiddleware grants |
| --- | --- | --- |
| Student | `/dashboard`, `/course`, `/profile` and descendants | Student |
| Lecturer | `/dashboard-lecturer`, `/course-lecturer`, `/history-lecturer` and descendants | Lecturer |
| SCC | `/dashboard-scc` plus Lecturer pages | SCC, Lecturer |
| HoP | `/dashboard-hop` plus Lecturer pages | HoP, Lecturer |
| Admin | `/dashboard-admin`, `/detail-admin-project`, `/manage-categories`, `/manage-student`, `/manage-transactions`, `/manage-users` and descendants, plus Lecturer pages | Admin, Lecturer |

## Fixes

- Student prefix rules previously admitted staff paths such as `/dashboard-admin` and `/course-lecturer`. Segment boundaries now distinguish those routes.
- The profile matcher explicitly includes descendants such as `/profile/2702000001`.
- Expired JWTs no longer restore a signed-in frontend state or pass the frontend guard.
- The header uses a tested role-switch action: local/bypass sessions send only `{ role }` with the cookie; Microsoft sessions retain `/auth/login` with `microsoft_token`.
- Failed switches show an error and retain the current context/cookie. Local logout clears the session and returns home without an MSAL logout redirect.

## Repeatable checks

Run `pnpm test` from the root for the frontend guard/action tests and database-free backend tests. No Microsoft, Bluejack or Atlantis credentials are needed.

For real database verification, migrate a dedicated test database as described in the README, set `TEST_DATABASE_URL` to it, then run:

```bash
pnpm --filter gitbee_backend exec tsx --test tests/localRoleAccess.mysql.test.ts
```

The database suite creates five temporary accounts on a unique per-run email domain and deletes only those accounts afterwards. It tests actual credential login and middleware, all 25 account/required-role combinations, staff-to-Lecturer round trips, refusal of unassigned roles, database demotion, and credential-version revocation. The database-free suite additionally checks cookies and bearer tokens, missing/forged/expired sessions and deleted users. Frontend tests execute the real proxy and Next matcher, including the Student-to-staff regression, custom cookie name, public routes and failed API responses.

## Browser check

1. Start the local servers using the README, with `BYPASS_SSO=true` synced to both apps.
2. Click Login. Confirm the dedicated dev account opens `/dashboard-admin` with Admin navigation.
3. Open the avatar menu and choose **Login as Lecturer**. Confirm `/dashboard-lecturer` and Lecturer navigation.
4. Reload. Confirm the Lecturer session persists and the menu offers **Login as Admin**.
5. Switch back to Admin, then Logout. Confirm `/` shows Login without navigating to Microsoft.

Verified locally on 3 November 2026 against Next 16.3.5 and an isolated MariaDB 10.4.32 database with all five migrations applied. The browser check used a non-default cookie name, `task45_session`.

## Verification limits and existing gaps

The frontend proxy decodes the JWT for navigation; it does not verify its signature or consult database membership. Authoritative authorization belongs to the backend middleware. A database demotion or password reset can therefore leave old frontend navigation visible until a new session is issued, while protected API requests are denied immediately.

The middleware matrix mounts the real `AuthMiddleware` and `RoleMiddleware` with side-effect-free probe handlers. It verifies their decisions, not that every existing API endpoint installs them. Several older backend namespaces still lack guards, including `project/admin` and `project/lecturer`, and some older `user/admin` handlers. This pre-existing API coverage gap remains open and needs a separate router authorization change; frontend guards do not secure those endpoints. The current-admin credential routes and Admin CSV upload routes already install authorization checks.

Dashboard rendering and session navigation were checked with an empty local database. Bluejack/Atlantis-backed course data and a real Microsoft sign-in were not exercised; the Microsoft role-switch request contract is covered by the frontend action test.
