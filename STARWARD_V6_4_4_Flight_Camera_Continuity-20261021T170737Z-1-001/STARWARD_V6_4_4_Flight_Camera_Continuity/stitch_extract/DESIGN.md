---
name: Aero-Ops Precision Telemetry
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353942'
  surface-container-lowest: '#0a0e16'
  surface-container-low: '#181c24'
  surface-container: '#1c2028'
  surface-container-high: '#262a33'
  surface-container-highest: '#31353e'
  on-surface: '#dfe2ee'
  on-surface-variant: '#bdc8d1'
  inverse-surface: '#dfe2ee'
  inverse-on-surface: '#2c3039'
  outline: '#87929a'
  outline-variant: '#3e484f'
  surface-tint: '#7bd0ff'
  primary: '#8ed5ff'
  on-primary: '#00354a'
  primary-container: '#38bdf8'
  on-primary-container: '#004965'
  inverse-primary: '#00668a'
  secondary: '#ffb95f'
  on-secondary: '#472a00'
  secondary-container: '#ee9800'
  on-secondary-container: '#5b3800'
  tertiary: '#56e5a9'
  on-tertiary: '#003824'
  tertiary-container: '#30c88f'
  on-tertiary-container: '#004e34'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c4e7ff'
  primary-fixed-dim: '#7bd0ff'
  on-primary-fixed: '#001e2c'
  on-primary-fixed-variant: '#004c69'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0f131c'
  on-background: '#dfe2ee'
  surface-variant: '#31353e'
typography:
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Space Grotesk
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: 0.04em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: 0.08em
  title-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.06em
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
    letterSpacing: 0.01em
  body-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
  data-mono-lg:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 22px
    letterSpacing: -0.02em
  data-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.12em
  label-micro:
    fontFamily: JetBrains Mono
    fontSize: 9px
    fontWeight: '500'
    lineHeight: 12px
    letterSpacing: 0.08em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 0.75rem
  gutter-desktop: 1rem
  margin: 0.75rem
  margin-desktop: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system delivers an ultra-austere, high-density aerospace HUD and mission control workshop interface. Designed for orbital engineers, flight directors, and orbital vehicle mechanics, the emotional tone is disciplined, cold, mission-critical, and immaculately precise.

Rooted in Swiss International Typographic Style fused with modern avionics, the design emphasizes:
- Extreme reduction of visual decoration, bevels, or excessive blurs.
- Monolithic midnight canvas layers structured by hairline borders (1px at low opacity).
- Tabular monospace readouts paired with cold, geometric sans-serif structural headings.
- High-contrast tactical signal cues (Deep Abyss ground, Spectral Cyan active state, and Orbital Amber warnings/statuses).
- Strict information density where every pixel serves situational awareness.

## Colors

The palette is tuned specifically for prolonged deep-space visual focus without retinal fatigue:

- **Primary (`#38BDF8` - Cyan Telemetry):** Denotes active vectors, focused nodes, selected craft systems, and primary operational triggers (e.g., launch state, nominal flight modes).
- **Secondary (`#F59E0B` - Amber Vector):** Reserved strictly for orbital trajectory calculations, cautionary flight statuses, stage separation triggers, and financial/resource balances.
- **Tertiary (`#10B981` - Avionics Nominal):** Indicates greenboard health metrics, established circular orbits, and successful telemetry downlinks.
- **Neutral Canvas (`#080C14` to `#162032`):** A stepped series of deep abyss blues and slates that mimic orbital night. Pure black (`#030508`) grounds the background viewport, while low-luminance slate surfaces float modules over the celestial canvas.

Hairline borders use pure white or electric cyan with alpha thresholds between `0.08` and `0.18` to enforce structural separation without distracting from telemetry paths.

## Typography

Typography functions as visual instrumentation. High-frequency updates demand fixed-width tabular numbers to avoid layout jitter during high-speed calculations.

- **Primary Display & System Headers:** `Space Grotesk` provides geometric industrial rigor. All uppercase section labels must carry increased letter spacing (`0.06em` to `0.12em`) to guarantee legibility at small sizes under dim conditions.
- **Narrative & System Instructions:** `Inter` handles dense textual notes, instructional dialogs, and mission log entries.
- **Dynamic Telemetry & Readouts:** `JetBrains Mono` governs all numerical quantities, vector orientations, altitude readouts, mass values, and delta-v metrics. Numbers must strictly align via tabular figures (`font-variant-numeric: tabular-nums`).

