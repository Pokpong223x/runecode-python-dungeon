---
version: alpha
name: RuneCode
description: A Thai Python learning RPG framed as an explorer's pixel-fantasy journal.
colors:
  primary: "#1b6654"
  background: "#f3f0e4"
  surface: "#fffdf5"
  foreground: "#163438"
  deep: "#102c32"
  mint: "#ade3c4"
  mana: "#68c9f3"
  mana-track: "#1d4057"
  gold: "#e4bd70"
  danger: "#a43e40"
typography:
  sans:
    fontFamily: "Chakra Petch, sans-serif"
  mono:
    fontFamily: "Consolas, Menlo, monospace"
rounded:
  DEFAULT: "4px"
  lg: "7px"
spacing:
  section-gap: "25px"
  page-max: "1400px"
components:
  button: {}
  card: {}
  dialog: {}
  editor: {}
---

# RuneCode Design System

## Overview

### Product and audience

Thai single-player Python learning RPG for Grade 10 (ม.4) beginners. Desktop and mobile equally supported. Register: product/game. User-approved plan is product authority. No existing UI owners.

### Creative North Star

A living field journal inside a bright pixel-fantasy expedition. The memorable signature is a wide animated diorama framed like an explorer's brass instrument, paired with a legible coding notebook.

### Visual direction

Jade forest ruins, parchment lesson cards, ink-blue code, warm brass rewards. Never a generic analytics dashboard. Three hero silhouettes and six environment palettes. Art and runtime implementation remain original. On 27 October 2026 the user requested new questions throughout: all 18 exercises and six bosses now use original RuneCode scenarios, revised computations and matching hints, examples and validation. The user then requested short, easy Grade 10 exercises: each task teaches one main idea in one or two short English sentences, later lessons provide scaffolds, and bosses are simple reviews. The active curriculum is documented in docs/SOURCE-CURRICULUM.md.

## Colors

Runtime canonical source: src/styles.css :root. --ink #163438; --deep #102c32; --paper #f3f0e4; --surface #fffdf5; --jade #1b6654; --mint #ade3c4; --mana #68c9f3; --mana-track #1d4057; --gold #e4bd70; --danger #a43e40. DESIGN.md documents intent; CSS is token owner and Phaser owns its scene-specific pixel palette. Component colors reference CSS tokens.

## Typography

Body/headings: self-hosted Chakra Petch, Thai text 16px minimum with 1.6 line-height. Utility: monospace. Pixel lettering only for small English chapter labels; never Thai prose. Editor: 16px monospace.

## Layout

Persistent narrow expedition rail on desktop; compact header on mobile. Map uses a large illustrated route with six readable region cards. Battle uses diorama left and coding notebook right on desktop; compact scene above full-width editor on phone. No horizontal document scroll at 360px. Native document scrolling owns long pages.

## Elevation & Depth

Thin moss borders define groups; brass borders mark a game scene. Only dialogs and transient status use substantial shadows. The playfield is a diorama, not a raised dashboard card.

## Shapes

Controls and panels use 4px corners; dialogs use 7px. The brand rune and action points use chamfered silhouettes. Touch controls have at least 44px height.

## Components

### Interaction and canonical owners

The mission owner shows the active original English exercise as its heading, with one short 16px note for attack/skill and the 3 AP limit. Prompts, hints and takeaways use plain beginner language; they avoid long scenarios and combined advanced requirements. It stays in the right coding column. Evaluated calls such as `attack(2)` appear in the existing AP rows, forecast, execution cue and combat log; power never changes the displayed AP cost. SkillBook labels its static damage sample as power 1 and directs the actual drafted plan to Check plan. No new palette, navigation, modal or saved state is introduced.

Button styles in global CSS; Modal component owns all dialogs, focus trap, Escape and focus restoration. SaveStatus owns persistent storage feedback. Editor owns snippets and shortcut behavior. App owns navigation, runtime state and global notifications; PythonFeedback owns the single inline runtime-result surface. All progress is local; export is the user's portable backup.

