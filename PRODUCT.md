# Product

<!-- impeccable:product-schema 1 -->

Recorded from `docs/PLAN.md` (decisions 1 to 34), `docs/BRIEF.md`, `design/Home.dc.html`, and `apps/web/src/screens/home/`. The orchestrator said go. No new interview.

## Platform

web

## Users

The owner of a small business that sells things. The daily work is orders, support, marketing, finance, and stock. The owner wants that work handled, and wants a yes only when a limit is crossed.

## Product Purpose

tensquads gives that owner a squad of AI agents and one master. The master keeps the squad in sync and interrupts the owner only when it matters. The homepage must get the owner to brief the business and start sign-up.

## Positioning

Each agent runs on its own isolated machine with only the keys it needs. The owner sets the limits. Anything over a cap waits in the approval inbox with the reasoning.

## Operating Context

The public homepage is screen 1. Sign-in is `/signin`. Sign-up is `/signup`. A live demo opens `/chat`. Version 1 records plans and the trial. It does not charge money. Agents are test agents.

## Capabilities and Constraints

The homepage keeps the New and Existing toggle, the prompt box, the agent cards, how it works, control, pricing, the call to action, and the path to sign-up. Prices stay Starter $49, Growth $149, and Scale $399 per month. The trial line stays: free for 14 days, no credit card, cancel from the dashboard. Placeholders stay as written, including `[BUSINESS]`, `[VAT NOTE]`, and `[COMPANY LEGAL NAME]`. A control that does nothing in the design does nothing. Do not edit `design/`, `docs/PLAN.md`, or `docs/BRIEF.md`. Do not change another screen. Decision 34 allows a new colour, font, or shadow only on this page, and only where the new design uses it.

Decision 33 gives each agent one character name. The drawings in `packages/squadmates` are the only characters this page may use. Do not draw a new character. This page draws Petra, Pisa, Kyoto, Rio, Zurich, Giza, Machu, Angkor, and Delphi. It does not draw Sydney.

## Brand Commitments

The product name is tensquads. The token list in `docs/BRIEF.md` is the system for every screen. Screen 1 may add a page-local token only when the new design uses it. The squadmate drawings are fixed: one round body, one role accessory, eyes that show the agent state.

## Evidence on Hand

The homepage reference for screen 1 is `docs/designs/home/`. The build is in `apps/web/src/screens/home/`. Character drawings are in `packages/squadmates`. The names in the logo row are the design's words. Do not add a testimonial, a customer quote, a benchmark, or a price.

## Product Principles

The owner stays in control. The master asks only when it matters. The page may not invent a price, a plan, or a promise. Screen 1 follows decisions 33 and 34. Every other screen follows the design canvas.

## Accessibility & Inclusion

Tab reaches every control. The focus ring is 2 px `#0169cc` with a 2 px offset. Every input has a label. At 390 px the homepage has no horizontal scroll.
