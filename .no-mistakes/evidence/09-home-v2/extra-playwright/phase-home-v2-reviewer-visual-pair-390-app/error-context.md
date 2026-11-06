# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: phase-home-v2.spec.ts >> reviewer visual pair 390
- Location: e2e/phase-home-v2.spec.ts:11:33

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 45
+ Received  + 45

  Object {
    "#agents": Object {
-     "h": 1347.75,
-     "w": 350,
-     "x": 20,
-     "y": 1241,
+     "h": 1299,
+     "w": 1216,
+     "x": 112,
+     "y": 817,
    },
    "#control": Object {
-     "h": 947,
-     "w": 350,
-     "x": 20,
-     "y": 3414.75,
+     "h": 536,
+     "w": 1216,
+     "x": 112,
+     "y": 2520,
    },
    "#how": Object {
-     "h": 826,
-     "w": 350,
-     "x": 20,
-     "y": 2588.75,
+     "h": 404,
+     "w": 1216,
+     "x": 112,
+     "y": 2116,
    },
    "#pricing": Object {
-     "h": 1715,
-     "w": 350,
-     "x": 20,
-     "y": 4361.75,
+     "h": 767,
+     "w": 1216,
+     "x": 112,
+     "y": 3056,
    },
    ".ask": Object {
-     "h": 44,
-     "w": 350,
-     "x": 20,
-     "y": 222,
+     "h": 40,
+     "w": 1216,
+     "x": 112,
+     "y": 198,
    },
    ".cards": Object {
-     "h": 456,
-     "w": 350,
-     "x": 20,
-     "y": 282,
+     "h": 253,
+     "w": 1216,
+     "x": 112,
+     "y": 254,
    },
    ".dock": Object {
-     "h": 297,
-     "w": 350,
-     "x": 20,
-     "y": 766,
+     "h": 192,
+     "w": 820,
+     "x": 310,
+     "y": 531,
    },
    ".final": Object {
-     "h": 648,
-     "w": 350,
-     "x": 20,
-     "y": 6196.75,
+     "h": 508,
+     "w": 1216,
+     "x": 112,
+     "y": 3943,
    },
    ".logos": Object {
-     "h": 130,
-     "w": 350,
-     "x": 20,
-     "y": 1111,
+     "h": 22,
+     "w": 1216,
+     "x": 112,
+     "y": 795,
    },
    ".new": Object {
      "h": 30,
-     "w": 350,
-     "x": 20,
+     "w": 1216,
+     "x": 112,
      "y": 76,
    },
    "footer": Object {
-     "h": 582,
-     "w": 350,
-     "x": 20,
-     "y": 6940.75,
+     "h": 305,
+     "w": 1216,
+     "x": 112,
+     "y": 4547,
    },
    "h1": Object {
-     "h": 92,
-     "w": 350,
-     "x": 20,
+     "h": 68,
+     "w": 1216,
+     "x": 112,
      "y": 116,
    },
  }
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - navigation [ref=e4]:
    - link [ref=e5] [cursor=pointer]:
      - /url: "#"
      - img "Petra" [ref=e7]
      - text: tensquads
    - link "Sign in" [ref=e15] [cursor=pointer]:
      - /url: /signin
    - link "Start free" [ref=e16] [cursor=pointer]:
      - /url: /signup
  - banner [ref=e17]:
    - generic [ref=e19]:
      - img "Delphi, Analytics" [ref=e21]
      - text: "New: Analytics agent in beta"
    - heading "Your squad does the work." [level=1] [ref=e30]
    - generic [ref=e31]:
      - img "Petra, running" [ref=e33]
      - generic [ref=e41]:
        - text: Petra has
        - generic [aria-hidden] [ref=e42]:
          - generic [ref=e43]: "4"
          - generic [ref=e44]: "3"
        - generic [ref=e45]: "3"
        - text: decisions for you today · sample day at Harbor Prints
    - generic "Sample approvals" [ref=e46]:
      - generic [ref=e47]:
        - generic [ref=e48]:
          - img "Pisa, Orders, waiting" [ref=e50]
          - generic [ref=e60]: Pisa
          - generic [ref=e61]: Orders
          - generic [ref=e62]: $18
        - heading "Ship order A-1031 by express" [level=3] [ref=e63]
        - paragraph [ref=e64]: The customer needs it by Friday. Express is $18. Your shipping limit is $12.
        - generic [ref=e65]: Address and stock checked
        - generic [ref=e69]: Approved by you · in the log
      - generic [ref=e72]:
        - generic [ref=e73]:
          - img "Kyoto, Support, waiting" [ref=e75]
          - generic [ref=e86]: Kyoto
          - generic [ref=e87]: Support
          - generic [ref=e88]: $64
        - heading "Refund Amira and send a new print" [level=3] [ref=e89]
        - paragraph [ref=e90]: Her print arrived torn. The refund is $64. Your refund limit is $50.
        - generic [ref=e91]: Photo of the damage on file
        - generic [aria-hidden] [ref=e94]:
          - generic [ref=e95]: Approve
          - generic [ref=e98]: Decline
    - generic [ref=e99]:
      - generic [ref=e100]:
        - group "Business type" [ref=e101]:
          - button "New business" [ref=e103] [cursor=pointer]
          - button "Existing business" [pressed] [ref=e104] [cursor=pointer]
        - generic [ref=e105]: Describe your business
        - textbox "Describe your business" [ref=e106]:
          - /placeholder: Paste your store URL or describe what you sell…
        - generic [ref=e107]:
          - generic [ref=e108]:
            - button "A Shopify store doing 300 orders a month" [ref=e109] [cursor=pointer]
            - button "A cafe with a wholesale side" [ref=e110] [cursor=pointer]
            - button "Two Amazon listings and a website" [ref=e111] [cursor=pointer]
          - button "Build my squad →" [ref=e112] [cursor=pointer]
      - generic [ref=e113]: Free for 14 days · No credit card · Cancel from the dashboard
    - generic [ref=e114]:
      - generic [ref=e115]: Running the day-to-day at
      - generic [ref=e116]: Leen Dates
      - generic [ref=e117]: Northwind Apparel
      - generic [ref=e118]: Atlas Outdoor
      - generic [ref=e119]: Bloom Skincare
      - generic [ref=e120]: Harbor Coffee
      - generic [ref=e121]: Sunbeam Toys
  - generic [ref=e122]:
    - heading "One agent for every part of the business" [level=2] [ref=e123]
    - paragraph [ref=e124]: Each agent runs on its own isolated machine with only the connections it needs. Start with one, add the rest when you are ready.
    - generic [ref=e125]:
      - generic [ref=e126]: app.10squads.com / overview
      - 'img "The tensquads Overview: revenue, orders, tasks done by the squad, and the approvals waiting for you" [ref=e131]'
    - list [ref=e132]:
      - listitem [ref=e133]:
        - img "Pisa, Orders" [ref=e135]
        - generic [ref=e145]: Pisa
        - generic [ref=e146]: Orders
      - listitem [ref=e147]:
        - img "Kyoto, Support" [ref=e149]
        - generic [ref=e160]: Kyoto
        - generic [ref=e161]: Support
      - listitem [ref=e162]:
        - img "Rio, Marketing" [ref=e164]
        - generic [ref=e172]: Rio
        - generic [ref=e173]: Marketing
      - listitem [ref=e174]:
        - img "Zurich, Finance" [ref=e176]
        - generic [ref=e185]: Zurich
        - generic [ref=e186]: Finance
      - listitem [ref=e187]:
        - img "Giza, Inventory, waiting" [ref=e189]
        - generic [ref=e199]: Giza
        - generic [ref=e200]: Inventory
      - listitem [ref=e201]:
        - img "Machu, Market researcher" [ref=e203]
        - generic [ref=e213]: Machu
        - generic [ref=e214]: Market researcher
      - listitem [ref=e215]:
        - img "Angkor, Website builder" [ref=e217]
        - generic [ref=e227]: Angkor
        - generic [ref=e228]: Website builder
      - listitem [ref=e229]:
        - img "Delphi, Analytics, planning" [ref=e231]
        - generic [ref=e242]: More on the way
        - generic [ref=e243]: Analytics is in beta. People and Legal are next.
    - paragraph [ref=e244]: Hover or tap a squadmate to see what it does.
  - generic [ref=e245]:
    - heading "Set up in an afternoon, not a quarter" [level=2] [ref=e246]
    - generic [ref=e247]:
      - generic [ref=e248]:
        - generic [ref=e249]: "1"
        - img "Petra, running" [ref=e252]
        - heading "Tell us about the business" [level=3] [ref=e260]
        - paragraph [ref=e261]: New or existing, what you sell, where you sell it. A couple of sentences is enough to brief the squad.
      - generic [ref=e262]:
        - generic [ref=e263]: "2"
        - img "Pisa, Orders, running" [ref=e266]
        - heading "Pick your agents and connect" [level=3] [ref=e276]
        - paragraph [ref=e277]: Choose the agents you want and connect your store, inbox and ads. Each agent gets its own isolated machine and only the keys it needs.
      - generic [ref=e278]:
        - generic [ref=e279]: "3"
        - img "Zurich, Finance, running" [ref=e282]
        - heading "Set the limits, then let go" [level=3] [ref=e291]
        - paragraph [ref=e292]: Decide what agents can do alone and what needs a yes from you. Loosen the limits as you build trust.
  - generic [ref=e294]:
    - generic [ref=e295]:
      - heading "You stay in control" [level=2] [ref=e296]
      - paragraph [ref=e297]: Agents work inside limits you set. Anything bigger, they ask.
      - generic [ref=e298]:
        - paragraph [ref=e303]: Spend and refund caps. Per agent, per day. Anything over the cap lands in your approval inbox with the reasoning.
        - paragraph [ref=e308]: Every action is logged. See who asked what, which skill ran and what changed, message by message.
        - paragraph [ref=e313]: Isolated by default. Each agent runs on its own machine with its own secrets and an allowlist of sites it may reach.
        - paragraph [ref=e318]: Pause anything, any time. One switch per agent, one per skill. Paused agents keep their memory and pick up where they left off.
    - generic [ref=e319]:
      - generic [ref=e320]:
        - img "Petra" [ref=e322]
        - generic [ref=e330]: Petra
        - generic [ref=e331]: Your limits
      - generic [ref=e333]:
        - generic [ref=e334]: Refund without asking, up to
        - generic [ref=e335]: $50
      - generic [ref=e339]:
        - generic [ref=e340]: Ad spend per day
        - generic [ref=e341]: $50
      - generic [ref=e345]:
        - generic [ref=e346]: Reorder without asking, up to
        - generic [ref=e347]: $500
  - generic [ref=e350]:
    - heading "Pay for the squad, not per seat" [level=2] [ref=e351]
    - paragraph [ref=e352]: Every plan includes Petra, the chat and the approval inbox. Plans differ in how many agents you can run and how much they can do without asking.
    - generic [ref=e353]:
      - generic [ref=e354]:
        - generic [ref=e355]: Starter
        - generic [ref=e356]: $49 / month
        - paragraph [ref=e357]: One shop, a couple of agents, you still do most of the work.
        - list [ref=e358]:
          - listitem [ref=e359]: Up to 3 agents
          - listitem [ref=e360]: 1 squad
          - listitem [ref=e361]: Ask-first mode on every action
          - listitem [ref=e362]: Email support
        - link "Start free" [ref=e363] [cursor=pointer]:
          - /url: /signup
      - generic [ref=e364]:
        - generic [ref=e365]:
          - text: Growth
          - generic [ref=e366]: Most popular
        - generic [ref=e367]: $149 / month
        - paragraph [ref=e368]: A running store that wants the daily work off its plate.
        - list [ref=e369]:
          - listitem [ref=e370]: Up to 10 agents
          - listitem [ref=e371]: 3 squads
          - listitem [ref=e372]: Spend and refund limits
          - listitem [ref=e373]: Agent traffic and audit log
          - listitem [ref=e374]: Priority support
        - link "Start free" [ref=e375] [cursor=pointer]:
          - /url: /signup
      - generic [ref=e376]:
        - generic [ref=e377]: Scale
        - generic [ref=e378]: $399 / month
        - paragraph [ref=e379]: Several stores or regions, each with its own squad.
        - list [ref=e380]:
          - listitem [ref=e381]: Up to 25 agents
          - listitem [ref=e382]: Unlimited squads
          - listitem [ref=e383]: Custom rules and triggers
          - listitem [ref=e384]: Dedicated region and SSO
          - listitem [ref=e385]: Onboarding with a human
        - link "Talk to us" [ref=e386] [cursor=pointer]:
          - /url: /signup
    - paragraph [ref=e387]: All plans start with 14 days free. Prices in USD, billed monthly. [VAT NOTE]
  - generic [ref=e388]:
    - heading "Your first agent can be working by tonight" [level=2] [ref=e389]
    - paragraph [ref=e390]: Tell us about your business, pick a squad, set the limits. Petra takes it from there.
    - generic [ref=e391]:
      - link "Start free" [ref=e392] [cursor=pointer]:
        - /url: /signup
      - link "See a live demo" [ref=e393] [cursor=pointer]:
        - /url: "#"
    - generic [ref=e394]:
      - generic [ref=e395]:
        - img "Pisa, Orders" [ref=e397]
        - text: Pisa
      - generic [ref=e407]:
        - img "Kyoto, Support" [ref=e409]
        - text: Kyoto
      - generic [ref=e420]:
        - img "Rio, Marketing" [ref=e422]
        - text: Rio
      - generic [ref=e430]:
        - img "Petra, running" [ref=e432]
        - text: Petra
      - generic [ref=e440]:
        - img "Zurich, Finance" [ref=e442]
        - text: Zurich
      - generic [ref=e451]:
        - img "Giza, Inventory" [ref=e453]
        - text: Giza
      - generic [ref=e463]:
        - img "Angkor, Website builder" [ref=e465]
        - text: Angkor
  - contentinfo [ref=e475]:
    - generic [ref=e476]:
      - generic [ref=e477]:
        - link [ref=e478] [cursor=pointer]:
          - /url: "#"
          - img "Petra" [ref=e480]
          - text: tensquads
        - paragraph [ref=e488]: A squad of AI agents for small businesses that sell things.
      - generic [ref=e489]:
        - heading "Product" [level=4] [ref=e490]
        - link "Agents" [ref=e491] [cursor=pointer]:
          - /url: "#agents"
        - link "How it works" [ref=e492] [cursor=pointer]:
          - /url: "#how"
        - link "Pricing" [ref=e493] [cursor=pointer]:
          - /url: "#pricing"
        - link "Start free" [ref=e494] [cursor=pointer]:
          - /url: /signup
      - generic [ref=e495]:
        - heading "Company" [level=4] [ref=e496]
        - link "About" [ref=e497] [cursor=pointer]:
          - /url: "#"
        - link "Blog" [ref=e498] [cursor=pointer]:
          - /url: "#"
        - link "Careers" [ref=e499] [cursor=pointer]:
          - /url: "#"
        - link "Contact" [ref=e500] [cursor=pointer]:
          - /url: "#"
      - generic [ref=e501]:
        - heading "Legal" [level=4] [ref=e502]
        - link "Terms" [ref=e503] [cursor=pointer]:
          - /url: "#"
        - link "Privacy" [ref=e504] [cursor=pointer]:
          - /url: "#"
        - link "Security" [ref=e505] [cursor=pointer]:
          - /url: "#"
    - generic [ref=e506]: © 2026 [COMPANY LEGAL NAME]. All rights reserved.
