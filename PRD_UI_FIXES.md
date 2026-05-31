# PRD - Covalent AI UI Bug Fixes & Hardening

**Status:** Draft
**Date:** 2026-05-16
**Owner:** Rushil
**Scope:** Frontend (`src/`) + supporting server error shapes

---

## 1. Background

Covalent AI is a React 19 + Vite + Tailwind app (with an Electron desktop shell) that ships three layout tiers: `DesktopShell` (macOS-style windowed apps), `AppShell` (web), and `MobileApp` (<768px). The codebase is ~27K LOC across 127 files with 8 context providers.

An audit surfaced consistent issues across accessibility, error handling, component scale, styling discipline, responsive behavior, and z-index layering. None of these are blocking shipping, but together they degrade reliability, slow iteration, and create user-visible glitches that look like bugs even when underlying logic is correct.

## 2. Goals

- Eliminate user-visible UI bugs (silent failures, broken overflows, modal collisions, inaccessible forms).
- Establish primitives (design tokens, z-index scale, error boundary, shared form components) so new code stops re-introducing the same issues.
- Cut the largest component files down to maintainable sizes without changing behavior.

## 3. Non-Goals

- New features.
- Full visual redesign / rebrand.
- Server rewrite. Backend changes are limited to error response shape so the UI can surface failures.
- Migrating off any framework or library.

## 4. Success Metrics

