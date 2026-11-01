# Design token overrides

The base is the light theme in `design/ds/agent-ui/tokens.json`.
Each row is an inline or script-built value from `design/*.dc.html` that is not a light token of the same category.
A spacing token does not hide a radius, a font size, or a line height that uses the same pixels.
A script that joins two strings is included. The joined value is the token, not each half.
`docs/BRIEF.md` says the inline value wins. `apps/web/src/design/tokens.css` adds one custom property for each row.
Dark theme values are not copied. `transparent` and `none` are CSS keywords and are not tokens.

## Colours

| Value | Custom property | Files |
| --- | --- | --- |
| `#000` | `--color-000` | Home.dc.html, SignIn.dc.html |
| `#0169cc33` | `--color-0169cc33` | Main.dc.html |
| `#0285ff14` | `--color-0285ff14` | Main.dc.html |
| `#3a3a3a` | `--color-3a3a3a` | Home.dc.html |
| `#7f54b3` | `--color-7f54b3` | Onboarding.dc.html |
| `#924ff714` | `--color-924ff714` | Main.dc.html |
| `#95bf47` | `--color-95bf47` | Onboarding.dc.html |
| `#c9c9c9` | `--color-c9c9c9` | Home.dc.html, Main.dc.html, Onboarding.dc.html |
| `#e5e9f0` | `--color-e5e9f0` | Home.dc.html, Onboarding.dc.html |
| `#f1641e` | `--color-f1641e` | Onboarding.dc.html |
| `#fb6a2214` | `--color-fb6a2214` | Main.dc.html |
| `#fde2f3` | `--color-fde2f3` | Home.dc.html, Onboarding.dc.html |
| `#ff9900` | `--color-ff9900` | Onboarding.dc.html |
| `rgba(0,0,0,.12)` | `--color-rgba-0-0-0-12` | Main.dc.html |
| `rgba(1,105,204,.08)` | `--color-rgba-1-105-204-08` | Main.dc.html |
| `rgba(13,13,13,.04)` | `--color-rgba-13-13-13-04` | Main.dc.html |
| `rgba(13,13,13,.05)` | `--color-rgba-13-13-13-05` | Main.dc.html |
| `rgba(13,13,13,.06)` | `--color-rgba-13-13-13-06` | Home.dc.html, Main.dc.html, Onboarding.dc.html, SignIn.dc.html |
| `rgba(13,13,13,.08)` | `--color-rgba-13-13-13-08` | Home.dc.html, Main.dc.html, Onboarding.dc.html, SignIn.dc.html |
| `rgba(13,13,13,.1)` | `--color-rgba-13-13-13-1` | Home.dc.html, Main.dc.html, Onboarding.dc.html |
| `rgba(13,13,13,.12)` | `--color-rgba-13-13-13-12` | Home.dc.html, Main.dc.html, Onboarding.dc.html, SignIn.dc.html |
| `rgba(13,13,13,.15)` | `--color-rgba-13-13-13-15` | Onboarding.dc.html |
| `rgba(13,13,13,.16)` | `--color-rgba-13-13-13-16` | Main.dc.html |
| `rgba(13,13,13,.18)` | `--color-rgba-13-13-13-18` | Home.dc.html |
| `rgba(13,13,13,.24)` | `--color-rgba-13-13-13-24` | Main.dc.html |
| `rgba(252,252,252,.9)` | `--color-rgba-252-252-252-9` | Home.dc.html |
| `rgba(255,255,255,.12)` | `--color-rgba-255-255-255-12` | Home.dc.html |
| `rgba(255,255,255,.14)` | `--color-rgba-255-255-255-14` | Home.dc.html |

## Radius

| Value | Custom property | Files |
| --- | --- | --- |
| `12px 12px 0 0` | `--radius-12px-12px-0-0` | Home.dc.html |
| `14px` | `--radius-14px` | Main.dc.html, Onboarding.dc.html |
| `16px 16px 0 0` | `--radius-16px-16px-0-0` | Home.dc.html |
| `28px` | `--radius-28px` | Home.dc.html |
| `3px` | `--radius-3px` | Main.dc.html |
| `4px 4px 0 0` | `--radius-4px-4px-0-0` | Main.dc.html |
| `5px` | `--radius-5px` | Home.dc.html, Main.dc.html |
| `999px` | `--radius-999px` | Home.dc.html, Main.dc.html, Onboarding.dc.html, SignIn.dc.html |

## Shadow

