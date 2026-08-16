# Casa Tabor Design System — Typography & Header Hierarchy Guidance

**Version:** 2.1.0  
**Status:** Canonical Reference (Adopt on Touch)

---

## 1. Core Philosophy & Dual Context Modes

Casa Tabor interfaces operate across two distinct contextual modes. Typography must honor the cognitive goals of each environment rather than forcing a rigid, one-size-fits-all aesthetic:

### A. Editorial & Sensory Mode (Kitchen, Cooking Atelier, Meal Planning, Home Story)
* **Goal:** Appetite appeal, warmth, hospitality, and comfortable 3–5 foot distance glanceability.
* **Primary Typeface:** `Cormorant Garamond` (High-contrast editorial serif, `font-display`).
* **Supporting Typeface:** `DM Sans` (`font-body`) for ingredient quantities, servings, and metadata.
* **Styling Characteristics:** Generous line height (`1.2–1.3`), Title Case entity naming, warm golden accents (`text-casa-gold`), and relaxed typographic rhythm.

### B. Operational & Precision Mode (Calendar, Action Queue, Logistics, Grocery Matrix)
* **Goal:** Ultra-fast scanning, dense schedule comparison, conflict triage, and unambiguous time blocks.
* **Primary Typeface:** `DM Sans` (`font-body` with `font-semibold` / `font-bold` for structure).
* **Supporting Typeface:** `JetBrains Mono` (`font-mono`) for timestamps, flight/commute durations, and status badges.
* **Styling Characteristics:** Compact vertical metrics, high-contrast neutral slates, crisp uppercase overlines, and zero decorative serif fluff.

---

## 2. The 4 Semantic Header & Title Archetypes

When constructing new components, cards, or widgets, adhere to these 4 semantic archetypes:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [EYEBROW / OVERLINE]   TODAY · AUG 16                          [STATUS PILL] │
├──────────────────────────────────────────────────────────────────────────────┤
│ [H1 DISPLAY HERO]      Garlic Butter Shrimp Scampi                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ [H2 SECTION ANCHOR]    The Weekly Horizon                      [ACTION SLOT] │
│                        7-day family dinner schedule.                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ [H3 ENTITY TITLE]      Protein Pasta a la Vodka Sauce                        │
│                        20 min · 4 Servings · Chef: Jake                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Archetype 1: Display Hero (H1 / Centerpiece)
* **Role:** The singular hero or dominant featured entity on a page or major pane (e.g. Tonight's Featured Dish, Today's Living Canvas Hero Event).
* **Font & Size:** `font-display font-bold leading-tight` (Desktop: `text-2xl` to `text-3xl`, Kiosk: `text-display-xs` to `text-display-sm` ~28–34px).
* **Casing:** Strictly **Title Case**. Never ALL-CAPS.
* **Usage:** Use at most once per primary visual pane.

### Archetype 2: Section Anchor (H2)
* **Role:** Major functional sections, side-rail widgets, or distinct workbench containers (e.g. *The Weekly Horizon*, *Tonight's Rhythm*, *Shortlist Alternatives*, *Pantry Essentials*).
* **Font & Size:** `font-display font-bold text-lg sm:text-xl text-casa-navy tracking-tight` (or `font-body font-bold text-base sm:text-lg` in operational mode).
* **Layout Pattern:** 
  * Left: Section Title with optional sub-label or subtitle.
  * Right: Dedicated Action Slot for 1-tap utility buttons (`Shuffle`, `AI Plan Week`, counts `3 / 7 Set`).
* **Casing:** Strictly **Title Case**.
* **Anti-Pattern:** Do **NOT** render peer section headers as tiny uppercase tracking badges that look like footnotes.

### Archetype 3: Entity Title (H3 / Card Row)
* **Role:** Primary interactive item titles within a list, drawer, modal, or grid (e.g. Recipe names, Calendar event titles, Place cards, Task items).
* **Font & Size:** `font-display text-body font-bold text-casa-navy` or `font-body text-body font-semibold text-casa-navy` (`15–16px`).
* **Casing:** Strictly **Title Case** (e.g. via `formatRecipeTitle` or normalized casing).
* **Glanceability Target:** Legible from 3–5 feet in kitchen or kiosk environments without eye strain.
* **Anti-Pattern:** Never render raw database uppercase text (`PROTEIN PASTA...`) or uncapitalized sentence fragments (`perfect cooked tuna`).

### Archetype 4: Eyebrow / Overline & Status Badges
* **Role:** Category tags, date badges, time capsules, and active session markers (`TODAY · AUG 16`, `TOP PICK`, `ACTIVE SESSION · JUMP BACK IN`).
* **Font & Size:** `font-mono font-bold text-caption` (`11–12px`) or `text-2xs` (`10–11px`).
* **Casing & Tracking:** Strictly **ALL-CAPS** with tracking (`uppercase tracking-wider` or `tracking-widest`).
* **Visual Tone:** Muted slate or soft gold tint (`bg-casa-gold/20 text-casa-navy border border-casa-gold/40`).

---

## 3. Title Casing Standard & Acronym Rules

### The Golden Rule
> **Entity titles are human food, events, and people—render them in Title Case.  
> Status indicators and metadata categories are system signals—render them in uppercase tracked badges.**

### Normalization Helper Contract
When displaying user-submitted or AI-generated entity titles:
* **All-Caps Input** (`"PROTEIN PASTA A LA VODKA SAUCE"`) $\rightarrow$ Normalizes to `"Protein Pasta a la Vodka Sauce"`.
* **Lowercase Input** (`"perfect cooked tuna"`) $\rightarrow$ Normalizes to `"Perfect Cooked Tuna"`.
* **Acronym Preservation** (`GLP-1`, `AI`, `BBQ`, `BLT`, `PB&J`) $\rightarrow$ Preserves explicit capitalization (`"GLP-1 Friendly Garlicky Shrimp Couscous Bowls"`).

---

## 4. Kitchen & Kiosk Distance Readability Benchmarks

| Screen / Environment | Distance | Minimum Heading | Minimum Item Title | Minimum Meta / Captions |
| :--- | :--- | :--- | :--- | :--- |
| **Mobile Phone (375–430px)** | 12–18 in | `20px` (H1) / `17px` (H2) | `15px` (H3) | `12px` |
| **Desktop (1280–1440px)** | 20–28 in | `24–28px` (H1) / `18–20px` (H2) | `15–16px` (H3) | `13px` |
| **Countertop Tablet (Kitchen)** | 3–5 ft | `28–32px` (H1) / `18–20px` (H2) | `16px` (H3) | `13–14px` |
| **Wall Kiosk (1080p / 1440p)** | 6–8 ft | `32–36px` (H1) / `20–24px` (H2) | `17–18px` (H3) | `14–15px` |

---

## 5. Governance: "Adopt on Touch"

To protect tuned, stable pages (like the Calendar grid or Settings):
1. **Never perform global search-and-replace sweeps.**
2. **Apply archetypes when touching or creating components.**
3. Reference these archetypes during design reviews, AI prompting, and PR certifications.
