# Task 09: Homepage, the approval moment

Branch: `09-home-v2`. One pull request. Read `AGENTS.md` first and send the receipt.

## Goal

Build the homepage design that Moe approved on 6 November 2026. Show it only at `tensquads.moe-678.workers.dev`. `10squads.com` and `www.10squads.com` keep the current homepage until Moe says to switch. `make verify` returns 0.

## The approved design

Moe approved this design on 6 November 2026, in the orchestrator thread, with the words "The design is approved".

- File: `docs/designs/home-v2/home.html`, with `home-dashboard.jpg` beside it.
- SHA-256 of `home.html`: `9d75858ddd2a6edbb455eca2069204b1f7e4d98dc5ceff1c1d1755b0a168309f`.
- SHA-256 of `home-dashboard.jpg`: `8d8c5146b04b334a761df8f6a5e39e1ea5f6eefa79bc4a25909b6b2b2ff6c310`.
- Screenshots: `home-1440.png` and `home-390.png` in the same folder. They show the page after the motion ends.
- It was live at https://10squads.com/review/home with the same SHA-256 when Moe approved it.

The design is the reference for this task. Read it in full, including the script at the bottom. The script holds the motion and the toggle behaviour.

## Read

- `docs/PLAN.md`: Decisions, 33 and 34 most of all
- `docs/designs/home-v2/home.html`, in full
- `apps/web/src/screens/home/`, in full: the current homepage, which stays
- `e2e/home.spec.ts` and `e2e/inventory.spec.ts`
- `packages/squadmates`

## Steps, in order

1. Add this task file in the first commit.
2. Build the design as a new screen in `apps/web/src/screens/home-v2/`. Draw every squadmate with `packages/squadmates`. Take every name from `characterName`. Do not copy SVG markup from the design file.
3. Keep `apps/web/src/screens/home/` as it is. Do not delete or change it.
4. Choose the screen by the request host, on the server, before the first paint:
   - `tensquads.moe-678.workers.dev` gets `home-v2`.
   - Every other host, and local development, gets the current homepage.
   - Put the host name in one constant, with a comment that says Moe switches it. Do not read it from the client.
   - No other route changes.
5. Every control does what the design does:
   - The New and Existing toggle changes the placeholder and the example chips. The thumb slides to the pressed button.
   - An example chip fills the prompt.
   - "Build my squad" and every "Start free" go to `/signup`, as on the current homepage. "Sign in" goes to `/signin`.
   - The Approve and Decline pills on the hero cards do nothing, by design. List them in the pull request under "Does nothing, by design".
   - A squadmate shows its details on hover and on keyboard focus.
6. The motion, as in the design:
   - The hero cards are hidden before the first paint. A server render or a hydration must not show them first and then hide them.
   - After 0.7 s, the four cards arrive 0.45 s apart. Each takes 1.4 s.
   - Then Pisa's Approve fills, the card shows "Approved by you · in the log", and the count changes from 4 to 3.
   - The limit sliders fill when the panel comes into view.
   - With `prefers-reduced-motion: reduce`, the cards show at once and nothing moves. The approval and the count still change.
   - With JavaScript off, every card shows.
   - If the sequence does not start, the cards show after 6 s.
7. Tests:
   - Run the inventory check of the new screen against `docs/designs/home-v2/home.html`.
   - Add screenshot baselines for the new screen at 1440 px and 390 px. Take them after the motion ends, or with reduced motion.
   - Add a test that the hero cards have opacity 0 on the first frame, with motion allowed.
   - Add a test that the reduced-motion path shows the cards at once.
   - Add a test that `10squads.com` still gets the current homepage and `tensquads.moe-678.workers.dev` gets the new one.
   - Add a test that no text on the new screen contains "master", in any case.
   - The current homepage tests stay as they are.
8. Compare the build with the design at 1440 px and 390 px. Attach both pairs.
9. Rebase on `main` last. Append one line to `progress.md` with the commit script.

## Done when

- [ ] `tensquads.moe-678.workers.dev` shows the approved design, and `10squads.com` shows the current homepage
- [ ] The build matches the design at 1440 px and 390 px
- [ ] The cards never show before their arrival on the first load
- [ ] Every control works, and the sign-up path works
- [ ] Tab reaches every control, the focus ring is 2 px `#0169cc` with a 2 px offset, and at 390 px there is no horizontal scroll
- [ ] `make verify` returns 0

## Do not

- Do not change a price, a plan or a promise in the copy.
- Do not change another screen, or the current homepage.
- Do not edit any file under `design/` or `docs/designs/`.
- Do not switch `10squads.com` to the new homepage.
