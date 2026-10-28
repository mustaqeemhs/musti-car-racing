# Musti Car Racing: project notes for Claude Code

Read this file first. It explains the project, the rules the owner cares about, and what is done and not done yet.
(There is also an older `AGENTS.md` from the app builder. Keep it, but this file is the up-to-date one.)

## About the owner
- Mustaqeem Hassan, a web developer in Abeokuta, Nigeria. He is still learning, so **explain every step simply and in order**, with exact buttons to click. Avoid jargon. Prefer short numbered steps.
- He tests on a laptop (Chrome) and an iPhone (Safari and Chrome), usually with two devices in the same multiplayer room.
- He wants the game to feel like Asphalt: fast, smooth, polished.

## Stack and hosting
- TanStack Start + React 19 + Vite, Tailwind. Game code is in `src/game/`. The route `src/routes/index.tsx` renders `SketchRun`.
- Hosted on Vercel. The main branch deploys automatically. **Production address: https://musti-car-racing-2r5h.vercel.app** (addresses with random letters in them are old frozen builds).
- Supabase project `musti-car-racing` (ref `dtapmjpwtyhommypmjyb`, region eu-west-1) provides sign-in (email code via Brevo SMTP), the multiplayer tables and realtime.
- Environment variables on Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public anon key only). Never put secret keys in the repo.

## Important files
- `src/game/SketchRun.tsx`: the whole game (canvas loop, menus, garage, results, multiplayer sync, career).
- `src/game/MultiplayerLobby.tsx`: sign-in, rooms, ready, stake, start.
- `src/game/multiplayerState.ts`: race length, parsing, smoothing of other players' cars, contact rules. Has unit tests.
- `src/game/career.ts`: AI racers, cups, prizes, progress. Has unit tests.
- `src/game/engineAudio.ts`: engine sounds per brand (Web Audio, no sound files). Has unit tests.
- `src/game/carArt.ts`, `garageData.ts`, `vehicleUpgrades.ts`, `engine.ts`: vehicles, garage, upgrades, physics numbers.
- `supabase/migrations/`: every database change, in order. Apply new ones in Supabase (SQL Editor) or with the Supabase connector.
- `src/styles.css`: all game styling (look for the `/* ===== ... ===== */` section headers).

## Game rules the owner asked for
- Online race: up to 4 players, race length `MULTIPLAYER_RACE_LENGTH` (about 4.3 km). **Crashes only slow a car down. Nobody leaves the race until they finish** (or are marked DNF 60 s after the first finisher).
- Cars bump: the car behind loses speed, the car in front gets a small push, side swipes push apart.
- Online "pause" never freezes the race (it opens a small menu while the race keeps running).
- Every online race has a stake in Jaa'izah (host picks 0/50/100/250/500/1000). Everyone pays at the start; the winner takes the pot. The wallet lives in the browser (`WALLET_KEY`), so it can be edited by a technical player. A server-side wallet is a possible later upgrade.
- Both portrait and landscape must work. Do not force landscape.
- Career mode: three cups (Rookie, Pro, Legend) against 3 AI rivals. A podium finish opens the next cup and pays prizes.
- Each car/bike has its own engine sound (profile chosen from the vehicle name in `engineAudio.ts`).
- Other players' cars must show the car and colour that player really chose, move smoothly, and not "jump".

## Multiplayer design (so you do not break it)
- Live positions go through a Supabase Realtime **broadcast** channel (about 6 times a second). A saved copy goes to the database every 0.5 s and the full roster is read every 0.7 s as a fallback. See the sync effect in `SketchRun.tsx` and `multiplayerState.ts`.
- Finishing, results, DNF, stake/pot and replay are decided by database functions (`finish_multiplayer_race`, `get_multiplayer_race_state`, `reset_multiplayer_room`, `start_multiplayer_room`, `set_multiplayer_stake`, `set_multiplayer_vehicle`). The browser never decides who won.
- Free Supabase plans limit realtime messages and connections. See the scaling notes in the owner's chat summary; do not raise message rates without checking.
- Add `?debug=1` to the game address to see live-packet timing for other racers (helps diagnose jumping).

## Status checklist
Done (but verify on real devices):
- [x] Email-code sign-in, rooms, ready, start, finish line + gantry + distance boards, results, replay (also works on the second device), DNF timer
- [x] Stake and pot
- [x] Real chosen car/colour shown to other players
- [x] Race map bar at the top with every racer and distance to finish
- [x] Crash slows only; car-to-car bumping; no freeze on online pause
- [x] Portrait and landscape both allowed
- [x] Brand-specific engine sounds, tyre squeal, turbo and exhaust pops (needs listening tests on iPhone and laptop)
- [x] Career mode with AI racers: 8 cups (Rookie, Street, Pro, Night Sprint, Elite, Endurance, Legend, World Championship). Each cup has its own pace, race length, prizes, mistake rate, rubber-band help, aggression (overtaking/blocking), nitro skill and which cars the rivals drive (see `CAREER_TIERS` in `career.ts`). Rivals drive relative to a fixed reference Musti GT, not to the player's own car, so a faster vehicle or upgrades really help. Pace above 1.35 means the player needs nitro and a good vehicle.
- [x] **Part 2, cars and garage (done, needs a real-device check):** 7 real supercars and 3 real superbikes (pictures in `src/assets/vehicles/`), real names, prices graded by real top speed, one free car (Musti GT) and one free bike (Yamaha R1), stats panel (speed, acceleration, nitro, braking, grip) with real-life figures, upgrades under each owned vehicle (kept per vehicle, cost scales with the vehicle price), colour changes by recolouring the picture, exhaust flames and afterfire. Ownership is saved under `FLEET_KEY` (`musti-fleet-v2`).

Next requests from the owner (do them in this order):
- [ ] Engine sound: each brand must sound like its real engine and build up naturally with speed (not just louder). Rework `engineAudio.ts`.
- [ ] Move the wallet to the server (Supabase), including stake and pot payouts, prices and upgrade purchases. Then the browser can no longer edit it.

Not done yet (in this order):
- [ ] More vehicles: the owner sends more top-down PNGs. To add one: save it as `src/assets/vehicles/<id>.webp` (nose up, transparent, about 640 px tall, cropped to the car), then add one `makeVehicle({...})` line in `src/game/carArt.ts` (real top speed, 0-100 time, hp, price, grip, brake, nitro). The price must follow the real speed (a test checks this).
- [ ] **Part 3, highway:** roads that split into 2 or 3 branches with shortcuts (Asphalt style). Splits must be the same for all players in a room (deterministic from the room/race id).
- [ ] Make sure 4 players stay smooth on phones (watch frame rate; the HUD re-renders about 10 times a second).
- [ ] Optional: server-side wallet; background music; sound for other racers' engines.

## Working rules
- Run the unit tests (`npm test`) after changing `multiplayerState`, `career` or `engineAudio`.
- Database changes go in a new file in `supabase/migrations/` and must be safe to run once. Test them first inside a transaction that you roll back.
- After a change, tell the owner exactly which files changed and how to test it on his phone and laptop.