## Layout & Spacing

The layout operates on a fixed-density flight deck architecture. It divides the screen into persistent telemetry perimeters surrounding an expansive, unobstructed viewport:

1. **Top HUD Bar:** Fixed 48px height accommodating master system switches, flight stages, and mission control save/load utilities.
2. **Left Telemetry Rack:** 300px fixed dock for real-time mission systems, active mission parameters, staging ladders, and part catalog shelves.
3. **Right Telemetry Rack:** 320px fixed dock for orbital nodes, planetary parameters, apogee/perigee telemetry, and engine throttles.
4. **Bottom Telemetry Bridge:** Low-profile horizontal dock pinned at center-bottom for real-time mass, Δv, TWR, and primary launch engagement action.

On tablet and compact screens, side racks collapse into micro flyout trays triggered by peripheral edge tabs, maintaining unobstructed center viewports. Component gaps use a tight 4px and 8px baseline rhythm to maintain maximum information density.

## Elevation & Depth

Visual depth is communicated exclusively through surface density and razor-thin containment borders rather than blurred shadows:

- **Level 0 (Space Void):** `#030508` – Direct viewport rendering of celestial trajectories, grids, and planetary bodies.
- **Level 1 (Dock & Instrument Panels):** `rgba(10, 16, 26, 0.88)` with a 12px backdrop blur and a crisp `1px solid rgba(255, 255, 255, 0.08)` hairline border.
- **Level 2 (Active Micro-Containers & Cards):** `rgba(18, 28, 44, 0.70)` with `1px solid rgba(56, 189, 248, 0.22)`.
- **Level 3 (Modal Alerts & Staging Controls):** `rgba(15, 23, 42, 0.96)` with high-contrast accent hairlines.

No heavy drop-shadows are permitted. Where focus is required, an ambient cyan or amber outline glow (`0 0 12px rgba(56, 189, 248, 0.25)`) indicates active manual overrides or critical orbital maneuver nodes.

## Shapes

The interface embraces an industrial, utilitarian geometry. Radii are kept crisp (`roundedness: 1` — 4px for standard interactive targets, 6px for modular card racks, 2px for monospace micro-tags). 

Pill shapes are reserved strictly for high-level mode switch segments (e.g., `BUILD | FLIGHT | SYSTEM MAP`) to differentiate navigation mode clusters from instrument racks. Technical framing accents, crosshairs, and corner ticks may be used sparingly on active targeting viewports.

## Components

### Buttons & Engagement Triggers
- **Primary Flight Action (Launch / Burn):** Solid electric cyan background (`#38BDF8`), pure dark ink (`#040810`), bold uppercase mono font. Sharp 4px radius with no gradient.
- **Secondary Control Buttons (Prograde / Retrograde / Warp):** Transparent slate background (`rgba(255, 255, 255, 0.03)`), framed with a 1px border (`rgba(255, 255, 255, 0.15)`), shifting on hover to cyan border and white text.
- **Destructive / Abort Triggers:** Dark slate fill with muted red boundary (`rgba(239, 68, 68, 0.4)`), brightening to pure crimson on active state.

### Tactical Segmented Switchers
- Encapsulated within a hairline capsule (`1px solid rgba(255, 255, 255, 0.12)`).
- Active item displays an inset high-density slate fill (`#1E293B`) with pure white, tracking-wide text. Inactive tabs display muted slate-grey (`#64748B`).

### Telemetry Value Readouts
- Structured with an upper micro-label in `label-micro` format (`FUEL`, `ALTITUDE`, `ΔV REMAINING`), directly paired with tabular numbers in `data-mono-lg` with right-aligned units (`m/s`, `kg`, `km`).

### Part Selector & Item Cards
- Compact horizontal rows: low-contrast dark container, faint hairline division, thumbnail framed in 32x32px slot, monospaced hardware specification on the left, and operational credit/cost anchored on the right in Amber (`#F59E0B`).

### Throttle & Slider Instrumentation
- 4px flat track in muted slate (`rgba(255, 255, 255, 0.15)`).
- Filled portion in vibrant cyan (`#38BDF8`).
- Drag thumb: 12px circular cyan puck with a 1px solid white core dot.

### Telemetry Status Chips
- Height of 20px, uppercase `label-micro` text, framed with `0.5px` border with matching indicator LED dot (3px diameter) pulse on nominal/live sync.