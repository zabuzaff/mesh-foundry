---
name: Mesh Foundry
description: Scene Loom After Hours visual system for a local asset review studio
colors:
  ground: "#101215"
  surface: "#15181c"
  surface-raised: "#1b1f26"
  surface-hover: "#282e38"
  card: "#20242b"
  text: "#edf0f3"
  muted: "#a2a9b4"
  soft: "#c8ced8"
  accent: "#abbcff"
  accent-hover: "#c0ccff"
  on-accent: "#101215"
  line: "#343a45"
  edge: "#929baa"
  scrollbar: "#505a6b"
  danger-surface: "#35262d"
  danger-text: "#f3cad3"
typography:
  wordmark:
    fontFamily: "Syne Variable, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Syne Variable, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Syne Variable, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-0.015em"
  body:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "13px"
  label:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: "11px"
rounded:
  control: "6px"
  card: "10px"
spacing:
  compact: "8px"
  control: "12px"
  section: "24px"
  header: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    padding: "13px 18px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-quiet:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
  review-stage:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
---

# Design System: Mesh Foundry

## Overview

**Direction: Scene Loom — After Hours.** The owner requested full alignment with the local Scene Loom studio on 2026-11-06, including its fonts, typography, palette and component treatment. This supersedes the earlier proposal to use Scene Loom only as a starting reference.

Use the same confident, artwork-led visual language: graphite ground, cool off-white text, pale blue actions, expressive Syne headings and quiet DM Sans controls. Mesh Foundry remains a local studio for sketches, editable models, revisions, animation and owner review. Its asset worktable supplies the composition; Scene Loom supplies the visual system.

The implementation was inspected at desktop and 390px widths and independently reviewed. This records the requested direction and verified implementation, not owner acceptance of any creative asset or every rendered detail. Evidence and verification history remain in docs/progress.md. Impeccable's automated engine was unavailable; no automated certification is claimed.

## Colors

client/tokens.css is the implementation source of truth. Its core palette is copied from Scene Loom's current tokens. The frontmatter records those exact values.

Use ground behind the worktable, surface for the header and inspector, card for model stages, and surface-raised for menus and transport. Surface-hover provides restrained interactive feedback. Primary text uses text; supporting copy uses muted or soft. Keep secondary prose neutral rather than turning the whole interface blue.

Accent identifies primary actions, focus, annotation pins and selected checks. Pair accent backgrounds with on-accent text, including browser text selection. Danger messages use danger-surface and danger-text. Borders and dividers use line; scrollbars use scrollbar. State labels must remain readable without distinguishing colors: technical validity, candidate status and owner acceptance are separate concepts.

## Typography

Locally hosted **Syne Variable** and **DM Sans Variable** match Scene Loom's font files. Font-face declarations live in client/fonts.css; font files and licenses live in public/fonts. Use variable weights rather than synthesized bold.

- Wordmark: Syne 800 at 28px, tracking -0.04em; 25px below 1150px and 21px below 650px. Pale blue terminal period, with Mesh Foundry's own geometry mark.
- Workspace headline: Syne 700 at 26px, line-height 1.2, tracking -0.03em; 24px at narrow widths.
- Section titles: Syne 600 at 16px, tracking -0.015em.
- Empty-state headline: Syne 800, clamp(38px, 5vw, 64px), line-height 1.03, tracking -0.025em; 43px at narrow widths.
- Body and controls: DM Sans, 13px base. Descriptions and feedback use 12px with generous reading line-height; labels and contextual actions use 10–12px. Primary buttons use 11px at weight 650.

Keep long revision identities, asset names and feedback wrapping. Timing/frame readouts use tabular numerals. Avoid display lettering in long-form feedback.

## Layout

The desktop header is 76px high with 32px horizontal padding. The workspace uses a 190px asset rail, flexible central review worktable and 300px inspector. Main padding is 28px 30px. At 1600px and above, rails become 210px/320px and main padding 36px 40px.

At 1150px and below, the rail becomes 170px and the inspector moves below the worktable; connection text recedes. At 650px and below, the workspace stacks, navigation becomes compact, the header wraps and main padding is 24px 15px. Comparison stages stack, controls wrap, and the model retains useful height. Reference thumbnails use three columns, collapsing to one below 600px.

Keep stage tabs and comparison above the models, playback immediately below them, then revision history and reference renders. Feedback belongs in a contextual inspector. Preserve the artwork's space rather than adding dashboard summaries or ornamental sections.

## Elevation & Depth

Tonal layering carries most depth. Menus use `0 12px 30px #0005`; transport uses `0 4px 15px #0002`. Raised surfaces support interactions without competing with the model. Dividers organize review information. Do not add decorative glow or shadows to every container.

Motion follows state: selection surfaces travel, clip/inspector sections unfold, comparison opens alongside the current model, and copy confirmation arrives briefly. Existing transitions remain interruptible. Menus enter over 180ms using cubic-bezier(0.16, 1, 0.3, 1). Honor Mesh Foundry's existing reduced-motion behavior. Never move the model camera as decoration, especially during annotation.

## Shapes

Model stages, reference images and menus use 10px corners. Controls use 6px corners; compact stage labels use 4px. Shape and spacing remain quiet and consistent with Scene Loom. Preserve Mesh Foundry's geometry mark; do not substitute Scene Loom's linked-frame identity.

## Components

- **StudioSelect:** shared Radix-based project, comparison, clip, speed and reference selectors. Quiet trigger, rotating chevron, raised portaled menu, selected check and optional secondary copy. Preserve typeahead, keyboard navigation, Escape, focus restoration, viewport collision handling and constrained scrolling.
- **Buttons:** Save feedback and empty-state start actions use accent/on-accent. Contextual prompt and viewport actions use quiet neutral treatments. Acceptance stays a separate deliberate action. Disabled controls remain visibly disabled; focus uses a 2px accent outline with 3px offset.
- **Review stage:** card surface, 10px corners, restrained top labels with exact revision/status. Comparison shares camera and playback time. Neutral material inspection complements the styled view. Preserve loading and explicit viewer-error states.
- **Transport:** raised surface, compact icon controls and square-cornered 6px play button; separate scrubbing timeline, speed, loop and tabular readout. Stepping is explicitly a 24 fps preview. Preview controls never modify source clips.
- **Feedback and disclosures:** ground-colored textarea with line border and 6px corners; accent border on focus. Notes remain attached to an exact revision and offer a list alternative to pins. Acceptance, source downloads and decisions use accessible disclosures that preserve drafts and remove closed content from keyboard navigation.
- **References:** themed selectors, reference thumbnails, neutral destination fields and explicit preview/send actions. Show exact source revision/set and acceptance snapshot. Status/error text remains explicit; rendering or technical validation never accepts a revision.
- **Empty, error and copy states:** bold centered Syne empty headline with concise studio instructions; danger-surface banner for errors; transient accent/on-accent copy toast. Preserve the last good revision when jobs or connections fail.

## Do's and Don'ts

- Do follow Scene Loom's actual visual tokens, font weights, menu craft and quiet contextual controls when adding surfaces.
- Do retain Mesh Foundry's product language, editable-source workflow, revision identity and explicit owner decisions.
- Do inspect actual desktop and narrow renders with realistic assets, long feedback and open menus; exercise comparison, keyboard controls and annotations.
- Don't treat test passes, reference generation or this design-system refresh as creative acceptance.
- Don't introduce dashboard metrics, marketing sections, decorative motion or color-only status.
- Don't silently replace accepted revisions, move annotation pins across changed geometry, or import Scene Loom's storyboard behavior into the asset worktable.