### Accessibility and motion

CodeMirror owns the committed turn's execution highlight: a static brass inset and tinted line, with a stable-height header naming the actual line and command. It follows the existing scene beats and Python trace, including aliases/function bodies/loops. It never scrolls, selects text or takes focus. Editing permanently invalidates the current playback's source evidence; enemy responses, completion, navigation and motion-preference rebuilds clear the mark. Reduced motion keeps the same static cue, and forced colors adds an outline.

The existing SkillBook owns focus as a blue pixel-rune support card spanning its two-column group, in both the player panel and dialog. It inserts through Editor with the same one-step Undo. Show 1 AP, up to 3 MP and one use per turn; explain full mana and command ordering before insertion. The scene reuses the complete cast pose with blue restoration particles (static in reduced motion), a focus cue and its own quiet sound. The blue MP meter follows the actual restoration beat.

The player's CombatMeter shows a full-width blue MP bar beneath its HP track, with current/max MP, a decorative sparkle and stable-width numerals above the blue track. The user requested blue for mana: use the canonical --mana fill/text and --mana-track background. It follows the same presentation snapshot as HP so spending appears at the skill beat. Its accessible meter exposes current/max MP, has no extra animation and remains empty at zero. The right-column resource controls remain in place; the enemy has only its real HP.

Player tools belong together in the right coding column: the ink skill panel, MP, potions, costs and insertion sit directly below the editor and Run controls. The left column owns the scene, enemy intent and battle log. On phones, the scene and enemy information come first, followed by the mission, editor and player tools. SkillBook groups the two mutually exclusive offensive choices separately from defense/potion support, with two columns and explicit Thai group labels. The selected rune has a checkmark and brass underline. Per the user's revised rule in docs/OFFENSIVE-CHOICE.md, clicking attack or skill immediately updates the matching Python command references; it keeps focus on the choice so a phone keyboard does not open. No offense and mixed drafts receive truthful status text. The code is the source of selection, so Undo, manual editing and reload restore the same choice. The book icon and editor toolbar open the existing Modal owner for full descriptions and Python previews. The offense confirmation returns focus to CodeMirror without duplicating a command; support insertion adds a statement. Existing Run remains the sole turn submission owner. The mobile execution bar becomes sticky only while its code workspace has focus and stays bounded to that workspace, so it cannot cover the lesson above.

SkillIcon owns six original pixel glyphs, drawn as crisp SVG art: crossed blades for the adventurer, a golden impact shield for the knight, fire over a rune for the wizard, and a single blade, mint shield and rose potion for the basic actions. Each has a dark inset frame and a distinct accent. Icons are 48px in choice cards and 56px in details, remain visible in both panel and dialog variants, and never replace the Thai name or resource cost. They are decorative to screen readers because the containing control already names the action. No external image fetches or continuous icon animation are used.

Multiple skills extend that same owner with three code-native pixel glyphs: cyan thrust for piercing, a violet thunder seal for interruption and a coral fireburst for the wizard's stronger spell. SkillBook offers normal attack plus three class skills in the same two-column offensive group, then the two support commands. Names, actual MP cost, short trait and selected skill description precede its existing edit action. The parsed command is the selection source; no extra preference is saved. TurnPreview and scene cues identify the exact selected skill. Bounded cyan/violet/coral contact effects reuse complete actor poses and timing, while an interrupted enemy shows a quiet stagger cue instead of a misleading charging label. Reduced motion retains its static contact marker and text.

PythonFeedback also owns the AP-by-line disclosure described in docs/SKILLS-AND-AP.md. Keep parchment, 16px Thai/code, the shared danger token and 44px line/loop jump targets. Actual executed call counts and AP appear before stdout. Excess AP opens the disclosure and marks the first crossing line; normal results keep it collapsed to protect coding space. Limited evidence is explicitly labeled, and suggestions do not rewrite a lesson or spend a turn. No extra modal, live-region flood or animation is introduced.