```

# Test source

```ts
  1  | import { readFileSync } from 'node:fs';
  2  | import { test, expect, waitForScreenFonts } from './support.ts';
  3  | import { installPinnedFonts } from './fonts.ts';
  4  | const evidence = '/Users/moeghashim/.no-mistakes/evidence/01M6S4CXD1012BHXS5T6W7340D';
  5  | async function host(page, value='tensquads.moe-678.workers.dev') {
  6  |  await page.route(/^http:\/\/localhost:\d+\//, async route => {
  7  |  const response=await route.fetch({headers:{...route.request().headers(),host:value}});
  8  |  await route.fulfill({response});
  9  |  });
  10 | }
  11 | for (const width of [1440,390]) test(`reviewer visual pair ${width}`, async ({page}) => {
  12 |  await page.emulateMedia({reducedMotion:'reduce'}); await page.setViewportSize({width,height:900}); await host(page); await page.goto('/'); await waitForScreenFonts(page);
  13 |  await expect(page.locator('.c').first()).toHaveClass(/settled/,{timeout:10000});
  14 |  await page.screenshot({path:`${evidence}/built-${width}.png`,fullPage:true});
  15 |  const selectors=['.new','h1','.ask','.cards','.dock','.logos','#agents','#how','#control','#pricing','.final','footer'];
  16 |  const positions=async p=>p.evaluate(selectors=>Object.fromEntries(selectors.map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,{x:r.x,y:r.y,w:r.width,h:r.height}]})),selectors);
  17 |  const built=await positions(page);
  18 |  const design=await page.context().newPage(); await design.setViewportSize({width,height:900}); await design.emulateMedia({reducedMotion:"reduce"});
  19 |  await installPinnedFonts(design,true);
  20 |  await design.route('http://design.local/home-dashboard.jpg',r=>r.fulfill({contentType:'image/jpeg',body:readFileSync('docs/designs/home-v2/home-dashboard.jpg')}));
  21 |  await design.setContent(readFileSync('docs/designs/home-v2/home.html','utf8').replace('<head>','<head><base href="http://design.local/">'));
  22 |  await design.evaluate(()=>document.fonts.ready); await expect(design.locator('.c').first()).toHaveClass(/settled/,{timeout:10000});
  23 |  await design.screenshot({path:`${evidence}/design-${width}.png`,fullPage:true});