| Metric | Baseline | Target |
| --- | --- | --- |
| Empty `catch {}` blocks | 37 | 0 |
| Components > 500 LOC | 5 (SlideshowApp 4176, DebatePanel 2526, CurriculaApp 1377, AdminApp 915, StudyModePanel 554) | 0 over 800; SlideshowApp split into ≥6 modules |
| Inline `style={…}` props | 176 | < 40 (only for dynamic numeric values that can't be Tailwind) |
| Form inputs with linked `<label htmlFor>` | partial | 100% |
| Interactive elements with accessible names | ~32 aria attrs across 125+ controls | 100% of icon-only buttons have `aria-label` |
| Distinct ad-hoc z-index values | 12+ | 1 token scale (≤8 layers) |
| Top-level uncaught render crashes | unbounded | Caught by `ErrorBoundary` per route + per windowed app |

## 5. Requirements

Each section lists concrete items. Priority: **P0** (ship first; user-visible or safety), **P1** (next; quality + maintainability), **P2** (nice-to-have).

### 5.1 Error Handling & Failure Visibility - P0

**Problem:** 37 empty `catch {}` blocks across `MiniOS.jsx`, `StudyModePanel.jsx`, `DebatePanel.jsx`. Failures (API errors, clipboard, file extract) disappear; users see a stuck spinner or no feedback.

**Requirements:**
- Replace empty catches with at minimum: `console.error` + a user-facing toast/inline error. Add a shared `Toast` primitive if one doesn't exist.
- Wrap every route in `<ErrorBoundary>` (new component in `src/components/shared/`). Wrap each windowed app in `DesktopShell` in its own boundary so one crash doesn't blank the desktop.
- `ChatInput` file upload (`/api/files/extract`): show inline error on failure with retry; validate MIME client-side before POST. ([ChatInput.jsx:74-150](src/components/chat/ChatInput.jsx))
- `DebatePanel.jsx:1858` clipboard fallback: show "copied / copy failed" feedback either way.
- Server (`server.js`): standardize error responses as `{ error: { code, message } }` so the UI has one shape to parse.

**Acceptance:** grep `catch\s*\{\s*\}` returns 0. Forcing a fetch to fail in dev surfaces a toast on every affected flow.

### 5.2 Accessibility - P0

**Problem:** 32 aria attributes across 125+ interactive controls; `Modal.jsx` is not a real dialog; icon-only buttons unlabeled; form labels not linked.

**Requirements:**
- `Modal.jsx`: add `role="dialog"`, `aria-modal="true"`, focus trap on open, restore focus on close, `Esc` to close, close button `aria-label="Close"`. Restore `document.body.overflow` on unmount, not just close (current code leaks if unmounted while open - [Modal.jsx:8-10](src/components/shared/Modal.jsx)).
- `Input.jsx` + `Textarea`: associate `<label htmlFor>` with input `id`; accept `error` prop and render it with `aria-describedby`; pass through `required`, `pattern`, `min`, `max`. ([Input.jsx:1-23](src/components/shared/Input.jsx))
- Every icon-only button in `Dock`, `MenuBar`, `Spotlight`, `ChatInput`, `Window` controls: add `aria-label`.
- `Spotlight.jsx`: `role="combobox"` on input, `role="listbox"` on results, `aria-selected` on the active item, arrow-key navigation already exists - wire it to `aria-activedescendant`.
- `ChatMessage.jsx`: alt text on inline images; ensure math (KaTeX) blocks have textual fallback via `aria-label` derived from source LaTeX.

**Acceptance:** axe-core run on each page reports 0 critical issues. Tabbing through a modal stays inside the modal.

### 5.3 Z-Index Layer System - P0

**Problem:** 12+ ad-hoc values (`z-[60]` mobile sheets behind `z-[100]` desktop; two components both at `z-[2000]`). `ContextMenu.jsx` uses brittle string matching `[class*="z-[1100]"]`.

**Requirements:**
- Add `src/styles/z-index.js` (or `tokens.js`) exporting a scale, e.g.:
  ```
  base: 0, content: 10, dock: 100, window: 200, menubar: 1100,
  contextmenu: 1200, modal: 2000, spotlight: 2100, tour: 3000,
  toast: 3500, presentation: 9999
  ```
- Replace every literal `z-[…]` with a constant. Add Tailwind safelist entries or use inline `style={{ zIndex: Z.modal }}`.
- Remove the string-match logic in `ContextMenu.jsx` in favor of an explicit "owner" prop or portal target.

**Acceptance:** grep `z-\[\d` returns only the constants file. Opening a modal from inside a maximized window never lands behind the window.

### 5.4 Component Splitting - P1

**Problem:** `SlideshowApp.jsx` 4176 LOC, `DebatePanel.jsx` 2526 LOC, `CurriculaApp.jsx` 1377 LOC, `AdminApp.jsx` 915 LOC. Hard to debug; rendering bugs hide in long switch statements.

**Requirements:**
- **SlideshowApp** → split into: `themes/` (theme objects, currently hex literals lines 40-100), `layouts/` (one file per slide layout from lines 200-300), `useSlideshowState` hook, `SlideRenderer.jsx`, `SlideshowToolbar.jsx`, `SlideshowControls.jsx`.
- **DebatePanel** → `useDebateMachine` hook (state machine), `TournamentBracket.jsx`, `DebateTurn.jsx`, presentational subcomponents.
- **CurriculaApp**, **AdminApp**, **StudyModePanel**: extract data fetching into hooks, lift inline modals to siblings, keep top-level component < 400 LOC.
- No behavior change. Visual regression check by hand on the golden path of each app before/after.

**Acceptance:** no source file > 800 LOC. SlideshowApp split into ≥6 files.

### 5.5 Styling Discipline & Design Tokens - P1

**Problem:** 176 inline `style={…}` usages mixed with Tailwind; hex colors hardcoded in themes; magic numbers (`MOBILE_BREAKPOINT = 768`, animation delays `0.15s`, `0.3s`, modal heights `560`).

**Requirements:**
- Create `src/styles/tokens.js` for spacing, radii, durations, breakpoints. Replace literals.
- Convert inline styles to Tailwind classes wherever the value is static. Keep `style` only for genuinely dynamic numeric values (e.g., `gridTemplateColumns: '${splitRatio}%…'` in [SplitView.jsx:46](src/components/layout/SplitView.jsx)).
- Move all theme hex colors in `SlideshowApp.jsx` into a `themes.js` map; reference Tailwind theme extension where possible.
- Animation delays: define `--anim-stagger-1`, `--anim-stagger-2` CSS vars instead of literal strings in JSX.

**Acceptance:** inline-style usage < 40. No raw `#rrggbb` literals in components (only in `themes.js` / Tailwind config).

### 5.6 Responsive & Overflow Fixes - P1

**Problem:** Fixed pixel heights (`MiniOS.jsx:105` height 560), maximized window math doesn't account for variable menu bar heights ([Window.jsx:48-52](src/components/desktop/Window.jsx)), modal `max-w-md` cramps on mobile, `SplitView` child panels don't manage their own overflow.

**Requirements:**
- `Window.jsx`: read actual menu bar height from a ref or context; clamp drag position to viewport on `window.resize`.
- `MiniOS.jsx`: use `aspect-ratio` + max-height instead of fixed `560`.
- `Modal.jsx`: `max-w-md` on `sm+` only; full-bleed minus 16px on mobile; max-height with internal scroll.
- `SplitView.jsx`: enforce min/max ratio (e.g., 20-80%) with visual snap; add `overflow:auto` on child wrappers.
- Tablet pass: walk each page at 768-1024px and fix overflow / wrap issues.

**Acceptance:** Manual sweep at 360 / 768 / 1024 / 1440 widths, no clipped or overlapping elements on golden paths.

### 5.7 Loading, Empty, and Validation States - P1

**Problem:** Skeleton loaders absent; empty deck/note/goal lists show nothing; quiz submission allows incomplete answers; debate topic fetch has no "no results" branch.

**Requirements:**
- Skeleton components for: curriculum cards, flashcard decks, notes list, goals list, history panel.
- Empty-state component (`<EmptyState icon title body action />`) used by all four list screens above.
- Quiz ([ChatMessage.jsx:22-79](src/components/chat/ChatMessage.jsx)): disable submit until all required answered; mark incomplete questions inline.
- Debate topic chips: timeout after N seconds and surface "Try again."

**Acceptance:** Every list screen renders meaningfully when the data array is empty or still loading.

### 5.8 Dead Code Cleanup - P2

- Remove `MathPracticePage` import in [App.jsx:16](src/App.jsx) referenced in comment as already folded into `MathTutorApp`.
- Sweep unused `lucide-react` imports across components (`SlideshowApp.jsx` named several).
- Audit `LandingPage.jsx` (668 LOC) for abandoned MiniOS demo branches.

### 5.9 Streaming State Hygiene - P2

- `ChatContainer.jsx` / `StudyModePanel.jsx`: pick one - either a ref accumulator with periodic `flushSync` to state, or pure state. Current dual-source (`streamRef.current` + `setStreamContent(streamRef.current)`) is flaky.
- Add an `AbortController` to every SSE/fetch so unmount cancels in-flight requests.

### 5.10 Dependency Hygiene - P2

- Verify `@google/generative-ai ^0.24.1` is still current; bump if breaking changes affect chat.
- Confirm `stripe ^22.0.2` is intentional (no billing UI shipped yet; remove if unused).
- Run `npm audit` and address high/critical.

## 6. Out of Scope

- New chat features, new desktop apps, new curricula content.
- Switching styling system away from Tailwind.
- Server rewrite beyond standardized error envelopes.
- Auth/permission changes.

## 7. Phasing

| Phase | Contents | Rough size |
| --- | --- | --- |
| **Phase 1 - Safety net (P0)** | 5.1 error handling, 5.2 accessibility on shared primitives (`Modal`, `Input`, icon buttons), 5.3 z-index tokens, add `ErrorBoundary` | 1 focused week |
| **Phase 2 - Splits & primitives (P1)** | 5.4 split `SlideshowApp` and `DebatePanel`, 5.5 design tokens & inline-style cleanup, 5.7 empty/loading/validation states | 2 weeks |
| **Phase 3 - Polish (P1/P2)** | 5.6 responsive sweep, 5.8 dead code, 5.9 streaming hygiene, 5.10 deps | 1 week |

Each phase ends with a manual walkthrough on the golden paths (Dashboard → Study → Slideshow → Debate → Flashcards) at three viewport widths.

## 8. Risks

- **Splitting `SlideshowApp` (4176 LOC) risks behavior drift.** Mitigate by extracting one layout/theme at a time, smoke-testing each slide layout after each move.
- **Modal/focus-trap changes can break existing flows** (Spotlight, ContextMenu interact with overlays). Verify keyboard nav on every modal-bearing screen.
- **Error toasts may surface failures that were previously silent and "fine".** Expect a short bump in reported "new bugs" that are actually pre-existing.
- **Tailwind v4 + design tokens:** v4's CSS-first config differs from v3 - confirm `@theme` block is where tokens live before scattering them.

## 9. Open Questions

- Is there a target browser/OS matrix beyond "modern Chromium + Electron 41"? Affects how aggressive we can be on CSS features.
- Are mobile users a first-class audience or a fallback? Drives how much budget Phase 3 mobile pass gets.
- Should `ErrorBoundary` report to a telemetry endpoint, or just render a friendly fallback locally?

## 10. Appendix - Concrete File References

| Area | File | Lines |
| --- | --- | --- |
| Silent catches | [src/components/study/DebatePanel.jsx](src/components/study/DebatePanel.jsx) | 1858 |
| Silent catches | [src/components/study/StudyModePanel.jsx](src/components/study/StudyModePanel.jsx) | 127, 277, 291 |
| Modal a11y | [src/components/shared/Modal.jsx](src/components/shared/Modal.jsx) | 8-10, 24-28 |
| Input a11y | [src/components/shared/Input.jsx](src/components/shared/Input.jsx) | 1-23 |
| Inline styles | [src/components/chat/ChatInput.jsx](src/components/chat/ChatInput.jsx) | 150 |
| Inline styles | [src/components/chat/ChatMessage.jsx](src/components/chat/ChatMessage.jsx) | 114-120 |
| Inline styles | [src/components/layout/SplitView.jsx](src/components/layout/SplitView.jsx) | 46 |
| Window sizing | [src/components/desktop/Window.jsx](src/components/desktop/Window.jsx) | 48-52, 84-85 |
| MiniOS fixed height | [src/components/landing/MiniOS.jsx](src/components/landing/MiniOS.jsx) | 105 (560 px) |
| Monolithic component | [src/components/desktop/apps/SlideshowApp.jsx](src/components/desktop/apps/SlideshowApp.jsx) | themes 40-100, layouts 200-300 |
| Monolithic component | [src/components/study/DebatePanel.jsx](src/components/study/DebatePanel.jsx) | full file 2526 LOC |
| Stale import | [src/App.jsx](src/App.jsx) | 16 |
| Server error shape | [server.js](server.js) | 52, 94-97 |