| Value | Custom property | Files |
| --- | --- | --- |
| `0 0 0 1px #181818` | `--shadow-0-0-0-1px-181818` | Onboarding.dc.html |
| `0 0 0 1px rgba(13,13,13,.08)` | `--shadow-0-0-0-1px-rgba-13-13-13-08` | Home.dc.html, Main.dc.html, Onboarding.dc.html, SignIn.dc.html |
| `0 0 0 1px rgba(13,13,13,.08), 0 16px 48px rgba(13,13,13,.06)` | `--shadow-0-0-0-1px-rgba-13-13-13-08-0-16px-48px-rgba-13-13-13-06` | Home.dc.html |
| `0 0 0 1px rgba(13,13,13,.1)` | `--shadow-0-0-0-1px-rgba-13-13-13-1` | Main.dc.html, Onboarding.dc.html |
| `0 0 0 1px rgba(13,13,13,.1), 0 16px 48px rgba(13,13,13,.08)` | `--shadow-0-0-0-1px-rgba-13-13-13-1-0-16px-48px-rgba-13-13-13-08` | Home.dc.html |
| `0 0 0 1px rgba(13,13,13,.1), 0 16px 48px rgba(13,13,13,.16)` | `--shadow-0-0-0-1px-rgba-13-13-13-1-0-16px-48px-rgba-13-13-13-16` | Main.dc.html |
| `0 0 0 1px rgba(13,13,13,.12)` | `--shadow-0-0-0-1px-rgba-13-13-13-12` | Main.dc.html |
| `0 0 0 1px rgba(13,13,13,.18),0 8px 24px rgba(13,13,13,.06)` | `--shadow-0-0-0-1px-rgba-13-13-13-18-0-8px-24px-rgba-13-13-13-06` | Home.dc.html |
| `0 0 0 2px #0169cc` | `--shadow-0-0-0-2px-0169cc` | Main.dc.html |
| `0 0 0 2px #181818` | `--shadow-0-0-0-2px-181818` | Onboarding.dc.html (important) |
| `0 1px 2px rgba(0,0,0,.12)` | `--shadow-0-1px-2px-rgba-0-0-0-12` | Main.dc.html |
| `0 1px 2px rgba(0,0,0,.2)` | `--shadow-0-1px-2px-rgba-0-0-0-2` | Main.dc.html |
| `0 8px 24px rgba(13,13,13,.24)` | `--shadow-0-8px-24px-rgba-13-13-13-24` | Main.dc.html |
| `inset 0 0 0 1px #0169cc33` | `--shadow-inset-0-0-0-1px-0169cc33` | Main.dc.html |
| `inset 0 0 0 1px rgba(13,13,13,.06)` | `--shadow-inset-0-0-0-1px-rgba-13-13-13-06` | Main.dc.html |

## Type

| Value | Custom property | Files |
| --- | --- | --- |
| `'JetBrains Mono', monospace` | `--font-family-jetbrains-mono-monospace` | Home.dc.html, Main.dc.html |
| `Inter, system-ui, sans-serif` | `--font-family-inter-system-ui-sans-serif` | Home.dc.html, Main.dc.html, Onboarding.dc.html, SignIn.dc.html |
| `15px` | `--font-size-15px` | Home.dc.html, Main.dc.html |
| `17px` | `--font-size-17px` | Home.dc.html, Main.dc.html |
| `19px` | `--font-size-19px` | Home.dc.html |
| `22px` | `--font-size-22px` | Main.dc.html, Onboarding.dc.html, SignIn.dc.html |
| `28px` | `--font-size-28px` | Main.dc.html |
| `40px` | `--font-size-40px` | Home.dc.html |
| `44px` | `--font-size-44px` | Home.dc.html |
| `64px` | `--font-size-64px` | Home.dc.html |
| `700` | `--font-weight-700` | Home.dc.html |
| `-0.035em` | `--letter-spacing-0-035em` | Home.dc.html |
| `-0.03em` | `--letter-spacing-0-03em` | Home.dc.html, Onboarding.dc.html |
| `.08em` | `--letter-spacing-08em` | Home.dc.html |
| `22px` | `--line-height-22px` | Home.dc.html, Main.dc.html |
| `23px` | `--line-height-23px` | Home.dc.html |
| `25px` | `--line-height-25px` | Main.dc.html |
| `30px` | `--line-height-30px` | Main.dc.html |
| `34px` | `--line-height-34px` | Main.dc.html |
| `44px` | `--line-height-44px` | Home.dc.html |
| `46px` | `--line-height-46px` | Home.dc.html |
| `50px` | `--line-height-50px` | Home.dc.html |
| `68px` | `--line-height-68px` | Home.dc.html |

## Brief values that are not a light token

These are the `docs/BRIEF.md` Design tokens rows whose value is not a light token.
An inline use of the same value is already in the tables above.

| Brief row | Value |
| --- | --- |
| Card ring | `rgba(13,13,13,.08)` |
| Primary hover | `#000` |
| Soft button | `rgba(13,13,13,.08)` |
| Soft button hover | `rgba(13,13,13,.12)` |
| Blue surface | `#0285ff14` |
| Purple surface | `#924ff714` |
| Orange surface | `#fb6a2214` |
| Primary radius | `999px` |
| Tight heading tracking | `-0.035em` |
| Public body size | `15px` |
| Public body line | `22px` |
| Workspace h1 size | `28px` |
| Workspace h1 line | `34px` |
| Hero size | `64px` |
| Hero line | `68px` |
| Section h2 size | `40px` |
| Section h2 line | `46px` |
| KPI value line | `30px` |

## Required colours

Answer 14 adds thirteen colours. Decision 27 adds the two proof-of-concept tints.

| Value | Result |
| --- | --- |
| `#c9c9c9` | added `--color-c9c9c9` |
| `#3a3a3a` | added `--color-3a3a3a` |
| `rgba(252,252,252,.9)` | added `--color-rgba-252-252-252-9` |
| `rgba(255,255,255,.14)` | added `--color-rgba-255-255-255-14` |
| `rgba(0,0,0,.2)` | already `--shadow-switch-thumb` |
| `rgba(0,0,0,.12)` | added `--color-rgba-0-0-0-12` |
| `rgba(13,13,13,.24)` | added `--color-rgba-13-13-13-24` |
| `#0169cc33` | added `--color-0169cc33` |
| `rgba(1,105,204,.08)` | added `--color-rgba-1-105-204-08` |
| `#95bf47` | added `--color-95bf47` |
| `#7f54b3` | added `--color-7f54b3` |
| `#ff9900` | added `--color-ff9900` |
| `#f1641e` | added `--color-f1641e` |
| `#fde2f3` | added `--color-fde2f3` |
| `#e5e9f0` | added `--color-e5e9f0` |
