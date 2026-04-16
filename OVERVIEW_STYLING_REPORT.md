# Overview Page — Styling Report

Use this as the reference when applying the same card/font standards to other pages (Workspace, Organization, Insights Desk, etc.).

---

## 1. Card Container

Every card uses the same outer shell — **no** `card` or `card-static` utility class on the outer wrapper.

```
className="rounded-xl border overflow-hidden flex flex-col"
style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
```

- `rounded-xl` — consistent border radius
- `border` + `borderColor: var(--border)` — thin border
- `overflow-hidden` — clips content to rounded corners
- `flex flex-col` — vertical layout for header + content
- `background: var(--bg-elevated)` — card surface color
- **No padding on the card itself** — padding lives inside header and content areas separately

---

## 2. Card Header

Every card has a header with a bottom border separating it from content.

**Simple header (title only):**
```
<h3 className="shrink-0 px-3 py-2 text-[12px] font-bold border-b"
    style={{ color: "var(--fg)", borderColor: "var(--border)" }}>
  Card Title
</h3>
```

**Header with right-side content (pills, buttons, etc.):**
```
<div className="shrink-0 flex items-center justify-between px-3 py-2 border-b"
     style={{ borderColor: "var(--border)" }}>
  <h3 className="text-[12px] font-bold" style={{ color: "var(--fg)" }}>Card Title</h3>
  <div className="flex items-center gap-1.5">
    <!-- pills/buttons here -->
  </div>
</div>
```

Key rules:
- **Font**: `text-[12px] font-bold`, color `var(--fg)` (primary foreground, NOT tertiary/grey)
- **Padding**: `px-3 py-2`
- **Separator**: `border-b` with `borderColor: var(--border)`
- **No uppercase, no tracking-wider** — clean sentence case

---

## 3. Card Content Area

Content sits below the header with its own padding.

**Standard content:**
```
<div className="p-2">
```

**Scrollable content:**
```
<div className="min-h-0 flex-1 overflow-y-auto p-2">
```

**Scrollable content with spacing:**
```
<div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1.5">
```

---

## 4. Font Size Scale

| Element                        | Size          | Weight          | Color                    |
|-------------------------------|---------------|-----------------|--------------------------|
| Card header title             | `text-[12px]` | `font-bold`     | `var(--fg)`              |
| Primary data value            | `text-[11px]` | `font-semibold` | `var(--fg)`              |
| Secondary data value          | `text-[10px]` | `font-semibold` | `var(--fg-secondary)`    |
| Data label (inside stat cell) | `text-[8px]`  | none            | `var(--fg-tertiary)`     |
| Stat cell label (uppercase)   | `text-[8px]`  | `font-semibold uppercase tracking-wider` | `var(--fg-tertiary)` |
| Stat cell value               | `text-[11px]` | `font-bold tabular-nums` | dynamic color      |
| Progress bar text (both sides)| `text-[9px]`  | none            | `var(--fg-secondary)`    |
| Section sub-header            | `text-[10px]` | `font-semibold uppercase tracking-wider` | `var(--fg-tertiary)` |
| Task/checklist card title     | `text-[11px]` | `font-semibold` | `var(--fg)` or `var(--fg-tertiary)` if done |
| Task card description         | `text-[9px]`  | none            | `var(--fg-tertiary)`     |
| Subtask title                 | `text-[10px]` | `font-medium`   | `var(--fg)` or `var(--fg-tertiary)` if done |
| Timeline event time           | `text-[9px]`  | `tabular-nums`  | `var(--fg-tertiary)`     |
| Timeline event label          | `text-[10px]` | none            | `var(--fg)`              |
| Shortcut button text          | `text-[10px]` | `font-semibold uppercase tracking-wider` | dynamic color |
| Empty state text              | `text-[10px]` | none            | `var(--fg-tertiary)`     |

---

## 5. Pill Sizes

### Header counter pills (inside card header, right side)
```
className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
style={{ background: "color-mix(in srgb, var(--amber) 10%, transparent)", color: "var(--amber)" }}
```

### In-card content pills (campaign name, status, deadline — inside task/checklist cards)
```
className="rounded-full px-1.5 py-px text-[9px] font-medium"
style={{ background: "var(--bg-grouped)", color: "var(--fg-secondary)" }}
```

### In-card status pills (Done/Pending on checklist items)
```
className="rounded-full px-1.5 py-px text-[9px] font-semibold"
style={{ background: "color-mix(in srgb, {color} 12%, transparent)", color: {color} }}
```

### Absolute floating pills (Recurring badge, status badge)
```
className="absolute -top-2.5 right-2 z-[2] rounded-full px-1.5 py-px text-[9px] font-semibold"
style={{
  background: "color-mix(in srgb, {color} 18%, transparent)",
  color: {color},
  border: "1px solid color-mix(in srgb, {color} 30%, var(--border))"
}}
```
- Background: **18%** color mix (not 10–12%)
- Border: **30%** color mix (not 20%)

### Top-level stat pills (outside cards, in the header area)
```
className="shrink-0 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[9px] font-semibold tabular-nums"
style={{ borderColor: "var(--border)", color: "var(--fg-secondary)" }}
```

---

## 6. Stat Cells (inside cards)

### Standard stat cell
```
<div className="card-static p-1.5 text-center">
  <p className="text-[8px] font-semibold uppercase tracking-wider"
     style={{ color: "var(--fg-tertiary)" }}>{label}</p>
  <p className="text-[11px] font-bold tabular-nums"
     style={{ color: {dynamicColor} }}>{value}</p>
</div>
```

