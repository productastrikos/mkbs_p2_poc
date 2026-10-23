# ASTRIKOS UI THEME — MANDATORY DESIGN SYSTEM SPECIFICATION

> **Version** 1.0 · **Status** Binding · **Scope** Every page, every component, every pixel.
> Derived from *Astrikos Brand Identity Style Guide (BISG) R0-1* — §1.0 Logo, §2.0 Colour, §3.0 Typography, §5.0 Pattern.

---

## 0 · AGENT DIRECTIVE — READ THIS FIRST

You have been given this file as the **single source of truth** for the visual design of this project. Your task is to **retheme the entire application to match this specification exactly**.

### Rules of engagement

1. **Read this entire file before writing a single line of code.** Do not skim. Do not start editing after section 3.
2. **This file overrides the project's existing design.** Where the current code disagrees with this spec, the spec wins. Where the current code has no opinion, this spec supplies one.
3. **Coverage must be total.** Every page, every route, every modal, every card, every button, every table, every empty state, every loading state, every error state. A single unthemed screen is a failed task.
4. **Do not change behaviour, data, logic, routing, or APIs.** This is a *visual* retheme. Markup may be restructured only where it is required to achieve the specified visual result.
5. **Do not invent colours, fonts, radii, shadows, or spacing.** If a value is not in this file, derive it from the scales in this file. Never reach for a raw hex, a stock Tailwind palette colour, or an arbitrary `px` value.
6. **Both themes are mandatory.** Dark and light must both be implemented and both must be correct. Shipping only one is a failed task.
7. **When you finish, run the self-audit in §16** and report the result honestly, including anything you could not convert and why.

### Execution protocol (follow in order)

| Step | Action |
|------|--------|
| 1 | Inventory the project: list every page/route/screen file, every shared component, every stylesheet. Write the list down — it is your checklist. |
| 2 | Detect the styling system in use (Tailwind / CSS Modules / SCSS / styled-components / MUI / Angular Material / plain CSS) and pick the matching integration recipe in §5. |
| 3 | Install the foundation: fonts (§3), the token stylesheet (§5.1), and the framework bridge (§5.2–§5.7). |
| 4 | Convert shared chrome first: app shell, sidebar, header, page header. See §7.1–§7.4. |
| 5 | Convert shared primitives next: buttons, inputs, cards, chips, tables, modals. See §7.5–§7.20. |
| 6 | Walk your page checklist from step 1. Convert **every** page. Tick each one off only after visually verifying it in both themes. |
| 7 | Purge forbidden patterns (§15) with the grep commands provided. |
| 8 | Run the self-audit (§16) and report. |

> **Never stop halfway and ask "shall I continue with the rest of the pages?"** The answer is always yes. Finish the whole application.

---

## 1 · THE TEN LAWS

These are the load-bearing rules. Everything else in this document is an elaboration of them.

1. **Depth is light, never outline.** Surfaces lift with a 1px inner top highlight plus a cast shadow. Hairline borders *separate* regions; they never *enclose* a component for decoration. No heavy 2px frames.
2. **Colour carries meaning, never decoration.** Brand accent appears only on: the primary action, the active navigation item, focus rings, and the AI affordance. Status hues appear only on genuine status. Everything else is neutral.
3. **Neutral is graphite, not blue-grey.** The dark chassis is a true neutral (`#121212`–`#1A1A1A` family). No blue cast, no violet wash, no `slate-800`.
4. **Two typefaces, no exceptions.** *Lexend Deca* sets every heading, label, eyebrow, and numeric display. *Lato* sets every paragraph, table cell, input, and button label. Nothing else is permitted.
5. **Geometry is 60°.** Chamfers, sweeps, accent rules, and gradient angles follow the logo's 60° construction. Practical values: `135deg` for surface gradients, `168deg` for card gradients, `115deg` for sheen.
6. **One radius family.** `6 / 8 / 9 / 10 / 12 / 14 / 999` px. Nothing else. Cards are 14. Controls are 9. Pills are 999.
7. **Everything is a token.** Components consume `var(--app-*)`. No component hard-codes a hex value, ever. Retheming the whole product must be possible by editing the token block alone.
8. **Chrome is identity, not decoration.** The metallic §1.0 gradient appears on the logo mark and on exactly **one** control (the AI/advisory action). Using it anywhere else cheapens it and is a spec violation.
9. **Motion is brief and eased.** 120–300ms, `cubic-bezier(0.22, 1, 0.36, 1)`. Nothing bounces. Nothing loops except deliberate ambience. `prefers-reduced-motion` is always honoured.
10. **Accessibility is not optional.** AA contrast minimum, one visible focus ring style everywhere, keyboard reachable, 44px minimum touch target on touch viewports.

---

## 2 · COLOUR — THE COMPLETE PALETTE

### 2.1 Brand source colours (BISG §2.0 — immutable)

| Token | Hex | Role |
|-------|-----|------|
| Primary / Ink | `#353248` | The brand. Body ink and primary action in light mode. |
| Carbon | `#2F2E33` | Neutral dark. |
| Steel | `#565559` | Secondary text, light mode. |
| Mist | `#E8E6F2` | Raised surface, light mode. |
| Paper | `#F7F7FA` | Soft surface, light mode. |
| Lilac | `#D9D3FF` | Interactive, lightest. |
| Periwinkle | `#A597FF` | Interactive, primary accent. |
| Iris | `#8B82C3` | Interactive, damped — the action button in dark mode. |
| Slate | `#7D7A91` | Faint text, light mode. |
| Go | `#0EBC53` | Status success. |
| Stop | `#D43434` | Status danger. |

> These eleven values are the brand. Every token below is derived from them.

### 2.2 Dark theme tokens — **copy verbatim**

```
/* Master panel colour — retheme every card and panel from here */
--app-panel:          #1A1A1A;

/* Surface ladder: ground → chrome → panel → raised */
--app-bg:             #121212;
--app-chrome-bg:      #171717;
--app-bg-elevated:    #212121;
--app-surface:        #1E1E1E;
--app-surface-soft:   #161616;
--app-surface-raised: #272727;

/* Hairlines */
--app-border:         #2B2B2B;
--app-border-soft:    #232323;
--app-border-strong:  #3A3A3A;
--app-panel-border:   #282828;

/* Type */
--app-text:           #ECECEC;
--app-text-muted:     #A6A6A6;
--app-text-faint:     #787878;

/* Interactive */
--app-accent:         #A79EDA;
--app-accent-strong:  #BDB5E8;
--app-accent-soft:    #C9C3E6;
--app-accent-deep:    #8B82C3;
--app-accent-bg:      rgba(167, 158, 218, 0.10);
--app-accent-border:  rgba(167, 158, 218, 0.26);
--app-glow:           rgba(167, 158, 218, 0.20);

/* Action button */
--app-btn:            #8B82C3;
--app-btn-hover:      #9C93D0;
--app-btn-text:       #FFFFFF;
--app-btn-shadow:     rgba(139, 130, 195, 0.26);

/* Labels on coloured fills */
--app-on-accent:        #FFFFFF;
--app-on-color:         #FFFFFF;
--app-accent-chip-text: #000000;

/* AI / advisory */
--app-advisory:        #8279BC;
--app-advisory-soft:   #9A91CE;
--app-advisory-strong: #6F66A8;
--app-advisory-deep:   #5E5691;
--app-advisory-panel:  #6F66A8;
--app-advisory-border: rgba(130, 121, 188, 0.42);

/* Status */
--app-success:        #22B15C;
--app-success-strong: #1B9A4E;
--app-success-soft:   #4CC47E;
--app-success-bg:     rgba(34, 177, 92, 0.13);
--app-success-border: rgba(34, 177, 92, 0.30);
--app-warning:        #D99B3C;
--app-warning-soft:   #E5B060;
--app-warning-strong: #B8801F;
--app-warning-bg:     rgba(217, 155, 60, 0.13);
--app-warning-border: rgba(217, 155, 60, 0.30);
--app-danger:         #DC4A4A;
--app-danger-soft:    #E86D6D;
--app-danger-strong:  #B93535;
--app-danger-bg:      rgba(220, 74, 74, 0.13);
--app-danger-border:  rgba(220, 74, 74, 0.30);
--app-info:           #5E9BD1;
--app-info-soft:      #7FB2DF;
--app-info-strong:    #4179AE;
--app-info-bg:        rgba(94, 155, 209, 0.13);
--app-info-border:    rgba(94, 155, 209, 0.30);

/* Secondary data series */
--app-violet:      #8279BC;
--app-violet-bg:   rgba(130, 121, 188, 0.12);
--app-teal:        #3FB3A6;
--app-teal-strong: #2F9186;
--app-teal-bg:     rgba(63, 179, 166, 0.12);

/* Charts */
--app-chart-tooltip-bg:     #212121;
--app-chart-tooltip-border: #3A3A3A;
--app-chart-grid:           rgba(255, 255, 255, 0.055);
--app-success-bar:          rgba(34, 177, 92, 0.88);
--app-warning-bar:          rgba(217, 155, 60, 0.88);
--app-danger-bar:           rgba(220, 74, 74, 0.88);

/* Elevation */
--app-shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.55);
--app-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.42);
--app-shadow-md: 0 6px 20px rgba(0, 0, 0, 0.40);
--app-shadow-lg: 0 18px 48px rgba(0, 0, 0, 0.52);
--app-edge-light: inset 0 1px 0 rgba(255, 255, 255, 0.04);

/* Tinted modal / callout cards */
--app-modal-success-bg:      #102418;
--app-modal-success-border:  #1D4A30;
--app-modal-warning-bg:      #261C0D;
--app-modal-warning-border:  #4A3717;
--app-modal-danger-bg:       #271212;
--app-modal-danger-border:   #4D2222;
--app-modal-info-bg:         #141D26;
--app-modal-info-border:     #26384A;
--app-modal-advisory-bg:     #1B1926;
--app-modal-advisory-border: #35314A;
--app-modal-teal-bg:         #102220;
--app-modal-teal-border:     #1D443F;

/* Layout */
--app-sidebar-w: 248px;
--app-header-h:  64px;

/* §1.0 chrome stops — bright set, for dark ground */
--astk-metal-1: #FFFFFF;
--astk-metal-2: #D6D2E4;
--astk-metal-3: #8F8AA8;
--astk-metal-4: #F4F3F8;
--astk-metal-5: #A9A3C0;
--astk-metal-6: #615C7A;
--astk-metal-7: #C3BED4;
--astk-metal-8: #7C7792;
--astk-metal-bevel: rgba(255, 255, 255, 0.55);

--app-pattern-opacity: 0.05;
--app-pattern-stroke:  #A79EDA;
```

