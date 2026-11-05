# Design brief — proposed, pending rendered review

## Intent

An image- and model-led creative worktable with quiet confidence. Related in sensibility to Scene Loom, with its own asset review layout. Avoid corporate dashboard shells, decorative metrics, verbose onboarding, ornamental panels and generic AI styling.

Scene Loom's planning chat is the reference for design ethics. Its later accepted After Hours direction used charcoal, cool off-white, pale blue accents, bold Syne headings and DM Sans controls after a warm boutique treatment was rejected. Treat this as a starting reference, not a requirement to copy every component or font.

## Proposed composition

Compact project/category navigation; visual asset library; a large focused review stage; contextual revision, feedback and decision details. Asset stages remain within the same asset workspace. Animation review adds playback, scrubbing, clip selection and a minimal ground/environment, rather than a general scene editor.

Comparison uses synchronized cameras, lighting, scale and animation time by default, with clear revision labels. A material-neutral inspection mode complements the styled view. Keep the model visible while reading feedback. Annotation pins are selectable and distinguishable from geometry; provide a list alternative.

Use purposeful, interruptible transitions for opening, focusing, switching and copy feedback. Never animate the asset camera unexpectedly during annotation. Loading, job failure, missing dependencies, stale exports and disconnected service need explicit states without losing the last good revision.

Status must use text and shape as well as colour: the owner reported some colour-vision difficulty in Scene Loom. Technical validity and visual acceptance are separate labels. Show exact revision and whether changes are unaccepted.

## Verification

Use Impeccable's applicable written guidance and inspect the actual rendered UI with realistic assets and long feedback. Verify comparison, annotations, narrow-window usability and keyboard controls. Choose final typography, tokens and layout through review during implementation; no visual comp or final interface is accepted yet. No automated “slop-free” claim.

## Implemented review increment

Charcoal canvas (#14161a), slightly lifted model stage (#1c2026), cool off-white text and pale blue selection. Local Syne 600 headings and DM Sans controls. Compact project header, asset navigation, large model stage and contextual review inspector. Comparison views share camera and time; controls remain below the stage. Narrow windows stack comparison and inspector while preserving stage space. Workspace motion now follows selection and disclosure: shared selection surfaces travel between mode/stage/clip/revision controls; the clip library unfolds; comparison opens alongside the current model; revisions reveal through a short bounded mask. Acceptance, sources and decisions use interruptible disclosures. Copy confirmation has an animated arrival and exit. Camera movement is never added as decoration.

Actual desktop comparison and narrow captures live in ignored artifacts/studio-comparison.png and artifacts/studio-narrow.png. These are implementation evidence, not owner visual acceptance. The interface was inspected directly; no automated Impeccable certification was run.

## Playback transport

A dedicated timeline separates motion review from viewport tools. It offers restart, one-frame stepping at an explicitly labelled 24 fps preview rate, animated play/pause, speed selection, loop toggle and scrubbing. Playback speed changes preview time only; source clips remain untouched. Non-looping playback stops on the final pose and supports seeking/restarting. Optional reduced spatial motion follows the system preference through MotionConfig. No persistent decorative loops.

## Unified studio controls

Scene Loom's actual project menu and contextual actions are the reference for control craft. All project/comparison/clip/speed selectors use one themed StudioSelect component over the accessible Radix Select primitive: quiet trigger, rotating chevron, portaled raised menu, selected check, optional secondary copy, keyboard/typeahead navigation, Escape dismissal and focus restoration. Menus fit the viewport and scroll when constrained. Real values are encoded independently from the internal empty choice.

Secondary prompt and inspection actions are quiet contextual buttons; Save feedback remains the clear primary action, and acceptance retains a separate deliberate surface. Hover, focus, disabled and open states share semantic control colours. Motion supports state continuity rather than compensating for native-looking controls. Keep future controls within this system.
