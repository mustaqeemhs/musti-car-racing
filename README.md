# Doodle Dash Getaway

Build a polished, genuinely playable arcade driving game inspired by the attached pencil drawing of a Lamborghini-style supercar. Use the drawing as a visual reference and incorporate its silhouette/details into the player car sprite or stylized hand-drawn car treatment; do not make a landing page. Game title: POLICE PURSUIT — SKETCH RUN. Desktop and mobile responsive. Core gameplay: top-down/three-quarter road racer with continuous scrolling road; steer left/right and accelerate/brake using arrow keys and WASD; mobile touch controls with large accessible left/right, brake and boost buttons. Dodge procedurally spawning traffic, avoid collisions, escape pursuing police cars, score increases with survival time and distance, speed ramps gradually, show speed/score/best score, damage/lives indicator, pause/resume, start screen, game-over screen with restart. Include sound toggle and clear controls/tutorial. Smooth performant canvas/game loop, robust collision detection, fair spawning, responsive scaling and touch support. Visual style: cinematic charcoal/graphite sketch texture inspired by the pencil drawing, dark asphalt, bright lane markings, neon red/blue police lights, high contrast UI, tasteful motion blur/particles. Ensure gameplay actually works: keyboard controls respond while playing, prevent arrow-key page scrolling during gameplay, mobile controls work with pointer/touch, restart resets all state, best score persists locally if possible. No paid APIs or required backend. Make it complete and playable in preview, attractive UI, no placeholder controls.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b503a5f7-3360-4d1d-9a6f-d401ca576ca0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Deploy to Vercel

1. Import `mustaqeemhs/musti-car-racing` into Vercel and keep the detected
   framework/build settings. The Vite config selects Nitro's Vercel preset.
2. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Vercel project's
   environment variables for the environments you plan to use. Use the
   Supabase project's URL and publishable/anon key; never add a service-role or
   secret key to a `VITE_` variable.
3. Deploy, then set the deployed URL as the Supabase Auth **Site URL** and
   complete the multiplayer setup below. The SQL migration must be applied to
   the Supabase project before online rooms can work.

## Supabase multiplayer setup

Online rooms require a Supabase project. Single-player races and the locally
saved guest wallet continue to work without one. Multiplayer uses Supabase
email one-time codes; the online username is a separate identity and does
not import or overwrite a guest wallet, vehicle ownership, upgrades, or
achievements.

1. In Supabase, open **Authentication → Providers → Email** and enable Email
   sign-in. Keep email signup enabled if players may create new accounts. Under
   **Authentication → URL Configuration**, set the project **Site URL** to the
   real deployed game URL, not `localhost`. The in-game code flow does not
   redirect out of the app, does not set `emailRedirectTo`, and disables
   URL-based auth callback detection; it should not depend on a localhost
   callback. The Site URL still matters for Supabase's default/fallback links
   and other link-based auth flows. Allowed redirect URLs are not used for this
   OTP flow. If you retain link-based auth elsewhere, allowlist only the exact
   origins you use, including the deployed URL and any Codespaces preview
   origin.
2. Under **Authentication → Email Templates**, configure the **Magic Link** and
   **Confirm signup** templates to show `{{ .Token }}` instead of relying on a
   `{{ .ConfirmationURL }}` link. Existing accounts use the Magic Link template;
   newly-created accounts use Confirm signup when email confirmation is enabled.
   Both templates need the code for the in-game OTP experience. Supabase's
   `signInWithOtp` sends the email according to the applicable template; the
   game verifies the submitted code with `verifyOtp({ type: "email" })`.
   If an email send reports HTTP 429, inspect **Authentication → Rate Limits**
   and the SMTP provider's own quota. Review **Authentication → Logs** for
   Auth-side send failures. Supabase's default email sender is restricted and
   low-volume; configure a verified custom SMTP provider in the project's
   **Authentication/SMTP settings** when needed, and verify its sender domain,
   credentials, and delivery logs. Do not repeatedly request codes or increase
   provider limits without checking its documented quota and Auth logs. HTTP
   401/403 points to mismatched project URL/key configuration, while an
   unreachable endpoint points to the URL or network. HTTP 5xx should be
   investigated in Auth logs and SMTP/provider configuration. A template change
   affects future sends, not messages already sent.
3. In **SQL Editor**, apply
   [`supabase/migrations/20261023000000_multiplayer.sql`](./supabase/migrations/20261023000000_multiplayer.sql).
   Open that exact `.sql` file in the repository, copy only its SQL contents,
   paste them into a new Supabase SQL Editor query, and run it. Do not paste
   README text or Markdown headings into the SQL Editor.
   It creates the username, room, membership, and race-position tables; adds
   unique normalized usernames and room codes; enables RLS; and defines
   authenticated RPCs for room actions, presence cleanup, and race movement.
   Clients cannot write room membership or another player's race position
   directly. The migration file in this repository does not prove that it has
   been applied to the live project; its live application status is unverified
   here. Confirm it in the Supabase SQL Editor/migration history and check that
   the created tables and RPCs exist before testing multiplayer.
4. The migration adds the room, membership, and race-position tables to
   `supabase_realtime` when that publication exists. In **Database → Replication**,
   confirm those three tables are enabled for Realtime. The lobby polls as a
   fallback, but live changes and race positions need Realtime enabled.
5. Copy [`.env.example`](./.env.example) to `.env.local` and set
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the project's URL and
   publishable/anon key. Never put a service-role/secret key in a `VITE_`
   variable. For Codespaces, add these as repository/environment secrets and
   make them available to the dev process, then restart Vite.
6. Open **Multiplayer**, enter your email, request the code, and type the code
   into the same screen. Register an online username (default suggestion
   `musti`), create a room, and share its twelve-character code. Friends must
   authenticate, pick unique usernames, join, and mark Ready before the host
   can start.

Room membership is limited to one active room per authenticated user. Rooms
expire after two hours; active clients remove expired or stale memberships
through a restricted cleanup RPC. A room host leaving transfers the host role
and resets an in-progress lobby countdown. Race position updates are sent
asynchronously and never alter local Jaa'izah rewards.

The initial room limit is four players. The migration enforces this in the
room-size constraint, room-creation RPC, and seat range; it is not only a UI
limit. Position writes are throttled to five updates per second per client.
Testing eight players later requires a deliberate migration and updates to the
room-size/seat constraints and server validation, followed by multi-client
performance and reconnect testing. This is not a worldwide-capacity guarantee;
load testing is required before making scale claims.

## Browser smoke tests

1. Start the app with `npm run dev` and open the local URL shown in the terminal.
   From the home screen, choose **Race Now** and steer around traffic for a short
   race. Verify the game starts, controls respond, and the race can be restarted.
2. During a race, collect the glowing gold coins and blue nitro canisters. Open
   **Guest Profile & Jaa'izah** from the home screen and verify the coin balance
   changed. Refresh the browser and check that the guest balance is still saved.
3. To test online rooms, first complete the Supabase setup above and configure
   the two `VITE_SUPABASE_*` variables in `.env.local`. Restart the dev server.
   Use two separate browser profiles and two distinct email addresses so the
   browsers have separate authenticated Supabase users.
4. In both profiles, open **Multiplayer**, request the email verification code,
   and enter it in that same profile. Choose a different online username in each.
   In the first profile, create a room and copy its code. In the second, enter
   that code and join. Mark both players **Ready**, then have the host choose
   **Start Race**.
5. Verify both players enter the race and each sees the other driver's car move.
   This is the end-to-end multiplayer check; a successful build or migration
   alone does not confirm live multiplayer connectivity.
