# Task 06: Squadmates in the product

Branch: `06-squadmates`. One pull request. One builder agent. Starts only when `02-agent-detail` (PR 12) is merged. Read `AGENTS.md` first and send the receipt.

## Goal

Every agent and the master shows its squadmate: a fixed character name from a famous place, and a character drawing whose eyes show the agent's state. Decision 33 in `docs/PLAN.md` governs this task. The reference is https://10squads.com/review/characters and `apps/landing/review-src/squadmates.mjs`. `make verify` returns 0.

## Read

- `docs/PLAN.md`: Decisions (all, decision 33 most of all), State models (Agent loop, Agent on/off)
- `apps/landing/review-src/squadmates.mjs` and `apps/landing/review-src/characters.mjs`, in full
- `docs/BRIEF.md`: Data model (Agent), Definition of done
- Each screen file you change, in full, and its design file

## The names

The name belongs to the agent image, not to the account. No customer can change it. The design's agent name ("Orders") becomes the role tag.

| Image id | Character | Named after | Role tag |
| --- | --- | --- | --- |
| master | Petra | Petra, Jordan | None. Petra shows no role tag, because no screen shows the word "master". |
| orders | Pisa | Pisa, Italy | Orders |
| support | Kyoto | Kyoto, Japan | Support |
| marketing | Rio | Rio de Janeiro, Brazil | Marketing |
| finance | Zurich | Zurich, Switzerland | Finance |
| inventory | Giza | Giza, Egypt | Inventory |
| market | Machu | Machu Picchu, Peru | Market researcher |
| website | Angkor | Angkor Wat, Cambodia | Website builder |
| analytics | Delphi | Delphi, Greece | Analytics |
| hr | Sydney | Sydney, Australia | People |

Decision 33 fixes the name for the `hr` image. The reference sheet has no People character. Report this drawing addition in the pull request for Moe. Draw it like the others, with a name badge on the body as its accessory.

## Steps, in order

1. Add this task file in the first commit.
2. Make `packages/squadmates`, a pure TypeScript package with no runtime dependency. Move the drawing from `apps/landing/review-src/squadmates.mjs` into it, with the same geometry and colours. Export the table above, the nine Agent loop states, and one function that returns the SVG markup for an image id, a state and a size. An unknown image id is an error. A unit test checks that every agent image in the seed has a squadmate.
3. Make `apps/landing` import the package, and delete its own copy. The review page at `/review/characters` must not change. Compare the built page before and after.
4. The name is computed, not stored. Do not add a column. The repositories return the character name from the image id. The master's name is always "Petra". Replace the constant `"Master"` in `packages/adapters/src/neon/create-workspace.ts`, and the master name in the seed. A test checks that a new workspace's master is Petra.
5. The state of the drawing: the product has no agent runtime yet. Draw an agent that is on in the idle state (it blinks), and an agent that is off in the Dropped state (asleep). Task 05 will pass the real Agent loop state later. Keep that one input.
6. Add one React component, `Squadmate`, in `apps/web/src/workspace/`. It renders the package markup. The markup is our own constant with no user text, so one `biome-ignore` for the inner HTML is allowed, with that reason. The SVG has `role="img"` and an `aria-label` with the name and the role.
7. Show the squadmate in every place that shows the master or an agent: the sidebar (the master header and the agent rows), the dock (header and message tags), Overview (agents at a glance and the approval items), Squads cards, the agent dashboard header, Chat (message tags and hand-offs), Traffic (the hub, the event list and the inspector), Rules (the agent select and the rule rows), and sign-up step 3 (the agents to pick). Do not change the homepage; task 07 owns it.
8. The text rule. A title or a name shows the character name. Where the design has room for a second label, the design's agent name follows it as a tag, as on the sheet. Where a line is tight, such as an event row, show the 16 or 20 px squadmate and the character name only. Every sentence that says the master's name says "Petra".
    - The sidebar, approved by Moe on 3 November 2026. The reference is `docs/designs/squadmates/sidebar.png` ("After task 06"), drawn by `docs/designs/squadmates/sidebar.html`. Match its header and rows. The sizes and spacing of the sidebar stay as in the design. The sidebar agent rows: the 24 px squadmate replaces the tint square. The row text is the character name, then the design's agent name as a grey tag, for example "Pisa" then "Orders". The status dot stays. The sidebar header shows Petra in place of the "M" mark and the word "Master".
    - "Master" is replaced with "Petra" everywhere in the interface, decided by Moe on 3 November 2026. No screen, label, `aria-label`, tag or sentence shows the word "master" or "Master". Where the word names the role, rewrite the sentence around Petra. The known strings:

      | Design text | Build text |
      | --- | --- |
      | Master (sidebar header, dock header, message tags, agent lists) | Petra |
      | Chat with the master (sidebar item and its `aria-label`) | Chat with Petra |
      | Ask Master (dock button, from `masterName`) | Ask Petra |
      | Each part of your business gets its own squad: one agent with its tools. A master squad coordinates them, and every squad works toward your mission. | Each part of your business gets its own squad: one agent with its tools. Petra coordinates them, and every squad works toward your mission. |
      | Ask the master what's going on; it routes the question to the right squad. | Ask Petra what's going on; Petra routes the question to the right squad. |
      | The master uses this to brief every squad. You can change it later. | Petra uses this to brief every squad. You can change it later. |
      | The master will propose a mission for each squad | Petra will propose a mission for each squad |

      Search the built screens for "master", case-insensitive, and fix any string this table misses. Code names such as `masterName` stay. Report each changed string in the pull request.
9. Keep the layout. The squadmate takes the size and the place of the mark it replaces: the initial, the tint dot or the icon. No box moves. At 390 px there is no horizontal scroll.
10. Update the screenshot baselines. Attach for each changed screen, at 1440 px and 390 px: the design, the build before, and the build after. Moe compares them.
11. Rebase on `main` last. Append one line to `progress.md` with the commit script.

## Done when

- [ ] `packages/squadmates` has the drawing and the table, and `/review/characters` is the same page as before
- [ ] Every place in step 7 shows the squadmate and the character name
- [ ] A new workspace's master is Petra, and no screen shows "Master" as a name
- [ ] The sidebar rows show the squadmate, the character name and the role tag, the sidebar item reads "Chat with Petra", and no screen shows the word "master"
- [ ] The nine done numbers in `AGENTS.md` are unchanged
- [ ] Each icon-only squadmate has an accessible name, and Tab still reaches every control
- [ ] At 390 px there is no horizontal scroll outside the table boxes
- [ ] `make verify` returns 0

## Do not

- Do not let a customer rename the master or an agent.
- Do not store the character name in the database.
- Do not change a colour outside the token list, except the squadmate drawing itself, which decision 33 adds.
- Do not change the homepage.