Learning feedback stays in the coding column immediately below Run, before the taller skill panel. PythonFeedback preserves the parchment surface, uses 16px Thai corrections/code and the canonical danger token, and keeps the correction and 44px “ไปบรรทัด” action ahead of printed text. A new offscreen error reveals once with native scrolling and no focus/keyboard change; an open modal suppresses that reveal, including after closing. Printed text has one keyboard-scrollable 224px frame with the shared scrollbar/focus treatment; Python limits both 128 print calls and 8,192 text characters. Screen readers receive the concise result separately from the printed region. A failed Python line receives an ink-red background and brass underline, and editing clears stale diagnostics. The optional “ตรวจแผน” control uses the same real Python and pure combat rules to show submitted actions, AP, HP and remaining resources without changing the checkpoint or mistake count. Its parchment result panel appears below feedback only when requested; editing or navigation clears it. “รันแผนนี้” revalidates the source through the normal Run owner before committing.

Correction copy gives a Thai next step for each of the 18 concepts, using actual execution evidence to distinguish a declaration from an uncalled function or unexecuted return. Related-line jumps use the original source and disappear when the construct is absent. Native index/attribute/key/value and other common Python failures keep their real kind/detail after the Thai explanation. No extra panel, automatic answer insertion, tactical choice or competing feedback owner is introduced.

LessonHints extends the existing inline mission help in the right coding column. Brass borders and a parchment surface frame three stages, with 16px Thai text, a 16px monospace ink example and 44px back/close controls. The mission reassurance and hint trigger share 16px text and wrap on narrow screens. Stage 3 uses one of 18 neutral reading examples from learningExamples, followed by a native closed prediction disclosure and transfer guidance; the learner chooses their own combat commands. Stage progress alone is a concise live status. Back/close preserve sensible trigger focus, code is read-only and keyboard-scrollable, and room navigation resets this transient help. No copy-to-editor, automatic answer, new motion, modal or saved hint counter is added. Journal reference excerpts keep their existing separate owner.

EnemyTactics owns the enemy panel in the left column, with intent-specific glyphs and a short response explanation. Boss phases use three quiet jade pips and share the engine's HP thresholds; the indicator never invents extra damage or changes balance. Playback labels the current counter rather than suggesting that the next turn is ready. Finished fights replace the obsolete intent with a clear win/retry state. PlayerEffects belongs inside the right player panel; poison uses a gold outline and text specifying 4 HP per counter and its remaining duration. Poison indicators update at the combat contact beat, persist from existing saves, and disappear when the effect expires. These surfaces add no continuous motion.

The app shell renders independently of the heavy Phaser scene, and CodeMirror loads only when a room opens. ToolLoading reserves the scene/editor space with a static rune and Thai status rather than artificial progress. Run and insertion wait for both tools. If a module download fails, “บันทึกแล้วโหลดใหม่” persists the current checkpoint and draft before reloading, because browsers cache failed imports. A failed save keeps the page open and directs the player to export; it never reloads away unsaved progress. Native pointer focus keeps the bounded mobile execution bar stable in WebKit when the player taps Run or Check plan.

Offline readiness in settings follows the complete active or controlling release through useOfflineReady and its offlineSupport observer. First-time precaching starts after Python is prepared, while an existing active release remains visible during startup. A complete update waits for all old controlled tabs to close, preserving their lazy scene/editor files. Settings adds a quiet paragraph when an update is waiting: play can continue, then save, close all game tabs and reopen to update. A newer incomplete installation cannot hide a still-working old offline release, and an incomplete first installation cannot announce success. Worker/controller listeners are disposed with the component; the presentation does not inspect or modify the save.