### 2.3 Light theme tokens — **copy verbatim**

```
--app-panel:          #FFFFFF;

--app-bg:             #F4F3F9;
--app-chrome-bg:      #FFFFFF;
--app-bg-elevated:    #FFFFFF;
--app-surface:        #FFFFFF;
--app-surface-soft:   #F7F7FA;   /* §2.0 paper */
--app-surface-raised: #E8E6F2;   /* §2.0 mist  */

--app-border:         #E2DFEF;
--app-border-soft:    #EDEBF5;
--app-border-strong:  #CBC6DD;
--app-panel-border:   #E6E3F1;

--app-text:           #353248;   /* §2.0 primary as body ink */
--app-text-muted:     #565559;
--app-text-faint:     #7D7A91;

--app-accent:         #5B4BC4;
--app-accent-strong:  #4A3BA8;
--app-accent-soft:    #8B82C3;
--app-accent-deep:    #353248;
--app-accent-bg:      rgba(91, 75, 196, 0.075);
--app-accent-border:  rgba(91, 75, 196, 0.22);
--app-glow:           rgba(91, 75, 196, 0.15);

--app-btn:            #353248;
--app-btn-hover:      #474264;
--app-btn-text:       #FFFFFF;
--app-btn-shadow:     rgba(53, 50, 72, 0.22);

--app-on-accent:        #FFFFFF;
--app-on-color:         #FFFFFF;
--app-accent-chip-text: #FFFFFF;

--app-advisory:        #5B4BC4;
--app-advisory-soft:   #7466D2;
--app-advisory-strong: #4A3BA8;
--app-advisory-deep:   #3B2F87;
--app-advisory-panel:  #4A3BA8;
--app-advisory-border: rgba(91, 75, 196, 0.38);

/* Status — darkened to hold AA against paper */
--app-success:        #0A8F42;
--app-success-strong: #077535;
--app-success-soft:   #2FA45F;
--app-success-bg:     rgba(10, 143, 66, 0.09);
--app-success-border: rgba(10, 143, 66, 0.26);
--app-warning:        #9A6512;
--app-warning-soft:   #B8791A;
--app-warning-strong: #7A4F0C;
--app-warning-bg:     rgba(154, 101, 18, 0.09);
--app-warning-border: rgba(154, 101, 18, 0.26);
--app-danger:         #BE2E2E;
--app-danger-soft:    #D14545;
--app-danger-strong:  #9C2323;
--app-danger-bg:      rgba(190, 46, 46, 0.08);
--app-danger-border:  rgba(190, 46, 46, 0.24);
--app-info:           #2F6FBF;
--app-info-soft:      #4B87D1;
--app-info-strong:    #22558F;
--app-info-bg:        rgba(47, 111, 191, 0.08);
--app-info-border:    rgba(47, 111, 191, 0.24);

--app-violet:      #5B4BC4;
--app-violet-bg:   rgba(91, 75, 196, 0.09);
--app-teal:        #1F7F74;
--app-teal-strong: #166159;
--app-teal-bg:     rgba(31, 127, 116, 0.09);

--app-chart-tooltip-bg:     #FFFFFF;
--app-chart-tooltip-border: #CBC6DD;
--app-chart-grid:           rgba(53, 50, 72, 0.09);
--app-success-bar:          rgba(10, 143, 66, 0.85);
--app-warning-bar:          rgba(154, 101, 18, 0.85);
--app-danger-bar:           rgba(190, 46, 46, 0.85);

--app-shadow-xs: 0 1px 2px rgba(53, 50, 72, 0.06);
--app-shadow-sm: 0 2px 8px rgba(53, 50, 72, 0.07);
--app-shadow-md: 0 6px 20px rgba(53, 50, 72, 0.09);
--app-shadow-lg: 0 18px 48px rgba(53, 50, 72, 0.14);
--app-edge-light: inset 0 1px 0 rgba(255, 255, 255, 0.9);

--app-modal-success-bg:      rgba(10, 143, 66, 0.07);
--app-modal-success-border:  rgba(10, 143, 66, 0.28);
--app-modal-warning-bg:      rgba(154, 101, 18, 0.08);
--app-modal-warning-border:  rgba(154, 101, 18, 0.28);
--app-modal-danger-bg:       rgba(190, 46, 46, 0.07);
--app-modal-danger-border:   rgba(190, 46, 46, 0.26);
--app-modal-info-bg:         rgba(47, 111, 191, 0.07);
--app-modal-info-border:     rgba(47, 111, 191, 0.26);
--app-modal-advisory-bg:     rgba(91, 75, 196, 0.07);
--app-modal-advisory-border: rgba(91, 75, 196, 0.26);
--app-modal-teal-bg:         rgba(31, 127, 116, 0.07);
--app-modal-teal-border:     rgba(31, 127, 116, 0.26);

--app-sidebar-w: 248px;
--app-header-h:  64px;

/* §1.0 chrome stops — ink set, for paper ground */
--astk-metal-1: #6E6980;
--astk-metal-2: #45415C;
--astk-metal-3: #353248;
--astk-metal-4: #837D97;
--astk-metal-5: #423E59;
--astk-metal-6: #2A2739;
--astk-metal-7: #605B78;
--astk-metal-8: #3B3750;
--astk-metal-bevel: rgba(255, 255, 255, 0.30);

--app-pattern-opacity: 0.06;
--app-pattern-stroke:  #8B82C3;
```

### 2.4 Token selection guide — which token, when

| You are styling… | Use |
|---|---|
| The page background behind everything | `--app-bg` |
| A fixed header or sidebar rail | `--app-chrome-bg` |
| A card, panel, or widget | gradient `168deg, var(--app-surface) → var(--app-surface-soft)` |
| A popover, dropdown, menu, modal body | `--app-bg-elevated` |
| An inset well, an input, a nested tile | `--app-surface-soft` |
| A hovered row, a table header, a track | `--app-surface-raised` |
| A divider between sections | `--app-border` |
| A faint divider inside a list | `--app-border-soft` |
| The edge of a floating element | `--app-border-strong` |
| Primary copy, headings, values | `--app-text` |
| Secondary copy, labels, descriptions | `--app-text-muted` |
| Placeholder, timestamp, hint, eyebrow | `--app-text-faint` |
| The primary CTA fill | `--app-btn` |
| An active nav item, focus ring, selected state | `--app-accent` |
| A subtle accent wash behind a selected item | `--app-accent-bg` |

---

## 3 · TYPOGRAPHY

