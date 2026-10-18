# Oblique — a Bluesky bot that runs entirely as one web page: no server, no database.
# Run from /work/oblique.
#
#   just            # list recipes
#   just run        # dev server on http://localhost:5173
#   just check      # types and tests — what to run before committing
#
# There is no build: the page is served by Vite from source, and nothing deploys a bundle
# yet. Install on the platform you run from — esbuild ships per-platform binaries, so a
# node_modules/ installed from Windows fails under WSL, and the reverse.
#
# `run` sets BROWSER=none, which overrides `open: true` in vite.config.ts; under WSL that
# tries to spawn a powershell.exe that is not on this machine and prints a stack trace.
#
# The watcher polls (vite.config.ts). Edits made outside this filesystem's event domain — a
# container, or the Windows side of a WSL mount — fire no inotify event, and Vite then keeps
# serving the module it cached, through a forced browser refresh and all. Polling sees them.

set shell := ["bash", "-uc"]

# List available recipes
default:
    @just --list

# Launch the page: Vite dev server on http://localhost:5173 with hot reload
run:
    @[ -f config.json ] || echo "[warn] no config.json — the page loads unconfigured; copy config-example.json and fill it in"
    BROWSER=none npm run dev

# Run the Jest suite
test:
    npm test

# Re-run the suite as files change
watch:
    npm run test:watch

# Type-check only; writes nothing
typecheck:
    npx tsc --noEmit

# Everything green before a commit
check: typecheck test

# Live read-only check that every account in config.json can be reached (no posts, no likes).
# Compiles to .smoke/ first: tsx needs esbuild's native binary, which a node_modules/
# installed from the other platform does not have (see the note at the top).
cc-smoke:
    @rm -rf .smoke
    npx tsc scripts/smoke-accounts.ts --outDir .smoke --rootDir . --module esnext \
        --moduleResolution bundler --target ES2022 --lib ES2022,DOM --strict \
        --esModuleInterop --skipLibCheck --allowSyntheticDefaultImports --resolveJsonModule
    node .smoke/scripts/smoke-accounts.js

# Install dependencies — on the platform you run from (see the note at the top)
install:
    npm install
