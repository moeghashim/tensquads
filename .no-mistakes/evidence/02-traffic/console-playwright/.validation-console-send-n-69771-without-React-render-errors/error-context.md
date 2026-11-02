# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: .validation-console.spec.ts >> send next event selects the new event without React render errors
- Location: e2e/.validation-console.spec.ts:4:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "Cannot update a component (`%s`) while rendering a different component (`%s`). To locate the bad setState() call inside `%s`, follow the stack trace as described in https://react.dev/link/setstate-in-render WorkspaceProvider TrafficPage TrafficPage",
+ ]
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - navigation "Workspace" [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]: M
      - generic [ref=e6]:
        - generic [ref=e7]: Master
        - generic [ref=e8]: Runs 5 squads · Demo store
    - button "Overview" [ref=e9] [cursor=pointer]
    - button "Chat with the master" [ref=e15] [cursor=pointer]
    - button "Squads" [ref=e18] [cursor=pointer]
    - button "Squad traffic" [ref=e23] [cursor=pointer]
    - button "Rules and limits" [ref=e29] [cursor=pointer]
    - generic [ref=e35]: Squads
    - generic [ref=e36]:
      - button "Orders Running" [ref=e37] [cursor=pointer]:
        - generic [ref=e39]: Orders
        - img "Running" [ref=e40]
      - button "Support Running" [ref=e41] [cursor=pointer]:
        - generic [ref=e43]: Support
        - img "Running" [ref=e44]
      - button "Marketing Running" [ref=e45] [cursor=pointer]:
        - generic [ref=e47]: Marketing
        - img "Running" [ref=e48]
      - button "Finance Running" [ref=e49] [cursor=pointer]:
        - generic [ref=e51]: Finance
        - img "Running" [ref=e52]
      - button "Inventory Paused" [ref=e53] [cursor=pointer]:
        - generic [ref=e55]: Inventory
        - img "Paused" [ref=e56]
    - generic [ref=e57]:
      - generic [ref=e58]: MG
      - generic [ref=e59]: Moe Ghashim
  - main [ref=e60]:
    - generic [ref=e62]:
      - generic [ref=e63]:
        - generic [ref=e64]:
          - heading "Squad traffic" [level=1] [ref=e65]
          - paragraph [ref=e66]: Every task, result and relay between Master and the squads, with the payload, the state it changed and the mission target it moved.
        - generic [ref=e67]:
          - button "Paused" [ref=e68] [cursor=pointer]
          - button "Send next event" [active] [ref=e70] [cursor=pointer]
      - region "How messaging works" [ref=e71]:
        - generic [ref=e72]:
          - generic [ref=e73]:
            - generic [ref=e74]: Hub and spoke
            - generic [ref=e75]: Squads talk only to Master
            - generic [ref=e76]: A squad sends Task, Result, Request and Escalation events to Master only. Master decides, then emits Relay or Task events to the target squad. Squads never address each other.
          - generic [ref=e77]:
            - generic [ref=e78]: Mission delta
            - generic [ref=e79]: Every Result moves a target
            - generic [ref=e80]: Each Result carries which mission target it moved and by how much. Master adds these up to score every squad. No separate reports.
          - generic [ref=e81]:
            - generic [ref=e82]: Shared state
            - generic [ref=e83]: Facts live in one store
            - generic [ref=e84]: Squads read the shared state freely. Writes travel on the bus, so Master sees each change and the traffic log shows it.
          - generic [ref=e85]:
            - generic [ref=e86]: Review
            - generic [ref=e87]: Master reviews daily and on every escalation
            - generic [ref=e88]: "It re-scores each squad from the deltas and does one of three things: nothing, re-route work, or propose a mission change. Only a mission change comes to your inbox."
      - region "Squad map" [ref=e89]:
        - generic [ref=e90]:
          - generic [ref=e91]: Master squad
          - generic [ref=e92]: Routes every message · holds shared state · scores missions · checks rules
        - generic [ref=e96]:
          - button "Orders vps-orders-01 2 in · 2 out" [ref=e99] [cursor=pointer]:
            - strong [ref=e102]: Orders
            - generic [ref=e103]: vps-orders-01
            - generic [ref=e104]: 2 in · 2 out
          - button "Support vps-support-01 1 in · 2 out" [ref=e107] [cursor=pointer]:
            - strong [ref=e110]: Support
            - generic [ref=e111]: vps-support-01
            - generic [ref=e112]: 1 in · 2 out
          - button "Marketing vps-marketing-01 0 in · 1 out" [ref=e115] [cursor=pointer]:
            - strong [ref=e118]: Marketing
            - generic [ref=e119]: vps-marketing-01
            - generic [ref=e120]: 0 in · 1 out
          - button "Finance vps-finance-01 0 in · 1 out" [ref=e123] [cursor=pointer]:
            - strong [ref=e126]: Finance
            - generic [ref=e127]: vps-finance-01
            - generic [ref=e128]: 0 in · 1 out
          - button "Inventory vps-inventory-01 1 in · 0 out" [ref=e131] [cursor=pointer]:
            - strong [ref=e134]: Inventory
            - generic [ref=e135]: vps-inventory-01
            - generic [ref=e136]: 1 in · 0 out
      - generic [ref=e137]:
        - region "Message log" [ref=e138]:
          - generic [ref=e140]:
            - button "All agents" [pressed] [ref=e141] [cursor=pointer]
            - button "Orders" [ref=e142] [cursor=pointer]
            - button "Support" [ref=e143] [cursor=pointer]
            - button "Marketing" [ref=e144] [cursor=pointer]
            - button "Finance" [ref=e145] [cursor=pointer]
            - button "Inventory" [ref=e146] [cursor=pointer]
          - generic [ref=e149]:
            - button "11:03 Task Master → Inventory Daily stock check" [ref=e150] [cursor=pointer]:
              - generic [ref=e151]: 11:03
              - generic [ref=e152]: Task
              - generic [ref=e153]: Master → Inventory
              - generic [ref=e154]: Daily stock check
            - 'button "10:56 Result Finance → Master Last 7 days: $8,420 revenue, $2,610 profit" [ref=e155] [cursor=pointer]':
              - generic [ref=e156]: 10:56
              - generic [ref=e157]: Result
              - generic [ref=e158]: Finance → Master
              - generic [ref=e159]: "Last 7 days: $8,420 revenue, $2,610 profit"
            - 'button "10:55 Escalation Support → Master Refund $42 on #A-1012 is under the limit but the customer is flagged" [ref=e160] [cursor=pointer]':
              - generic [ref=e161]: 10:55
              - generic [ref=e162]: Escalation
              - generic [ref=e163]: Support → Master
              - generic [ref=e164]: "Refund $42 on #A-1012 is under the limit but the customer is flagged"
            - button "10:50 Escalation Marketing → Master Wants to raise the prints ad set to $60 a day" [ref=e165] [cursor=pointer]:
              - generic [ref=e166]: 10:50
              - generic [ref=e167]: Escalation
              - generic [ref=e168]: Marketing → Master
              - generic [ref=e169]: Wants to raise the prints ad set to $60 a day
            - button "10:44 Relay Master → Support Here is the print status for T-2291" [ref=e170] [cursor=pointer]:
              - generic [ref=e171]: 10:44
              - generic [ref=e172]: Relay
              - generic [ref=e173]: Master → Support
              - generic [ref=e174]: Here is the print status for T-2291
            - button "10:44 Result Orders → Master Print ships in 2 days, ETA 3 Nov" [ref=e175] [cursor=pointer]:
              - generic [ref=e176]: 10:44
              - generic [ref=e177]: Result
              - generic [ref=e178]: Orders → Master
              - generic [ref=e179]: Print ships in 2 days, ETA 3 Nov
            - 'button "10:43 Relay Master → Orders Support needs the print status for #A-1007" [ref=e180] [cursor=pointer]':
              - generic [ref=e181]: 10:43
              - generic [ref=e182]: Relay
              - generic [ref=e183]: Master → Orders
              - generic [ref=e184]: "Support needs the print status for #A-1007"
            - 'button "10:43 Request Support → Master Customer on #A-1007 asks where the print is" [ref=e185] [cursor=pointer]':
              - generic [ref=e186]: 10:43
              - generic [ref=e187]: Request
              - generic [ref=e188]: Support → Master
              - generic [ref=e189]: "Customer on #A-1007 asks where the print is"
            - button "10:42 Result Orders → Master Sweatshirt shipped, tracking added. Print still in production." [ref=e190] [cursor=pointer]:
              - generic [ref=e191]: 10:42
              - generic [ref=e192]: Result
              - generic [ref=e193]: Orders → Master
              - generic [ref=e194]: Sweatshirt shipped, tracking added. Print still in production.
            - 'button "10:41 Task Master → Orders Check shipping for #A-1007" [ref=e195] [cursor=pointer]':
              - generic [ref=e196]: 10:41
              - generic [ref=e197]: Task
              - generic [ref=e198]: Master → Orders
              - generic [ref=e199]: "Check shipping for #A-1007"
        - complementary "Message details" [ref=e200]:
          - generic [ref=e201]:
            - generic [ref=e202]:
              - heading "Message" [level=2] [ref=e203]
              - generic [ref=e204]: Task
            - generic [ref=e205]: Daily stock check
            - generic [ref=e206]:
              - term [ref=e207]: Route
              - definition [ref=e208]: Master → Inventory
              - term [ref=e209]: Skill
              - definition [ref=e210]: shopify.stock_levels
              - term [ref=e211]: Trace
              - definition [ref=e212]: tr_0cac87
              - term [ref=e213]: Time
              - definition [ref=e214]: 11:03
              - term [ref=e215]: Mission delta
              - definition [ref=e216]: None. Only Result events carry a delta.
            - generic [ref=e217]: Payload
            - generic [ref=e218]: "{ \"trace_id\": \"tr_0cac87\", \"from\": \"master\", \"to\": \"inventory\", \"kind\": \"task\", \"skill\": \"shopify.stock_levels\", \"body\": { \"intent\": \"stock_check\", \"threshold\": 10 } }"
            - generic [ref=e219]: State it wrote
            - generic [ref=e220]: None
          - generic [ref=e223]:
            - heading "Shared state held by Master" [level=2] [ref=e224]
            - paragraph [ref=e225]: Squads read this store, but never write it directly. Every write travels on the bus, so Master sees each change and passes a task only the keys it needs.
            - generic [ref=e226]:
              - generic [ref=e227]:
                - generic [ref=e228]: order.A-1007.tracking
                - generic [ref=e229]: LI400083615LT
              - generic [ref=e230]:
                - generic [ref=e231]: order.A-1007.print_status
                - generic [ref=e232]: in_production
              - generic [ref=e233]:
                - generic [ref=e234]: order.A-1007.eta
                - generic [ref=e235]: 2026-11-03
              - generic [ref=e236]:
                - generic [ref=e237]: policy.refund_auto_limit
                - generic [ref=e238]: "50"
              - generic [ref=e239]:
                - generic [ref=e240]: policy.daily_ad_cap
                - generic [ref=e241]: "200"
              - generic [ref=e242]:
                - generic [ref=e243]: policy.reorder_limit
                - generic [ref=e244]: "500"
              - generic [ref=e245]:
                - generic [ref=e246]: marketing.roas_7d
                - generic [ref=e247]: "3.4"
              - generic [ref=e248]:
                - generic [ref=e249]: finance.revenue_7d
                - generic [ref=e250]: "8420"
              - generic [ref=e251]:
                - generic [ref=e252]: finance.profit_7d
                - generic [ref=e253]: "2610"
              - generic [ref=e254]:
                - generic [ref=e255]: inventory.low_stock
                - generic [ref=e256]: "[\"Black hoodie M\",\"A3 frame\"]"
  - button "M Ask Master 4" [ref=e259] [cursor=pointer]:
    - generic [ref=e260]: M
    - generic [ref=e261]: Ask Master
    - generic [ref=e262]: "4"
```

# Test source

```ts
  1  | import {test,expect} from '../.traffic-validation/workspace.ts';
  2  | import {writeFileSync} from 'node:fs';
  3  | const evidence='/Users/moeghashim/.no-mistakes/evidence/01M6E46V878X5EJFZGJYCAW7KJ';
  4  | test('send next event selects the new event without React render errors',async({page})=>{
  5  |  const errors:string[]=[];
  6  |  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  7  |  page.on('pageerror',error=>errors.push(error.message));
  8  |  await page.goto('/traffic');
  9  |  await page.getByRole('button',{name:'Send next event'}).click();
  10 |  await expect(page.getByRole('complementary',{name:'Message details'})).toContainText('Daily stock check');
  11 |  await page.screenshot({path:`${evidence}/run-send-console.png`,fullPage:true});
  12 |  writeFileSync(`${evidence}/run-console-errors.txt`,errors.join('\n')+'\n');
> 13 |  expect(errors).toEqual([]);
     |                 ^ Error: expect(received).toEqual(expected) // deep equality
  14 | });
  15 | 
```