Dialog triggers explicitly focus before opening so Modal can restore the actual trigger in Safari/WebKit. CodeMirror mounts and synchronizes controlled document values in layout effects; passive synchronization must not echo stale text over Undo. A skill insertion is isolated from adjacent typing in history. Save mutations synchronize the canonical ref and pending label before the next render; the new checkpoint cannot briefly carry an older “saved” status. The save indicator announces completion only for the current checkpoint, never an older queued write. A stale tab explicitly reports stopped saving, including after local settings edits, while preserving export and the newer stored save.

CampaignSummary extends the completed map with a parchment epilogue, the existing class glyph, 24-room/6-boss totals and best stars out of 72. Its three actions reuse room entry, the canonical journal dialog and the existing export function. It is absent from incomplete campaigns. A recommended practice room favors a missing best star. Replay improves best stars without reducing past scores or minting more coins; results distinguish this run from the saved best. The map region panel has an explicit fluid width and zero minimum width so late-chapter content fits 360px too.

StarRules is the shared native disclosure for transparent victory ratings, shown once in the active mission or won result. Quiet jade star glyphs, 16px HP bands and a 44px summary follow the existing parchment journal language; no modal or new motion. Derive the exact HP ranges from the engine's shared 60%/30% thresholds and the current hero's max HP. Show actual final HP alongside the result and state that code errors and hints carry no star penalty. Invalid runs never mutate combat, including the retained legacy attempt field. Best stars and old saves remain intact; a lower-HP replay may earn fewer stars this run while preserving the previous best.

BattleResult owns the terminal outcome inside the right coding column, immediately after PythonFeedback. A parchment surface, jade win border or brass retry border and 16px Thai copy continue the field-journal identity. Continue/retry and map actions appear before the stars and shared rating disclosure so the next step fits short viewports. After playback the outcome heading receives focus once and scrolls only as needed to reveal the primary action; an already-open Modal suppresses and consumes that reveal. Closing a dialog cannot repeat it. Native Tab reaches the primary action first. Results add no overlay, animation, duplicate live announcement, score rule or save mutation. App reuses its existing entry/navigation/notebook handlers. battle-result.css is the sole owner of the result panel, actions and current/best-star caption; those styles are removed from the old global/journey owners.

The map's region artwork uses a uniformly scaled, bottom-aligned cover image. Preserve the floor and complete hero/enemy silhouettes at phone and wide desktop aspect ratios. The chapter/location label lives in its own ink strip above the image; it must never overlay a long name across a character's head or staff. Keep image height reserved during chapter changes, and leave the battle renderer/framing unchanged. The same original six backdrops, idle animation and reduced-motion preference remain in use.

LearningJournal keeps the field-journal identity inside the same Modal. A quiet book glyph and truthful 18-lesson completion line precede a labeled concept search and native completed-only checkbox. Current-chapter pages open by default; matched pages open for search. Lesson headings pair the name with text/check completion, small Python concept tabs, an explicitly unverified personal draft and an optional reference example. CodeExcerpt shares the ink code surface, 16px monospace, keyboard-scrollable overflow and 44px copy action. Inline clipboard status belongs to that excerpt, while App retains global notices. Search and copying are read-only; the controlled notes field below remains the existing locally saved notebook. No new animation, progress schema or competing overlay owner is introduced.

WCAG 2.2 AA target; 44px targets, visible focus, text plus icon statuses. Reduced motion disables ambient and combat tween motion. Thai locale, Asia/Bangkok timestamps. Audio starts muted. No native alert/confirm/prompt.

BattleAudio owns optional procedural pixel-game sounds, using the existing persisted sound preference and header/settings toggles. A new game is muted; a remembered opt-in still waits for an actual player action to unlock audio. Offensive tones follow the existing impact/HP beat with the attacking source, while shield, potion, charge and result cues follow their own action beats. The adventurer's double slice, knight's low shield impact and wizard's low sweep plus rising rune have distinct short patterns. No background music, new downloads, perpetual sources or extra setting is introduced. Mute, navigation, hidden-page and unmount cleanup cancel queued voices; an unavailable or suspended audio device cannot delay a turn. Reduced motion remains an independent preference.