> 24 |  expect(await positions(design)).toEqual(built);
     |                                  ^ Error: expect(received).toEqual(expected) // deep equality
  25 |  await design.close();
  26 | });
  27 | test('blocked hydration reveals cards after six seconds',async({browser,baseURL})=>{
  28 |  const page=await browser.newPage(); await installPinnedFonts(page); await host(page);
  29 |  await page.route('**/*', async route=>{if(route.request().resourceType()==='script')await route.abort();else await route.fallback()});
  30 |  await page.goto(baseURL!,{waitUntil:'domcontentloaded'});
  31 |  expect(await page.locator('.c').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).opacity))).toEqual(['0','0','0','0']);
  32 |  await expect(page.locator('.c').first()).toHaveCSS('opacity','1',{timeout:8000});
  33 |  await page.screenshot({path:`evidence}/fallback.png`.replace('evidence}',evidence),fullPage:false});
  34 |  await page.close();
  35 | });
  36 | test('every start link and the decorative approval pills keep their designed behavior',async({page})=>{
  37 |  await host(page); await page.emulateMedia({reducedMotion:'reduce'}); await page.goto('/');
  38 |  await expect(page.locator('.c').first()).toHaveClass(/settled/,{timeout:10000});
  39 |  const cards=page.locator('.c'); const before=await cards.allTextContents();
  40 |  await cards.nth(1).locator('.yes').click(); await cards.nth(1).locator('.no').click();
  41 |  expect(await cards.allTextContents()).toEqual(before); await expect(page.locator('.ask .sr')).toHaveText('3');
  42 |  const links=await page.getByRole('link',{name:'Start free',exact:true}).count();
  43 |  for(let i=0;i<links;i++){await page.getByRole('link',{name:'Start free',exact:true}).nth(i).click();await expect(page).toHaveURL(/\/signup$/);await page.goto('/');}
  44 |  await page.getByRole('link',{name:'Talk to us',exact:true}).click();await expect(page).toHaveURL(/\/signup$/);
  45 | });
  46 | 
```