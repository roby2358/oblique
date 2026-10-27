---
name: oblique-tools
description: Project-local recipes and hard-won operational facts for /work/oblique. Use before running tests, type-checking, launching the page, or verifying the Bluesky and delve.town accounts — several obvious commands fail here for non-obvious reasons.
---

# Oblique tools

Run recipes through `just`, never the underlying script path.

## Recipes

| Recipe | What it does |
|---|---|
| `just check` | `typecheck` then `test`. What to run before committing. |
| `just typecheck` | `npx tsc --noEmit`. Writes nothing. |
| `just test` | The Jest suite. |
| `just watch` | Re-runs the suite as files change. |
| `just up` | Vite dev server on http://localhost:5173. |
| `just cc-smoke` | **Live, read-only** check that every account in `config.json` can sign in, list notifications and read a thread. Writes nothing — no post, no like, nothing marked seen. |

## `just cc-smoke`

The unit suite never signs in, so it cannot tell you whether an account actually works.
`cc-smoke` is the only thing that can. Run it after changing any account's `service`,
`appview` or `lexicon`, and after changing how the client builds an NSID.

It compiles to `.smoke/` (gitignored) and runs the JS, rather than using `tsx`, because
`tsx` needs esbuild's native binary — see the platform note below.

It cannot tell you whether **posting** works, by design. That has to be checked by hand
against the live account; the risk it leaves is recorded under R-41 in `CRITERIA.md`.

## Things that will bite you

**Never run `npx jest`.** The suite needs `node --experimental-vm-modules`, which
`npm test` supplies. Without it `jest.unstable_mockModule` fails silently and you get a
screenful of phantom failures that have nothing to do with your change. Use
`npm test -- <path>` to run one file.

**`node_modules` is platform-specific.** Vite's `esbuild` and `rollup` ship native binaries,
so an install done on Windows and used from WSL (or the reverse) fails with
`Cannot find module '@esbuild/linux-x64'`. Jest is unaffected (it uses ts-jest), which is
why the suite can pass while `just up` and `tsx` do not. Reinstall on the platform you run
from.

**Run one Jest process at a time.** The suite is slow here — about three minutes for all 28
suites, and two seconds per test just to import modules. Two `npm test` processes at once
starve the event loop, and tests that wait on a short real `setTimeout` (the task factory's
chain tests do) blow their 5-second limit and report as failures that have nothing to do with
your change. If a timeout appears, re-run serially before believing it.

**Tests compile from the repo root.** `tsconfig.json` sets `rootDir: ./src`, so shared
fixtures in `test/helpers/` would be rejected as outside it. `jest.config.js` overrides
`rootDir` to `.` for test compilation only.

**There is no build step.** Vite serves from source; nothing deploys a bundle.

## Docs

`ONTOLOGY.md` is the implementation reference, `CRITERIA.md` the R/U/X criteria,
`ARCHITECTURE_LOG.md` the decisions (`D-n`) and dated history. Reconcile them **in the same
change** as the code, and cite stable IDs rather than section numbers. Tracker is `pjpd`.