Combat motion is owned by src/art/motion.ts: ordered anticipation/contact/recovery beats, with damage feedback at contact. Melee closes the distance; adventurer skills cross two blade arcs, knight skills strike with a shield, and wizard skills launch a fire rune. Healing uses rising mint crosses. Breathing, slime squash, blinks and drifting motes give the quiet diorama life. A brief victory hop and falling gold pixels celebrate a clear. Camera shake is limited to 95 ms at 0.002 intensity. Reduced motion retains static shields, healing marks and readable result text with no movement, shake or confetti. Animation queues are disposable presentation and never commit gameplay or replay on settings changes.

Whole-frame pose composition is owned by src/art/pose.ts; src/art/rig.ts interpolates joint angles and renders each complete pixel silhouette. The neck and torso remain intact, limbs extend from connected shoulder/hip joints, and swords, staves and shields attach to hands. Joint overlap and underpainting prevent transparent seams throughout transitions. Hit lighting uses the current posed silhouette. No independently rotated source cutouts or idle-shaped flash overlays are used. Wind-up, strike, guard, cast, hurt and cheer change the silhouette while shadows stay on the floor. Crescent blade trails, short impact holds and ground shockwaves emphasize contact without screen-wide flashes. Slime/spider leaps, golem overhead strikes and caster charge poses preserve enemy identities. A compact DOM cue above the actors labels the current action and its AP cost; enemy preparation never suggests an actual attack. Committed vitals are copied into presentation beats by the engine, so HP and resources change on their corresponding actions. Run waits for recovery and results appear after the defeat beat; saves remain atomic and navigation can leave at any time.

Pose verification includes pixel connectivity across 4,224 interpolated humanoid frames, an actual Phaser atlas of all nine actors in all eight poses, and clock-controlled battle captures at eight moments for all heroes on desktop and phone widths. Tests must check rendered silhouettes as well as runtime errors.

Ambient mist is owned by src/art/ambient.ts and attached only to the backdrop. Three feathered ribbons drift in opposite directions over 36–60 second cycles, with 7.5–10.5% layer opacity and a much fainter floor ribbon. Chapter colors follow forest green, amber dust, ice blue, violet, emerald and starlight. A single 128×32 texture is shared by all three ribbons; no continuous particle spawning, full-screen flashing or character overlays are added. Reduced motion keeps the mist still. Mist tweens are disposed with the scene.

### Verification

HeroTrait extends the existing SkillBook with a quiet, initially collapsed native disclosure before offensive choices. Inherit ink or parchment foreground colors and global 16px typography, with a 44px summary and explicit hover/focus/pressed states. Its short example uses the existing ink/mint code treatment and wraps inside the panel. No new palette, saved UI state or modal. The same class catalog supplies concise onboarding descriptions; TurnPreview adds actual passive messages to its current result and Scene uses its existing cue at the action/contact beat. Keep all passive reading/forecast information in the right player column and retain reduced-motion text cues. Domain rules and verification scope are recorded in docs/HERO-TRAITS.md and UX-CONTRACT.md.

Typecheck, Vitest combat/content/save tests, Playwright real Python, desktop/mobile layouts, cancellation, offline and persistent-save scenarios. Human learner study and real iOS keyboard testing must be reported honestly if unavailable.

## Do's and Don'ts

- Do preserve readable code and Thai lesson text over ornament.
- Do keep rules in the simulation engine and animations disposable.
- Don't borrow art or runtime code from the reference; reuse only the user-authorized lesson content documented in docs/SOURCE-CURRICULUM.md.
- Don't declare simulated browsers equivalent to physical-device usability evidence.