### 3.1 Families — mandatory

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lexend+Deca:wght@300;400;500;600;700&family=Lato:ital,wght@0,300;0,400;0,700;0,900;1,400&display=swap" rel="stylesheet">
```

Or, in CSS:

```css
@import url('https://fonts.googleapis.com/css2?family=Lexend+Deca:wght@300;400;500;600;700&family=Lato:ital,wght@0,300;0,400;0,700;0,900;1,400&display=swap');
```

| Family | Stack | Used for |
|---|---|---|
| **Lexend Deca** | `'Lexend Deca', system-ui, sans-serif` | All headings `h1–h6`, page titles, eyebrows, nav section labels, KPI values, avatar initials, tab labels, the logo lockup |
| **Lato** | `'Lato', system-ui, -apple-system, sans-serif` | All body copy, paragraphs, table cells, input text, button labels, chips, helper text |
| **JetBrains Mono** *(optional)* | `'JetBrains Mono', ui-monospace, SFMono-Regular, monospace` | Code, IDs, logs, hashes only |

> **Never** use Inter, Roboto, Open Sans, system default, or any other face. Lato is the `body` default; Lexend Deca is applied to headings by the global rule.

### 3.2 Scale (BISG §3.0) — exact values

| Class | Family | Size | Line-height | Tracking | Weight | Use |
|---|---|---|---|---|---|---|
| `.astk-h1` | Lexend Deca | 64px | 1.04 | −0.035em | 700 | Hero / marketing only |
| `.astk-h2` | Lexend Deca | 32px | 1.14 | −0.024em | 700 | Section hero, auth title |
| `.astk-h3` | Lexend Deca | 20px | 1.26 | −0.014em | 700 | **Page title (default)**, modal title |
| `.astk-h4` | Lexend Deca | 12px | 1.34 | +0.02em | 700 | Card title, panel heading |
| `.astk-body1` | Lato | 16px | 1.6 | — | 400 | Long-form copy |
| `.astk-body1-bold` | Lato | 16px | 1.6 | — | 700 | Emphasis in long-form |
| `.astk-body2` | Lato | 14px | 1.55 | — | 400 | **App default** (`body` font-size) |
| `.astk-tiny` | Lato | 10px | 1.4 | +0.04em | 400 | Timestamps, footnotes |
| `.astk-tiny-bold` | Lato | 10px | 1.4 | +0.04em | 700 | Micro-labels |
| `.astk-eyebrow` | Lexend Deca | 10px | — | +0.14em | 600 | UPPERCASE section eyebrow, `--app-text-faint` |

**In-app practical sizes** (these are what real UI chrome uses, all Lato unless noted):
`page title 20px/700 Lexend` · `page subtitle 12px/400` · `card title 12–13px/700 Lexend` · `KPI value 26–32px/700 Lexend` · `nav item 13px/600` · `nav section label 9.5px/600 Lexend uppercase +0.15em` · `button 12–13px/700` · `input 12.5px/400` · `table header 10.5px/700 uppercase +0.06em` · `table cell 12px/400` · `chip 9.5px/700 uppercase +0.06em` · `helper 10px/400`

### 3.3 Numerals

Every metric, KPI, table number, currency, percentage, and axis label **must** use tabular lining figures:

```css
.astk-numeric { font-variant-numeric: tabular-nums lining-nums; font-feature-settings: 'tnum' 1, 'lnum' 1; }
```

### 3.4 Typographic rules

- Headings are **always** Lexend Deca 700. Never a lighter weight, never Lato.
- Body is **always** Lato. Never Lexend Deca for a paragraph.
- Negative tracking on large headings, positive tracking on small uppercase labels. Never the reverse.
- Sentence case for titles and buttons. UPPERCASE only for eyebrows, chips, table headers, and nav section labels.
- Maximum measure for prose: `68ch`.
- Never centre-align a paragraph longer than two lines.

---

## 4 · SPACE, SHAPE, DEPTH, MOTION

### 4.1 Spacing scale (4px base)

`2 · 4 · 6 · 8 · 10 · 12 · 14 · 16 · 18 · 20 · 24 · 28 · 32 · 40 · 48 · 64`

| Context | Value |
|---|---|
| Icon ↔ label gap | 7–8px |
| Inside a chip | 2px 9px |
| Inside a control (button) | 0 14px, height 34px |
| Inside a card | 18px 20px 16px |
| Between cards in a grid | 16px (desktop), 12px (mobile) |
| Between page sections | 24px |
| Page content padding | 24px (desktop), 16px (tablet), 12px (mobile) |
| Page header bottom margin | 18px, with 14px padding-bottom above its rule |

### 4.2 Radius

| Token | Value | Applies to |
|---|---|---|
| `xs` | 6px | Focus ring rounding, tiny tags |
| `sm` | 8px | Icons tiles, menu items |
| `md` | **9px** | **Buttons, inputs, icon buttons, nav items** (the default control radius) |
| `lg` | 10px | Segmented control shell, small panels |
| `xl` | 12px | Dropdowns, popovers |
| `panel` | **14px** | **Cards, panels, modals** (the default surface radius) |
| `full` | 999px | Chips, avatars, progress tracks, status dots |

Nothing outside this set. No `4px`, no `16px`, no `20px`, no `borderRadius: '50%'` on non-circular things.

### 4.3 Elevation — the depth formula

Every raised surface uses **shadow + edge light together**:

```css
box-shadow: var(--app-shadow-sm), var(--app-edge-light);
```

| Level | Shadow token | Used by |
|---|---|---|
| 0 | none | Page ground, flat sections |
| 1 | `--app-shadow-xs` | Segmented controls, inline wells |
| 2 | `--app-shadow-sm` | **Cards and panels at rest** |
| 3 | `--app-shadow-md` | **Cards on hover**, sticky header |
| 4 | `--app-shadow-lg` | Dropdowns, popovers, modals, drawers |

### 4.4 Motion

```css
@keyframes spin           { to { transform: rotate(360deg); } }
@keyframes slide-up       { from { transform: translateY(8px);   opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes slide-in-right { from { transform: translateX(100%);  opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes fade-in        { from { opacity: 0; } to { opacity: 1; } }
@keyframes astk-rise      { from { transform: translateY(14px);  opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes astk-sheen     { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes pulse-glow     { 0%,100% { box-shadow: 0 0 0 0 var(--app-accent-border); } 50% { box-shadow: 0 0 16px 2px var(--app-glow); } }
```

| Interaction | Duration | Easing |
|---|---|---|
| Colour / background / border change | 120–150ms | `ease` |
| Hover lift on a card | 220ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Press (`:active`) | 80ms | `ease` |
| Dropdown / menu entrance | 160–180ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Modal entrance | 250ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Drawer slide | 300ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Progress-bar fill | 450ms | `cubic-bezier(0.22, 1, 0.36, 1)` |
| Theme switch | 240ms | `ease` |

**Press feedback:** buttons `translateY(1px)`; icon buttons `scale(0.95)`. **Hover lift:** cards `translateY(-2px)`. Nothing scales up on hover. Nothing bounces.

`prefers-reduced-motion: reduce` must collapse all of it to `0.01ms` — the rule is in §5.1 and is non-negotiable.

---

## 5 · INSTALLATION

### 5.1 The token stylesheet — create `theme.css` and import it first

> This is the complete foundation. Paste it verbatim, filling §2.2 and §2.3 into the two blocks. Import it **before** any other stylesheet, and before Tailwind's `@tailwind utilities` if Tailwind is present.

```css
@import url('https://fonts.googleapis.com/css2?family=Lexend+Deca:wght@300;400;500;600;700&family=Lato:ital,wght@0,300;0,400;0,700;0,900;1,400&display=swap');

/* 1 · TOKENS — DARK (default) */
:root,
body[data-theme='dark'] {
  color-scheme: dark;
  /* ↓ paste the whole of §2.2 here ↓ */
}

/* 2 · TOKENS — LIGHT */
body[data-theme='light'] {
  color-scheme: light;
  /* ↓ paste the whole of §2.3 here ↓ */
}

/* 3 · BASE & TYPOGRAPHY */
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  font-family: 'Lato', system-ui, -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.55;
  color: var(--app-text);
  background: var(--app-bg);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  transition: background 0.24s ease, color 0.24s ease;
}

h1, h2, h3, h4, h5, h6,
.page-title, .astk-display {
  font-family: 'Lexend Deca', system-ui, sans-serif;
  font-weight: 700;
  letter-spacing: -0.018em;
  color: var(--app-text);
}

.astk-h1 { font-family: 'Lexend Deca', sans-serif; font-weight: 700; font-size: 64px; line-height: 1.04; letter-spacing: -0.035em; }
.astk-h2 { font-family: 'Lexend Deca', sans-serif; font-weight: 700; font-size: 32px; line-height: 1.14; letter-spacing: -0.024em; }
.astk-h3 { font-family: 'Lexend Deca', sans-serif; font-weight: 700; font-size: 20px; line-height: 1.26; letter-spacing: -0.014em; }
.astk-h4 { font-family: 'Lexend Deca', sans-serif; font-weight: 700; font-size: 12px; line-height: 1.34; letter-spacing: 0.02em; }
.astk-body1      { font-family: 'Lato', sans-serif; font-size: 16px; line-height: 1.6; }
.astk-body1-bold { font-family: 'Lato', sans-serif; font-size: 16px; line-height: 1.6; font-weight: 700; }
.astk-body2      { font-family: 'Lato', sans-serif; font-size: 14px; line-height: 1.55; }
.astk-tiny       { font-family: 'Lato', sans-serif; font-size: 10px; line-height: 1.4; letter-spacing: 0.04em; }
.astk-tiny-bold  { font-family: 'Lato', sans-serif; font-size: 10px; line-height: 1.4; letter-spacing: 0.04em; font-weight: 700; }

.astk-numeric, .kpi-value {
  font-variant-numeric: tabular-nums lining-nums;
  font-feature-settings: 'tnum' 1, 'lnum' 1;
}

.astk-eyebrow {
  font-family: 'Lexend Deca', sans-serif;
  font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.14em;
  color: var(--app-text-faint);
}

::selection { background: var(--app-accent); color: #1C1830; }
body[data-theme='light'] ::selection { background: var(--app-accent); color: #FFFFFF; }

/* 4 · SCROLLBARS — thin, always present so layout never shifts */
* { scrollbar-width: thin; scrollbar-color: var(--app-border-strong) transparent; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--app-border-strong);
  border-radius: 999px;
  border: 3px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover { background: var(--app-accent-deep); background-clip: content-box; }
::-webkit-scrollbar-corner { background: transparent; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
.scrollbar-hide::-webkit-scrollbar { display: none; }

/* 5 · FOCUS — one ring, everywhere, keyboard only */
:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
  border-radius: 6px;
}
button:focus:not(:focus-visible),
a:focus:not(:focus-visible),
input:focus:not(:focus-visible) { outline: none; }

/* 6 · MOTION */
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes slide-up { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
@keyframes slide-in-right { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes pulse-glow { 0%,100% { box-shadow: 0 0 0 0 var(--app-accent-border); } 50% { box-shadow: 0 0 16px 2px var(--app-glow); } }
@keyframes astk-sheen { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
@keyframes astk-rise { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.animate-slide-up       { animation: slide-up 0.25s cubic-bezier(0.22, 1, 0.36, 1); }
.animate-slide-in-right { animation: slide-in-right 0.3s cubic-bezier(0.22, 1, 0.36, 1); }
.animate-fade-in        { animation: fade-in 0.22s ease-out; }
.animate-pulse-glow     { animation: pulse-glow 2.2s ease-in-out infinite; }
.astk-rise              { animation: astk-rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* 7 · FORM CONTROLS — native elements, brought onto the palette */
input, select, textarea { font-family: 'Lato', sans-serif; }
select option { background: var(--app-bg-elevated); color: var(--app-text); }
input[type='checkbox'], input[type='radio'], input[type='range'] { accent-color: var(--app-accent); }
```

Then append every component class from §7 to the same file.

### 5.2 Tailwind projects

Add to `tailwind.config.js`. **Re-point the stock ramps** — this is the key move: it means a legacy `bg-slate-800` or `text-purple-400` anywhere in the codebase automatically lands on-brand, and no future edit can reintroduce stock Tailwind blue-grey.

```js
const graphite = { 50:'#F7F7FA',100:'#E8E6F2',200:'#D6D6D6',300:'#B4B4B4',400:'#8E8E8E',500:'#6E6E6E',600:'#4A4A4A',700:'#333333',800:'#242424',900:'#1A1A1A',950:'#121212' };
const periwinkle = { 50:'#F2F0FF',100:'#E4DFFF',200:'#D9D3FF',300:'#C8BEFF',400:'#BCB0FF',500:'#A597FF',600:'#7B5FE0',700:'#6849CC',800:'#5B3FB8',900:'#463091',950:'#2A1C5C' };
const brandGreen = { 50:'#E8FBF0',100:'#C6F5DA',200:'#94EBBB',300:'#6EE7A4',400:'#34D47C',500:'#0EBC53',600:'#0BA648',700:'#098A3C',800:'#076B2F',900:'#054F23',950:'#032E14' };
const brandRed = { 50:'#FDEEEE',100:'#F9D5D5',200:'#F2B4B4',300:'#EFA8A8',400:'#E86A6A',500:'#D43434',600:'#BE2E2E',700:'#A82828',800:'#8A2020',900:'#6B1919',950:'#3F0F0F' };
const brandAmber = { 50:'#FEF7EA',100:'#FCEBCB',200:'#F8D89B',300:'#F5C87A',400:'#F0B65C',500:'#E8A33D',600:'#C4882F',700:'#A87226',800:'#87591D',900:'#664215',950:'#3D270C' };
const brandOrange = { 50:'#FEF3EB',100:'#FCE2CE',200:'#F8C79F',300:'#F5B681',400:'#F2A365',500:'#EE8B3D',600:'#CC7430',700:'#A85E27',800:'#854A1F',900:'#633717',950:'#3B210E' };
const brandAzure = { 50:'#EFF4FF',100:'#DAE5FF',200:'#BFD2FF',300:'#A6C4FF',400:'#8AAEFF',500:'#6E9BFF',600:'#5C87F0',700:'#4A72D6',800:'#3A5CAD',900:'#2B4483',950:'#1A294F' };
const brandTeal = { 50:'#E9FBF8',100:'#C9F4ED',200:'#A3ECE0',300:'#8FE9DA',400:'#6FD9C8',500:'#4FC9BA',600:'#2F9E91',700:'#25837A',800:'#1D6660',900:'#154B47',950:'#0C2C2A' };

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx,vue,svelte}'],
  theme: {
    extend: {
      colors: {
        /* Brand tokens — preferred for new code */
        astrikos: {
          ink:'#353248', carbon:'#2F2E33', steel:'#565559', mist:'#E8E6F2', paper:'#F7F7FA',
          lilac:'#D9D3FF', periwinkle:'#A597FF', iris:'#8B82C3', slate:'#7D7A91',
          go:'#0EBC53', stop:'#D43434',
        },
        /* Live CSS-variable aliases — these follow the active theme */
        app: {
          bg:'var(--app-bg)', panel:'var(--app-panel)', surface:'var(--app-surface)',
          'surface-soft':'var(--app-surface-soft)', 'surface-raised':'var(--app-surface-raised)',
          elevated:'var(--app-bg-elevated)', border:'var(--app-border)',
          'border-strong':'var(--app-border-strong)', text:'var(--app-text)',
          muted:'var(--app-text-muted)', faint:'var(--app-text-faint)',
          accent:'var(--app-accent)', success:'var(--app-success)',
          warning:'var(--app-warning)', danger:'var(--app-danger)', info:'var(--app-info)',
        },
        /* Stock ramps, re-pointed at the brand */
        slate: graphite, gray: graphite, zinc: graphite, neutral: graphite, stone: graphite,
        purple: periwinkle, violet: periwinkle, indigo: periwinkle, fuchsia: periwinkle, pink: periwinkle,
        green: brandGreen, emerald: brandGreen, lime: brandGreen,
        red: brandRed, rose: brandRed,
        amber: brandAmber, yellow: brandAmber, orange: brandOrange,
        blue: brandAzure, sky: brandAzure,
        teal: brandTeal, cyan: brandTeal,
      },
      fontFamily: {
        display: ['"Lexend Deca"', 'system-ui', 'sans-serif'],
        sans: ['Lato', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        'brand-h1':    ['4rem',     { lineHeight:'1.05', letterSpacing:'-0.03em', fontWeight:'700' }],
        'brand-h2':    ['2rem',     { lineHeight:'1.15', letterSpacing:'-0.02em', fontWeight:'700' }],
        'brand-h3':    ['1.25rem',  { lineHeight:'1.25', letterSpacing:'-0.01em', fontWeight:'700' }],
        'brand-h4':    ['0.75rem',  { lineHeight:'1.35', letterSpacing:'0.02em',  fontWeight:'700' }],
        'brand-body':  ['1rem',     { lineHeight:'1.6' }],
        'brand-body2': ['0.875rem', { lineHeight:'1.55' }],
        'brand-tiny':  ['0.625rem', { lineHeight:'1.4', letterSpacing:'0.04em' }],
      },
      borderRadius: { brand: '10px', panel: '14px' },
      boxShadow: {
        'app-xs':'var(--app-shadow-xs)', 'app-sm':'var(--app-shadow-sm)',
        'app-md':'var(--app-shadow-md)', 'app-lg':'var(--app-shadow-lg)',
        'app-edge':'var(--app-edge-light)',
      },
      backgroundImage: {
        'astrikos-chrome':'linear-gradient(135deg,#F7F7FA 0%,#C9C4DC 18%,#8E89A6 38%,#F2F0F7 52%,#9B95B4 68%,#5B5770 86%,#B4AFC8 100%)',
        'astrikos-ink':'linear-gradient(160deg,#353248 0%,#221E31 55%,#17141F 100%)',
      },
      keyframes: { 'astrikos-sheen': { '0%':{ backgroundPosition:'0% 50%' }, '100%':{ backgroundPosition:'200% 50%' } } },
    },
  },
  plugins: [],
};
```

### 5.3 CSS Modules / SCSS projects
Import `theme.css` once in the root entry. Reference `var(--app-*)` inside every module. Do not create per-module colour variables.

### 5.4 styled-components / Emotion
Import `theme.css` globally. In the `ThemeProvider`, map the theme object to the CSS variables — `colors: { bg: 'var(--app-bg)', … }` — so the runtime theme switch still works through `data-theme`.

### 5.5 MUI
Import `theme.css`, then build `createTheme` with `palette.mode` driven by `data-theme`, `palette.primary.main` = `#353248` (light) / `#8B82C3` (dark), `typography.fontFamily` = Lato with `h1–h6` overridden to Lexend Deca 700, `shape.borderRadius` = 9, and `components.MuiPaper.styleOverrides.root` set to the card recipe in §7.5.

### 5.6 Angular / Vue / Svelte
Identical: `theme.css` in the global stylesheet, `data-theme` on `<body>`, component styles consume `var(--app-*)`.

### 5.7 Theme switching — implement exactly this

```js
const KEY = 'astrikos-theme';
export function applyTheme(mode /* 'dark' | 'light' */) {
  document.body.setAttribute('data-theme', mode);
  try { localStorage.setItem(KEY, mode); } catch {}
}
export function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch {}
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(saved || (prefersLight ? 'light' : 'dark'));
}
```

Call `initTheme()` before first paint. **Dark is the default.** The attribute lives on `<body>`, never on `<html>` and never as a class.

---

## 6 · BRAND SURFACES (§1.0, §5.0)

Use these sparingly and exactly as described.

> **Asset dependency:** `.astk-pattern` masks `/astrikos-pattern.svg` from the public root. If the target project does not have that asset, either (a) copy it across from the brand assets, or (b) omit `.astk-pattern` entirely and use `.astk-aurora` alone. **Never** ship the class pointing at a missing file — it renders as a flat accent-coloured wash over the region. Same for the logo mark: if no brand SVG is available, use the `.astk-lockup` text lockup on its own.

```css
/* §5.0 pattern as a texture — behind content, never interactive.
   Painted as a mask so the stroke colour comes from a token and follows the theme. */
.astk-pattern::before {
  content: ''; position: absolute; inset: 0;
  background: var(--app-pattern-stroke);
  -webkit-mask-image: url('/astrikos-pattern.svg'); mask-image: url('/astrikos-pattern.svg');
  -webkit-mask-size: 260px 260px; mask-size: 260px 260px;
  -webkit-mask-repeat: repeat; mask-repeat: repeat;
  opacity: var(--app-pattern-opacity);
  pointer-events: none; z-index: 0;
}
.astk-pattern > * { position: relative; z-index: 1; }

/* A 60° light sweep — the logo's construction angle, as page/panel ambience. */
.astk-aurora::after {
  content: ''; position: absolute; inset: 0;
  background:
    radial-gradient(60% 55% at 14% 0%, rgba(165,151,255,0.16), transparent 62%),
    radial-gradient(52% 48% at 92% 8%, rgba(123,95,224,0.13), transparent 60%);
  pointer-events: none; z-index: 0;
}

/* §1.0 metal — identity moments only. */
.astk-chrome-text {
  background: linear-gradient(135deg,
    var(--astk-metal-1) 0%,  var(--astk-metal-2) 14%, var(--astk-metal-3) 30%, var(--astk-metal-4) 44%,
    var(--astk-metal-5) 58%, var(--astk-metal-6) 74%, var(--astk-metal-7) 88%, var(--astk-metal-8) 100%);
  -webkit-background-clip: text; background-clip: text;
  color: transparent; -webkit-text-fill-color: transparent;
}

/* Any region painting brand ink in BOTH themes (auth panel, dark hero) pins the
   metal to its bright set so light mode cannot darken a mark already on #353248. */
.astk-on-ink {
  --astk-metal-1:#FFFFFF; --astk-metal-2:#D6D2E4; --astk-metal-3:#8F8AA8; --astk-metal-4:#F4F3F8;
  --astk-metal-5:#A9A3C0; --astk-metal-6:#615C7A; --astk-metal-7:#C3BED4; --astk-metal-8:#7C7792;
  --astk-metal-bevel: rgba(255,255,255,0.55);
  --app-pattern-stroke:#A597FF; --app-pattern-opacity:0.085;
}

/* Logo lockup */
.astk-lockup { display:flex; align-items:center; gap:11px; min-width:0; }
.astk-lockup-rule {
  width:1px; align-self:stretch; margin:2px 0; flex-shrink:0;
  background: linear-gradient(180deg, transparent, var(--app-border-strong) 22%, var(--app-border-strong) 78%, transparent);
}
.astk-lockup-text { display:flex; flex-direction:column; min-width:0; line-height:1.1; }
.astk-lockup-name       { font-family:'Lexend Deca',sans-serif; font-size:13px;   font-weight:700; letter-spacing:0.26em; color:var(--app-text); white-space:nowrap; }
.astk-lockup-product    { font-family:'Lato',sans-serif;        font-size:10.5px; font-weight:700; letter-spacing:0.04em; color:var(--app-accent); margin-top:3px; white-space:nowrap; }
.astk-lockup-descriptor { font-family:'Lato',sans-serif;        font-size:9.5px;  color:var(--app-text-faint); margin-top:1px; white-space:nowrap; }
```

**Logo rules (BISG §1.0 Don'ts):** never flatten the mark to a single flat colour, never recolour it outside the metal sets, never stretch, rotate, or add effects, never place it on a busy photo without the ink plate. Clear space around the lockup ≥ the height of the monogram.

---

## 7 · COMPONENT SPECIFICATIONS

Every component below is normative. Copy the CSS into `theme.css` and apply the class in markup.

### 7.1 App shell

```
┌──────────────────────────────────────────────────────────┐
│ HEADER  height 64px · --app-chrome-bg · bottom hairline  │
├────────────┬─────────────────────────────────────────────┤
│ SIDEBAR    │ MAIN                                        │
│ 248px      │ --app-bg · padding 24px · scrolls           │
│ chrome-bg  │  ┌ page-header-block ──────────────────┐    │
│ right      │  └─────────────────────────────────────┘    │
│ hairline   │  ┌ content grid ───────────────────────┐    │
│            │  └─────────────────────────────────────┘    │
└────────────┴─────────────────────────────────────────────┘
```

- Header is `position: sticky; top: 0; z-index: 100`, `background: var(--app-chrome-bg)`, `border-bottom: 1px solid var(--app-border)`, `height: var(--app-header-h)`, horizontal padding 20px, `display:flex; align-items:center; gap:16px`.
- Sidebar is `width: var(--app-sidebar-w)`, `background: var(--app-chrome-bg)`, `border-right: 1px solid var(--app-border)`, full height, `overflow-y: auto`.
- Main is `flex:1; min-width:0; overflow-y:auto; background: var(--app-bg); padding: 24px`.
- Below 1024px the sidebar becomes an off-canvas drawer (`slide-in-right` reversed, backdrop `rgba(0,0,0,0.5)`).

### 7.2 Sidebar navigation

```css
.nav-section-label {
  font-family:'Lexend Deca',sans-serif; font-size:9.5px; font-weight:600;
  text-transform:uppercase; letter-spacing:0.15em;
  color:var(--app-text-faint); padding:18px 16px 7px; user-select:none;
}
.nav-item {
  position:relative; display:flex; align-items:center; gap:12px; width:100%;
  padding:9px 12px; border:none; border-radius:9px; background:transparent;
  font-family:'Lato',sans-serif; font-size:13px; font-weight:600; line-height:1.3;
  color:var(--app-text-muted); text-align:left; cursor:pointer;
  transition:color .15s ease, background .15s ease;
}
/* The active marker is a 3px brand rule growing out of the rail — never a pill. */
.nav-item::before {
  content:''; position:absolute; left:-8px; top:50%;
  width:3px; height:0; border-radius:0 3px 3px 0;
  background:var(--app-accent); transform:translateY(-50%);
  transition:height .24s cubic-bezier(0.22,1,0.36,1);
}
.nav-item:hover        { background:var(--app-accent-bg); color:var(--app-text); }
.nav-item.active       { color:var(--app-text); background:linear-gradient(90deg,var(--app-accent-bg),transparent 88%); }
.nav-item.active::before { height:20px; }
.nav-item.active svg   { color:var(--app-accent); }
.nav-item svg          { flex-shrink:0; transition:color .15s ease, transform .2s ease; }
.nav-item:hover svg    { transform:translateX(1px); }
```

### 7.3 Page header

```css
.page-header-block {
  display:flex; align-items:flex-end; justify-content:space-between; gap:16px;
  padding-bottom:14px; margin-bottom:18px; border-bottom:1px solid var(--app-border);
}
.page-title {
  font-family:'Lexend Deca',sans-serif; font-size:20px; font-weight:700;
  line-height:1.2; letter-spacing:-0.022em; color:var(--app-text);
}
.page-subtitle { font-family:'Lato',sans-serif; font-size:12px; color:var(--app-text-muted); margin-top:3px; }
```

Every page starts with this block: title left, subtitle beneath it, page-level actions right. No exceptions.

### 7.4 Header search

```css
.header-search {
  display:flex; align-items:center; gap:8px; padding:7px 12px;
  border:1px solid var(--app-border); border-radius:9px; background:var(--app-surface-soft);
  transition:border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.header-search:focus-within {
  border-color:var(--app-accent-border); background:var(--app-surface);
  box-shadow:0 0 0 3px var(--app-accent-bg);
}
.header-search input {
  width:100%; min-width:0; border:none; outline:none; background:transparent;
  font-family:'Lato',sans-serif; font-size:12.5px; color:var(--app-text);
}
.header-search input::placeholder { color:var(--app-text-faint); }
```

### 7.5 Cards & panels — **the signature component**

```css
.kpi-card, .astk-panel {
  position:relative; display:flex; flex-direction:column;
  background:linear-gradient(168deg, var(--app-surface) 0%, var(--app-surface-soft) 100%);
  border:1px solid var(--app-border);
  border-radius:14px;
  padding:18px 20px 16px;
  box-shadow:var(--app-shadow-sm), var(--app-edge-light);
  overflow:hidden;
  transition:transform .22s cubic-bezier(0.22,1,0.36,1), box-shadow .22s ease, border-color .22s ease;
}
/* The signature: a 60° chamfer of brand light across the top-left, revealed on hover.
   Lifted from the monogram's apex angle (§1.0). */
.kpi-card::before, .astk-panel::before {
  content:''; position:absolute; top:-1px; left:18px; width:42px; height:2px;
  background:linear-gradient(90deg, var(--app-accent), transparent);
  opacity:0; transition:opacity .22s ease, width .28s cubic-bezier(0.22,1,0.36,1);
}
.kpi-card:hover, .astk-panel:hover {
  transform:translateY(-2px);
  border-color:var(--app-border-strong);
  box-shadow:var(--app-shadow-md), var(--app-edge-light);
}
.kpi-card:hover::before, .astk-panel:hover::before { opacity:1; width:76px; }
```

**Every card in the application must use this.** Internal anatomy, top to bottom:

| Slot | Spec |
|---|---|
| Eyebrow / label | `.astk-eyebrow` or 10–11px Lato 700 uppercase, `--app-text-faint` |
| Icon tile *(optional)* | 28–32px square, radius 8px, `background: var(--app-surface-raised)`, icon `var(--app-accent)` or status hue |
| Value | 26–32px Lexend Deca 700, `--app-text`, `.astk-numeric` |
| Delta / trend | 11px Lato 700, `--app-success` / `--app-danger`, with a directional icon |
| Footer / sparkline | 10px `--app-text-faint`, separated by `1px solid var(--app-border-soft)` and 10px padding-top |

**Status-tinted panels** use the `--app-modal-*` pairs: `background: var(--app-modal-danger-bg); border-color: var(--app-modal-danger-border)`.

### 7.6 Buttons

```css
/* Primary — the one filled action per view */
.app-primary-btn, .app-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:7px;
  border:none; border-radius:9px;
  background:var(--app-btn); color:var(--app-btn-text);
  font-family:'Lato',sans-serif; font-weight:700; letter-spacing:0.01em;
  cursor:pointer;
  box-shadow:0 2px 10px var(--app-btn-shadow), var(--app-edge-light);
  transition:background .15s ease, box-shadow .18s ease, transform .08s ease;
}
.app-primary-btn:hover:not(:disabled), .app-btn:hover:not(:disabled) {
  background:var(--app-btn-hover);
  box-shadow:0 5px 18px var(--app-btn-shadow), var(--app-edge-light);
}
.app-primary-btn:active:not(:disabled), .app-btn:active:not(:disabled) { transform:translateY(1px); }
.app-primary-btn:disabled, .app-btn:disabled { opacity:.45; cursor:not-allowed; box-shadow:none; }

/* Secondary / control — the default for everything that is not THE action */
.app-control-btn {
  border:1px solid var(--app-border); border-radius:9px;
  background:var(--app-surface-soft); color:var(--app-text-muted);
  font-family:'Lato',sans-serif; font-weight:600; cursor:pointer;
  transition:color .15s ease, background .15s ease, border-color .15s ease;
}
.app-control-btn:hover {
  color:var(--app-text); background:var(--app-surface-raised); border-color:var(--app-border-strong);
}

/* Icon button */
.icon-btn {
  width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center;
  flex-shrink:0; position:relative;
  border:1px solid var(--app-border); border-radius:9px;
  background:var(--app-surface-soft); color:var(--app-text-muted); cursor:pointer;
  transition:color .15s ease, background .15s ease, border-color .15s ease, transform .08s ease;
}
.icon-btn:hover  { background:var(--app-surface-raised); color:var(--app-text); border-color:var(--app-border-strong); }
.icon-btn:active { transform:scale(.95); }
.icon-btn.active { background:var(--app-accent-bg); color:var(--app-accent); border-color:var(--app-accent-border); }

/* Ghost / tertiary */
.app-ghost-btn {
  border:none; border-radius:9px; background:transparent; color:var(--app-text-muted);
  font-family:'Lato',sans-serif; font-weight:600; cursor:pointer;
  transition:color .15s ease, background .15s ease;
}
.app-ghost-btn:hover { background:var(--app-accent-bg); color:var(--app-text); }

/* Destructive */
.app-danger-btn {
  border:1px solid var(--app-danger-border); border-radius:9px;
  background:var(--app-danger-bg); color:var(--app-danger);
  font-family:'Lato',sans-serif; font-weight:700; cursor:pointer;
  transition:background .15s ease, color .15s ease;
}
.app-danger-btn:hover { background:var(--app-danger); color:#FFF; }
```

**Sizes:** `sm` height 28px / padding 0 10px / 11px · `md` **height 34px / padding 0 14px / 12.5px (default)** · `lg` height 40px / padding 0 18px / 13px.

**Hierarchy law:** exactly **one** primary button per view or per modal. Everything else is control, ghost, or icon. Destructive actions are never the primary style.

### 7.7 AI / advisory button — the single chrome control

> This is the **only** place the §1.0 metal appears outside the logo. Use it once, for the AI affordance. Using it elsewhere is a spec violation.

```css
.app-advisory-btn {
  position:relative; display:inline-flex; align-items:center; gap:7px;
  height:34px; padding:0 14px; flex-shrink:0;
  border:1px solid var(--app-advisory-border); border-radius:9px;
  background:linear-gradient(135deg, var(--app-advisory) 0%, var(--app-advisory-panel) 100%);
  color:#FFFFFF;
  font-family:'Lexend Deca',sans-serif; font-size:11px; font-weight:600; letter-spacing:0.05em;
  cursor:pointer; overflow:hidden;
  box-shadow:0 2px 12px rgba(123,95,224,.32), var(--app-edge-light);
  transition:box-shadow .2s ease, transform .08s ease;
}
/* A slow chrome sheen travels the button — the mark's metal, in motion. */
.app-advisory-btn::after {
  content:''; position:absolute; inset:0;
  background:linear-gradient(115deg, transparent 38%, rgba(255,255,255,.38) 50%, transparent 62%);
  background-size:200% 100%; opacity:0; transition:opacity .2s ease; pointer-events:none;
}
.app-advisory-btn:hover        { box-shadow:0 5px 20px rgba(123,95,224,.46), var(--app-edge-light); }
.app-advisory-btn:hover::after { opacity:1; animation:astk-sheen 1.1s linear infinite; }
.app-advisory-btn:active       { transform:translateY(1px); }
.app-advisory-btn.is-on, .app-advisory-btn.active {
  box-shadow:0 0 0 2px var(--app-accent), 0 5px 20px rgba(123,95,224,.46);
}
.app-advisory-btn svg, .app-advisory-btn span { position:relative; z-index:1; }
```

### 7.8 Segmented control (timeframe / view switcher)

```css
.app-timeframe-control {
  display:inline-flex; align-items:center; gap:2px; padding:3px;
  border:1px solid var(--app-border); border-radius:10px;
  background:var(--app-surface-soft); box-shadow:var(--app-shadow-xs);
}
.app-timeframe-btn {
  appearance:none; padding:4px 11px; border:1px solid transparent; border-radius:7px;
  background:transparent;
  font-family:'Lato',sans-serif; font-size:10.5px; font-weight:700; letter-spacing:.03em; line-height:1;
  color:var(--app-text-faint); cursor:pointer;
  transition:color .15s ease, background .15s ease, border-color .15s ease;
}
.app-timeframe-btn:hover     { color:var(--app-text); background:var(--app-surface-raised); }
.app-timeframe-btn.is-active { color:var(--app-accent); background:var(--app-accent-bg); border-color:var(--app-accent-border); }
```

### 7.9 Chips, badges, status dots

```css
.status-chip {
  display:inline-flex; align-items:center; gap:5px; padding:2px 9px;
  border:1px solid; border-radius:999px;
  font-family:'Lato',sans-serif; font-size:9.5px; font-weight:700;
  letter-spacing:.06em; text-transform:uppercase; white-space:nowrap;
}
.status-chip-success { background:var(--app-success-bg); color:var(--app-success); border-color:var(--app-success-border); }
.status-chip-warning { background:var(--app-warning-bg); color:var(--app-warning); border-color:var(--app-warning-border); }
.status-chip-danger  { background:var(--app-danger-bg);  color:var(--app-danger);  border-color:var(--app-danger-border); }
.status-chip-info    { background:var(--app-info-bg);    color:var(--app-info);    border-color:var(--app-info-border); }
.status-chip-accent  { background:var(--app-accent-bg);  color:var(--app-accent);  border-color:var(--app-accent-border); }
.status-chip-neutral { background:var(--app-surface-raised); color:var(--app-text-muted); border-color:var(--app-border); }

/* Live status dot with a halo */
.status-dot {
  width:6px; height:6px; border-radius:999px; flex-shrink:0;
  background:var(--app-success); box-shadow:0 0 0 3px var(--app-success-bg);
}
```

**Semantics — apply consistently across the whole app:** success/online/healthy → success · warning/degraded/pending → warning · error/offline/critical → danger · informational/scheduled → info · selected/AI → accent · inactive/unknown → neutral.

### 7.10 Progress

```css
.progress-track { height:5px; border-radius:999px; background:var(--app-surface-raised); overflow:hidden; }
.progress-fill  { height:100%; border-radius:999px; transition:width .45s cubic-bezier(0.22,1,0.36,1); }
```

Fill colour is threshold-driven: `< 70%` → `--app-success`, `70–89%` → `--app-warning`, `≥ 90%` → `--app-danger`. Never a gradient rainbow.

### 7.11 Tables

```css
.app-table { width:100%; border-collapse:collapse; text-align:left; }
.app-table thead { position:sticky; top:0; z-index:10; }
.app-table thead tr { background:var(--app-surface-raised); }
.app-table th {
  padding:9px 12px;
  font-family:'Lato',sans-serif; font-size:10.5px; font-weight:700;
  text-transform:uppercase; letter-spacing:.06em; color:var(--app-text-muted);
  border-bottom:1px solid var(--app-border); white-space:nowrap;
}
.app-table td {
  padding:10px 12px;
  font-family:'Lato',sans-serif; font-size:12px; color:var(--app-text);
  border-bottom:1px solid var(--app-border-soft);
}
.app-table tbody tr { transition:background .12s ease; }
.app-table tbody tr:hover { background:var(--app-accent-bg); }
.app-table tbody tr:last-child td { border-bottom:none; }
.app-table td.numeric, .app-table th.numeric {
  text-align:right; font-variant-numeric:tabular-nums lining-nums;
}
```

Wrap every table in `.astk-panel` with `padding:0` and an `overflow-x:auto` container. **Never zebra-stripe** — hover is the row affordance. Numeric columns are right-aligned and tabular. Sortable headers get a 12px chevron in `--app-text-faint`, becoming `--app-accent` when active.

### 7.12 Dropdowns, menus, popovers

```css
.search-dropdown, .app-popover {
  position:absolute; top:calc(100% + 8px); left:0; right:0;
  min-width:360px; max-height:440px; overflow:hidden auto; z-index:2000;
  background:var(--app-bg-elevated);
  border:1px solid var(--app-border-strong); border-radius:12px;
  box-shadow:var(--app-shadow-lg);
  animation:slide-up .16s ease-out;
}
.search-dropdown-item {
  display:flex; align-items:center; gap:10px; width:100%; padding:9px 12px;
  border:none; border-bottom:1px solid var(--app-border-soft);
  background:transparent; cursor:pointer; text-align:left; transition:background .12s;
}
.search-dropdown-item:last-child { border-bottom:none; }
.search-dropdown-item:hover, .search-dropdown-item:focus { background:var(--app-accent-bg); outline:none; }
.search-dropdown-item .sdi-icon {
  width:28px; height:28px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
  border-radius:8px; background:var(--app-surface-raised); color:var(--app-accent);
}
.search-dropdown-item .sdi-label { font-size:12px; font-weight:700; color:var(--app-text); line-height:1.3; }
.search-dropdown-item .sdi-desc  { font-size:10px; color:var(--app-text-faint); margin-top:1px; }
.search-dropdown-empty { padding:14px; text-align:center; font-size:11px; color:var(--app-text-faint); }
```

### 7.13 Profile menu & avatar

```css
.profile-menu {
  position:absolute; top:calc(100% + 10px); right:0; min-width:236px; z-index:1200; overflow:hidden;
  background:var(--app-bg-elevated); border:1px solid var(--app-border-strong);
  border-radius:13px; box-shadow:var(--app-shadow-lg);
  animation:slide-up .18s cubic-bezier(0.22,1,0.36,1);
}
.profile-menu-header {
  display:flex; align-items:center; gap:11px; padding:13px 14px;
  border-bottom:1px solid var(--app-border);
  background:linear-gradient(135deg, var(--app-accent-bg), transparent 70%);
}
.profile-menu-header .avatar {
  width:36px; height:36px; flex-shrink:0; display:flex; align-items:center; justify-content:center;
  border-radius:999px; background:linear-gradient(135deg, var(--app-accent), var(--app-accent-deep));
  color:#FFF; font-family:'Lexend Deca',sans-serif; font-weight:700; font-size:13px;
}
.profile-menu-header .name   { font-family:'Lexend Deca',sans-serif; font-size:12.5px; font-weight:700; color:var(--app-text); line-height:1.2; }
.profile-menu-header .status { display:inline-flex; align-items:center; gap:5px; margin-top:3px; font-size:10px; color:var(--app-success); }
.profile-menu-header .status::before {
  content:''; width:6px; height:6px; border-radius:999px;
  background:var(--app-success); box-shadow:0 0 0 3px var(--app-success-bg);
}
.profile-menu-section { padding:6px; }
.profile-menu-section + .profile-menu-section { border-top:1px solid var(--app-border); }
.profile-menu-item {
  display:flex; align-items:center; gap:10px; width:100%; padding:8px 10px;
  border:none; border-radius:8px; background:transparent;
  font-family:'Lato',sans-serif; font-size:12px; font-weight:600;
  color:var(--app-text-muted); text-align:left; cursor:pointer;
  transition:background .12s ease, color .12s ease;
}
.profile-menu-item:hover        { background:var(--app-accent-bg); color:var(--app-text); }
.profile-menu-item.danger       { color:var(--app-danger); }
.profile-menu-item.danger:hover { background:var(--app-danger-bg); color:var(--app-danger); }
.profile-menu-item svg          { width:16px; height:16px; flex-shrink:0; opacity:.85; }

.profile-trigger {
  width:36px; height:36px; flex-shrink:0; display:inline-flex; align-items:center; justify-content:center;
  border:1px solid var(--app-accent-border); border-radius:999px;
  background:linear-gradient(135deg, var(--app-accent), var(--app-accent-deep));
  color:#FFF; font-family:'Lexend Deca',sans-serif; font-weight:700; font-size:13px;
  cursor:pointer; transition:box-shadow .18s ease, transform .08s ease;
}
.profile-trigger:hover  { box-shadow:0 0 0 4px var(--app-accent-bg); }
.profile-trigger:active { transform:scale(.96); }
```

### 7.14 Modals & dialogs

```css
.app-modal-backdrop {
  position:fixed; inset:0; z-index:1500;
  display:flex; align-items:center; justify-content:center; padding:24px;
  background:rgba(0,0,0,.55);
  animation:fade-in .18s ease-out;
}
body[data-theme='light'] .app-modal-backdrop { background:rgba(53,50,72,.32); }

.app-modal {
  width:100%; max-width:560px; max-height:calc(100vh - 48px);
  display:flex; flex-direction:column; overflow:hidden;
  background:var(--app-bg-elevated);
  border:1px solid var(--app-border-strong); border-radius:14px;
  box-shadow:var(--app-shadow-lg), var(--app-edge-light);
  animation:slide-up .25s cubic-bezier(0.22,1,0.36,1);
}
.app-modal-header {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  padding:16px 20px; border-bottom:1px solid var(--app-border);
}
.app-modal-title  { font-family:'Lexend Deca',sans-serif; font-size:15px; font-weight:700; color:var(--app-text); }
.app-modal-body   { padding:20px; overflow-y:auto; flex:1; }
.app-modal-footer {
  display:flex; align-items:center; justify-content:flex-end; gap:10px;
  padding:14px 20px; border-top:1px solid var(--app-border); background:var(--app-surface-soft);
}
```

Widths: `sm 420px · md 560px (default) · lg 760px · xl 1000px`. Close with Esc, backdrop click, and an `.icon-btn` X in the header. Trap focus; restore focus to the trigger on close. Footer: cancel (`.app-control-btn`) left of confirm (`.app-primary-btn`).

### 7.15 Drawers / slide-over panels

Right-anchored, `width: 420px` (`100%` below 640px), full height, `background: var(--app-bg-elevated)`, `border-left: 1px solid var(--app-border-strong)`, `box-shadow: var(--app-shadow-lg)`, `animation: slide-in-right 0.3s cubic-bezier(0.22,1,0.36,1)`. Same header/body/footer anatomy as the modal.

### 7.16 Toasts / notifications

Fixed `top: 76px; right: 20px; z-index: 3000`, stacked with 10px gaps. Each: `min-width 280px; max-width 400px; padding 12px 14px; border-radius 12px; background: var(--app-bg-elevated); border: 1px solid` the status border token; `border-left: 3px solid` the status colour; `box-shadow: var(--app-shadow-lg)`; `animation: slide-in-right 0.3s cubic-bezier(0.22,1,0.36,1)`. Title 12px Lato 700, body 11px `--app-text-muted`. Auto-dismiss 5s (success/info), 8s (warning), manual only (danger).

### 7.17 Form controls

```css
.app-input, .app-select, .app-textarea {
  width:100%; padding:8px 11px;
  border:1px solid var(--app-border); border-radius:9px;
  background:var(--app-surface-soft); color:var(--app-text);
  font-family:'Lato',sans-serif; font-size:12.5px; line-height:1.5;
  transition:border-color .15s ease, background .15s ease, box-shadow .15s ease;
}
.app-input::placeholder { color:var(--app-text-faint); }
.app-input:hover  { border-color:var(--app-border-strong); }
.app-input:focus  {
  outline:none; border-color:var(--app-accent-border);
  background:var(--app-surface); box-shadow:0 0 0 3px var(--app-accent-bg);
}
.app-input:disabled { opacity:.5; cursor:not-allowed; }
.app-input.is-invalid { border-color:var(--app-danger-border); box-shadow:0 0 0 3px var(--app-danger-bg); }

.app-field       { display:flex; flex-direction:column; gap:6px; }
.app-label       { font-family:'Lato',sans-serif; font-size:11px; font-weight:700; color:var(--app-text-muted); }
.app-label .req  { color:var(--app-danger); margin-left:2px; }
.app-help        { font-size:10px; color:var(--app-text-faint); }
.app-error       { font-size:10px; color:var(--app-danger); }

.app-toggle { position:relative; width:36px; height:20px; border-radius:999px;
  background:var(--app-surface-raised); border:1px solid var(--app-border);
  cursor:pointer; transition:background .18s ease, border-color .18s ease; }
.app-toggle::after { content:''; position:absolute; top:2px; left:2px; width:14px; height:14px;
  border-radius:999px; background:var(--app-text-faint);
  transition:transform .18s cubic-bezier(0.22,1,0.36,1), background .18s ease; }
.app-toggle.is-on { background:var(--app-accent-bg); border-color:var(--app-accent-border); }
.app-toggle.is-on::after { transform:translateX(16px); background:var(--app-accent); }
```

Checkbox/radio/range use `accent-color: var(--app-accent)` (already set globally). Custom selects use the dropdown spec in §7.12.

### 7.18 Tabs

```css
.app-tabs { display:flex; align-items:center; gap:4px; border-bottom:1px solid var(--app-border); }
.app-tab {
  position:relative; padding:9px 14px; border:none; background:transparent;
  font-family:'Lexend Deca',sans-serif; font-size:12px; font-weight:600;
  color:var(--app-text-muted); cursor:pointer; transition:color .15s ease;
}
.app-tab::after {
  content:''; position:absolute; left:14px; right:14px; bottom:-1px; height:2px;
  background:var(--app-accent); transform:scaleX(0); transform-origin:left;
  transition:transform .24s cubic-bezier(0.22,1,0.36,1);
}
.app-tab:hover          { color:var(--app-text); }
.app-tab.is-active      { color:var(--app-text); }
.app-tab.is-active::after { transform:scaleX(1); }
```

### 7.19 Loading, skeletons, empty states

```css
.app-loading { display:flex; flex-direction:column; gap:14px; align-items:center; }
.app-loading-orbit {
  width:44px; height:44px; border-radius:50%;
  border:3px solid var(--app-border); border-top-color:var(--app-accent);
  animation:spin .8s linear infinite;
}
.app-loading-text { font-family:'Lato',sans-serif; font-size:13px; font-weight:600; color:var(--app-text-muted); }

.app-skeleton {
  background:linear-gradient(90deg, var(--app-surface-soft) 25%, var(--app-surface-raised) 50%, var(--app-surface-soft) 75%);
  background-size:200% 100%; border-radius:8px;
  animation:astk-sheen 1.4s linear infinite;
}

.app-empty { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 24px; text-align:center; }
.app-empty-icon  { width:44px; height:44px; color:var(--app-text-faint); opacity:.6; }
.app-empty-title { font-family:'Lexend Deca',sans-serif; font-size:14px; font-weight:700; color:var(--app-text); }
.app-empty-text  { font-size:12px; color:var(--app-text-muted); max-width:38ch; }
```

**Never leave a blank region.** Every list, table, and chart must have a designed loading state and a designed empty state.

### 7.20 Tooltips, breadcrumbs, pagination, accordion

- **Tooltip** — `background: var(--app-bg-elevated)`, `border: 1px solid var(--app-border-strong)`, radius 8px, padding 6px 9px, 11px Lato, `box-shadow: var(--app-shadow-md)`, 150ms fade, 400ms open delay.
- **Breadcrumb** — 11px Lato, `--app-text-faint`, separator `/` at 0.5 opacity, current item `--app-text` 700, hover `--app-accent`.
- **Pagination** — 28px square `.icon-btn`s, current page `background: var(--app-accent-bg); color: var(--app-accent); border-color: var(--app-accent-border)`.
- **Accordion** — header row 12px Lexend 600, chevron rotates 180° over 240ms, body `border-top: 1px solid var(--app-border-soft)`, padding 12px 0.

---

## 8 · LAYOUT & GRID

| Rule | Value |
|---|---|
| Content max width | `1600px`, centred, on very wide screens |
| KPI row | `repeat(auto-fit, minmax(220px, 1fr))`, gap 16px |
| Two-column detail | `grid-template-columns: 1fr 380px`, gap 16px; stacks below 1280px |
| Chart panel min-height | 280px |
| Section rhythm | 24px between major sections |
| Vertical alignment | Cards in a row are equal height (`align-items: stretch`) — never ragged |

**Breakpoints:** `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`.

**Responsive behaviour:**
- `< 1024px` — sidebar becomes an off-canvas drawer; main padding 16px.
- `< 768px` — all grids collapse to one column; page-header actions wrap below the title; tables get `overflow-x: auto` with the first column sticky.
- `< 640px` — main padding 12px; modals become full-screen sheets; button labels may drop to icon-only with `aria-label`.
- Touch viewports — minimum hit target 44×44px.

---

## 9 · ICONOGRAPHY

- One icon library across the whole app. **Lucide** is the reference (`lucide-react` / `lucide-vue-next` / `lucide-angular`).
- Stroke width `1.75` (default `2` acceptable). Never filled icons mixed with stroked ones.
- Sizes: `14px` inline with small text · `16px` default in buttons and nav · `18px` page actions · `20px` in tiles · `44px` empty states.
- Icon colour inherits `currentColor`. It never carries its own hex.
- An icon adjacent to a label sits **left** of it with a 7–8px gap.
- Never use emoji as UI iconography.

---

## 10 · DATA VISUALISATION

**Categorical series order** — use in this sequence, never shuffled:

| # | Token | Dark | Light |
|---|---|---|---|
| 1 | `--app-accent` | `#A79EDA` | `#5B4BC4` |
| 2 | `--app-teal` | `#3FB3A6` | `#1F7F74` |
| 3 | `--app-info` | `#5E9BD1` | `#2F6FBF` |
| 4 | `--app-warning` | `#D99B3C` | `#9A6512` |
| 5 | `--app-success` | `#22B15C` | `#0A8F42` |
| 6 | `--app-danger` | `#DC4A4A` | `#BE2E2E` |

**Chart chrome:** grid `--app-chart-grid` (1px, horizontal only — no vertical grid unless categorical bands are required) · axis labels 10px Lato `--app-text-faint` · axis line `--app-border` · tooltip `--app-chart-tooltip-bg` / `--app-chart-tooltip-border` / radius 8 / `--app-shadow-md` · legend 10px, top-right, swatch 8px radius 2px.

**Rules:** status colour always beats series colour — a "critical" bar is `--app-danger` regardless of its series index. Bars use the `--app-*-bar` tokens (88%/85% alpha). Lines are 2px with no shadow. Area fills are the line colour at 12% alpha. Never use a rainbow or a default library palette. Donut/pie limited to 6 slices, remainder grouped as "Other" in `--app-text-faint`.

---

## 11 · ACCESSIBILITY — NON-NEGOTIABLE

- Contrast: body text ≥ 4.5:1, large text and UI borders ≥ 3:1, in **both** themes. The light-theme status colours are already darkened for this; do not "brighten them up".
- One focus style, from §5.1, on every interactive element. Never `outline: none` without a replacement.
- Every icon-only control has `aria-label`. Every input has a `<label>` or `aria-label`. Every modal has `role="dialog" aria-modal="true"` and a labelled title.
- Colour is never the only signal: pair status colour with an icon or text.
- Keyboard: Tab order follows visual order; Esc closes overlays; Enter/Space activate; arrow keys move within menus, tabs, and segmented controls.
- Respect `prefers-reduced-motion` (rule already in §5.1).
- Minimum body text size 11px; never below 10px for any readable content.

---

## 12 · WRITING & CONTENT

- Sentence case everywhere except eyebrows, chips, table headers, nav section labels.
- Buttons are verbs: "Save changes", "Export report", "Add rack". Never "OK", "Submit", "Click here".
- Empty states say what is missing **and** the next action.
- Errors say what went wrong and how to fix it. Never a raw stack trace in the UI.
- Numbers: thousands separators, consistent precision per column, units in the header not the cell.
- Dates: `DD MMM YYYY` / `HH:mm` 24-hour. Relative time only under 24 hours.

---

## 13 · PAGE ARCHETYPES

Apply the matching archetype to every page you convert.

**Dashboard** — page header → KPI row (`auto-fit minmax(220px,1fr)`) → 2-column charts → recent-activity table in a panel.

**List / index** — page header with primary action → filter bar (search + segmented control + `.icon-btn` filters) inside `.astk-panel` → table in a padding-less `.astk-panel` → pagination in the panel footer.

**Detail** — breadcrumb → page header with status chip and actions → `1fr 380px` split: main panels left, metadata/timeline panel right → tabs for sub-sections.

**Form / settings** — page header → left nav of sections (`.nav-item` style) or tabs → `.astk-panel` per section with `.app-field` rows, max width 720px → sticky footer with Save/Cancel.

**Auth / login** — split screen: left `.astk-on-ink` ink panel with `.astk-pattern` + `.astk-aurora` + logo lockup + product statement; right a `.astk-panel` form, max width 380px, centred. Theme toggle top-right.

**Error / 404** — `.app-empty` centred in the main region, 44px icon, title, explanation, and a primary action back to safety.

---

## 14 · FILE & CODE CONVENTIONS

- All tokens and component classes live in **one** `theme.css`. Do not scatter them.
- Component files contain layout and composition only. Colour, type, radius, shadow come from classes or tokens.
- Class naming: `.app-*` for functional UI, `.astk-*` for brand-specific surfaces, `.kpi-card` / `.nav-item` / `.page-*` for the established structural names above. Keep them — do not rename.
- Inline `style={{}}` is permitted **only** for dynamic values (a computed width, a chart colour resolved from a token). It must still reference `var(--app-*)`.
- No `!important` except to override a third-party widget's own stylesheet.

---

## 15 · FORBIDDEN — HARD BANS

Purge all of these. The grep commands find them.

| Banned | Why | Use instead |
|---|---|---|
| Raw hex in components (`#fff`, `#1e293b`) | Breaks theming | `var(--app-*)` |
| Stock Tailwind greys (`bg-slate-800`, `text-gray-500`) **left unmapped** | Blue-grey cast | Map ramps per §5.2, or use `app-*` tokens |
| `rgba(0,0,0,0.x)` ad-hoc shadows | Off-scale depth | `--app-shadow-*` |
| Fonts other than Lexend Deca / Lato | Off-brand | §3.1 |
| Radii outside `6/8/9/10/12/14/999` | Inconsistent shape | §4.2 |
| Gradient-filled buttons (other than the one advisory control) | Cheapens the metal | `--app-btn` flat fill |
| Glassmorphism / heavy `backdrop-filter` blur | Not the language | Solid `--app-bg-elevated` |
| Neon glows, pure `#00FF00`, pure `#FF0000` | Off-palette | `--app-success` / `--app-danger` |
| Multiple primary buttons in one view | Breaks hierarchy | One primary, rest control/ghost |
| Zebra-striped tables | Noise | Hover row highlight |
| Emoji as icons | Unprofessional | Lucide |
| `outline: none` with no replacement | Inaccessible | §5.1 focus ring |
| Bouncy / elastic easing, `transition: all` | Off-brand motion | §4.4 |
| Hard-coded `px` text sizes outside §3.2 | Off-scale | §3.2 |
| Centre-aligned paragraphs | Poor reading | Left align |
| A page with no `.page-header-block` | Inconsistent | §7.3 |

```bash
# Audit commands — every one of these should return nothing (or only theme.css)
grep -rniE "#[0-9a-f]{3,8}\b" src --include=*.{tsx,jsx,ts,js,vue,svelte} | grep -v theme.css
grep -rnE "font-family" src --include=*.{tsx,jsx,css,scss} | grep -viE "lexend|lato|jetbrains"
grep -rnE "rgba\(0, ?0, ?0" src --include=*.{tsx,jsx,css,scss}
grep -rn "backdrop-filter" src
grep -rn "transition: all" src
grep -rn "outline: *none" src
grep -rnE "border-radius: *(4|5|16|18|20|24)px" src
```

---

## 16 · SELF-AUDIT — RUN BEFORE REPORTING DONE

Answer every line with **yes** and evidence, or state exactly what is outstanding.

**Foundation**
- [ ] Lexend Deca and Lato are loaded and actually rendering (verified, not just imported).
- [ ] `theme.css` exists, is imported first, and contains the complete §2.2 and §2.3 token blocks.
- [ ] `data-theme` toggles on `<body>`; the preference persists; dark is the default.
- [ ] Framework bridge (§5.2–§5.6) is in place for this project's styling system.

**Coverage**
- [ ] Every page/route from the step-1 inventory has been converted. List them.
- [ ] Every shared component has been converted.
- [ ] Every modal, drawer, toast, dropdown, and menu has been converted.
- [ ] Every loading state, empty state, and error state has been designed.

**Fidelity**
- [ ] Every card uses the §7.5 recipe, including the hover chamfer.
- [ ] Every page opens with `.page-header-block`.
- [ ] Exactly one primary button per view.
- [ ] The chrome/metal treatment appears on the logo and at most one control.
- [ ] All tables follow §7.11; no zebra stripes; numerics right-aligned and tabular.
- [ ] Nav active state is the 3px rule, not a pill.

**Both themes**
- [ ] Every screen checked in dark. No blue-grey. No washed-out text.
- [ ] Every screen checked in light. Body ink is `#353248`. Status colours hold AA.
- [ ] No element is invisible or illegible in either theme.

**Hygiene**
- [ ] All seven grep commands in §15 return clean.
- [ ] Focus ring visible on every interactive element via keyboard.
- [ ] `prefers-reduced-motion` honoured.
- [ ] Build passes, types pass, lint passes, no console errors.

**Report format:**
```
THEME APPLICATION REPORT
Pages converted:      N / N   (list)
Components converted: N / N   (list)
Themes verified:      dark ✓  light ✓
Forbidden patterns:   0 remaining  (or: list them)
Not converted:        (item — reason)   [omit if none]
```

---

## 17 · QUICK REFERENCE CARD

```
FONTS      Lexend Deca 700 → headings, labels, values
           Lato → everything else · body 14px/1.55

SURFACES   bg #121212 → chrome #171717 → surface #1E1E1E → raised #272727   (dark)
           bg #F4F3F9 → chrome #FFFFFF → surface #FFFFFF → raised #E8E6F2   (light)

TEXT       #ECECEC / #A6A6A6 / #787878      (dark)
           #353248 / #565559 / #7D7A91      (light)

ACCENT     #A79EDA (dark) · #5B4BC4 (light)
BUTTON     #8B82C3 (dark) · #353248 (light) · text #FFFFFF
STATUS     success #22B15C/#0A8F42 · warning #D99B3C/#9A6512
           danger #DC4A4A/#BE2E2E · info #5E9BD1/#2F6FBF

RADIUS     control 9 · panel 14 · pill 999
CARD       linear-gradient(168deg, surface → surface-soft)
           + 1px border + shadow-sm + edge-light + hover translateY(-2px)
CONTROL    height 34px · padding 0 14px · radius 9px
MOTION     150ms colour · 220ms lift · cubic-bezier(0.22, 1, 0.36, 1)
FOCUS      2px solid accent · offset 2px
```

---

**End of specification. Apply it completely. Report honestly.**
