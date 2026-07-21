# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.


# Claude Code Instructions — YG Studio Client Site

## How this site is built
This site is rendered **directly from the client's approved wireframe** — there is
no AI generation step. The approved design lives in `site-data.json`:

- `pages` — each key is a route; the value is the exact approved HTML for that page
- `nav` — authoritative navigation (`label` → `route`)
- `pageOrder` — order pages appear in the nav
- `frameMeta` — data attributes + font CSS variables the markup depends on
- `fontHref` — the Google Fonts stylesheet for the chosen pairing
- `css` — the wireframe stylesheet, captured verbatim

`app/[[...slug]]/page.tsx` renders the matching page via `components/WireframePage.tsx`,
which injects the HTML and wires `data-route` elements to Next.js navigation.

## When a client requests a change
You are editing ONE specific thing the client asked for — nothing else.
- The page markup lives in `site-data.json` under `pages.<route>`. Edit the HTML
  for the relevant section only.
- Preserve the existing structure, colours, fonts, and layout unless the change
  explicitly requires altering them.
- Keep `data-route` attributes intact so navigation keeps working.
- Do not redesign, do not add features, do not touch other pages.

## Always
- Work on a branch — never commit to main
- Run `npm run build` before opening a PR — it must pass with zero errors
- Open a PR with a clear summary of exactly what changed

## Never
- Regenerate or restructure pages that the client didn't ask to change
- Add features or sections not requested
- Push directly to main
- Use external UI libraries not already in the template