### Compact stat cell (team stats row)
```
<div className="rounded-md p-1 text-center" style={{ background: "var(--bg-grouped)" }}>
  <p className="text-[7px] font-semibold uppercase" style={{ color: {dynamicColor} }}>{label}</p>
  <p className="text-[10px] font-bold tabular-nums" style={{ color: "var(--fg)" }}>{value}</p>
</div>
```

---

## 7. Action Buttons (inside task/checklist cards)

### Primary action button (Mark complete / Undo / Mark as working)
```
className="shrink-0 rounded-lg px-2 py-1 text-[8px] font-semibold transition-all hover:opacity-80"
style={{ background: "color-mix(in srgb, {color} 10%, transparent)", color: {color} }}
```

### Subtask action button (smaller)
```
className="shrink-0 rounded px-1.5 py-0.5 text-[7px] font-semibold transition-all hover:opacity-80 disabled:cursor-not-allowed"
style={{ background: "color-mix(in srgb, {color} 8%, transparent)", color: {color} }}
```

---

## 8. Timeline (Checklist cards)

### Container (checklist with timeline)
```
<div className="relative min-h-0 flex-1 overflow-y-auto p-2 pl-7 pt-4">
```

### Container (tasks without timeline)
```
<div className="min-h-0 flex-1 overflow-y-auto p-2 pt-4">
```

- `pt-4` (16px) gives enough room for absolute pills at `-top-2.5` to not get clipped

### Vertical line
```
<div className="absolute left-[14px] top-2 bottom-1 w-[2px] rounded-full"
     style={{ background: "var(--border)" }} />
```

### Parent dot
```
<div className="absolute -left-5 top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full"
     style={{ background: "var(--bg)", border: "2px solid {dotColor}" }}>
  {isDone && <span className="h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />}
</div>
```

### Subtask timeline (nested inside parent)
```
<div className="relative ml-3 mt-1.5 pl-4 space-y-1.5">
  <div className="absolute left-[5px] top-0 bottom-0 w-[1.5px] rounded-full"
       style={{ background: "color-mix(in srgb, var(--border) 70%, transparent)" }} />
```

### Subtask dot
```
<div className="absolute -left-4 top-1 flex h-2.5 w-2.5 items-center justify-center rounded-full"
     style={{ background: "var(--bg)", border: "1.5px solid {subDotColor}" }}>
  {isDone && <span className="h-1 w-1 rounded-full" style={{ background: subDotColor }} />}
</div>
```

---

## 9. Completed Card Treatment (Checklist)

### Parent card (done)
```
background: "color-mix(in srgb, var(--teal) 5%, var(--bg-elevated))"
opacity: 0.65
```
Plus diagonal hash overlay:
```
{isDone && <div className="absolute inset-0 z-[1] pointer-events-none rounded-xl"
  style={{ background: "repeating-linear-gradient(135deg, transparent, transparent 4px, var(--fg-tertiary) 4px, var(--fg-tertiary) 4.5px)", opacity: 0.08 }} />}
```

### Subtask card (done)
Same pattern but with `rounded-lg` and `opacity: 0.6`.

### Locked (sequential — previous not done)
```
opacity: 0.4
disabled buttons
```

---

## 10. Progress Bar

```
<div className="space-y-1">
  <div className="flex items-center justify-between">
    <span className="text-[9px]" style={{ color: "var(--fg-secondary)" }}>Progress</span>
    <span className="text-[9px] tabular-nums" style={{ color: "var(--fg-secondary)" }}>{value}</span>
  </div>
  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
    <motion.div className="h-full rounded-full"
      initial={{ width: 0 }} animate={{ width: `${pct}%` }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      style={{ background: "var(--primary)" }} />
  </div>
</div>
```

---

## 11. Page Container

```
style={{ height: "calc(93dvh - 80px)" }}
```

Applied to Overview, Workspace, and Organization pages.

---

## 12. Color Variables Used

| Variable              | Usage                                     |
|-----------------------|-------------------------------------------|
| `var(--fg)`           | Primary text, card titles, data values    |
| `var(--fg-secondary)` | Secondary text, labels                    |
| `var(--fg-tertiary)`  | Muted text, timestamps, descriptions      |
| `var(--bg)`           | Page background                           |
| `var(--bg-elevated)`  | Card surface                              |
| `var(--bg-grouped)`   | Nested cell / pill background             |
| `var(--border)`       | Card borders, dividers, progress track    |
| `var(--primary)`      | Primary accent, progress fill             |
| `var(--teal)`         | Success, done, online                     |
| `var(--green)`        | Present, active                           |
| `var(--amber)`        | Warning, pending                          |
| `var(--rose)`         | Error, overdue, alerts                    |
| `var(--purple)`       | Holidays, recurring badge                 |

---

## 13. Scrollbars

Global scrollbar styling is defined in `app/globals.css`. No inline `scrollbarWidth` needed on components.

```css
* {
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
::-webkit-scrollbar { width: 3px; height: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 9999px;
}
::-webkit-scrollbar-thumb:hover { background: var(--fg-tertiary); }
```

Key rules:
- **Width**: 3px (ultra-thin)
- **Track**: fully transparent (no background)
- **Thumb**: `var(--border)` at rest, `var(--fg-tertiary)` on hover
- **Shape**: pill (`border-radius: 9999px`)
- **Firefox**: handled by `scrollbar-width: thin` + `scrollbar-color` on `*`
- **Dark mode**: automatic via CSS variables — no separate rule needed
- **Do NOT add** inline `scrollbarWidth: "thin"` on components — the global rule covers everything
- **Exception**: `scrollbarWidth: "none"` is still used where scrollbars must be completely hidden (e.g. horizontal pill strips)
