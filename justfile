# Oblique — a Bluesky bot that runs entirely as one web page: no server, no database.
# Run from /work/oblique.
#
#   just            # list recipes
#   just run        # dev server on http://localhost:5173
#   just preview    # build, then serve the real bundle
#   just check      # types, tests and build — what to run before committing
#
# Install on the platform you build from: rollup and esbuild ship per-platform
# binaries, so a node_modules/ installed from Windows fails under WSL, and the reverse.

set shell := ["bash", "-uc"]

# List available recipes
default:
    @just --list

# Launch the page: Vite dev server on http://localhost:5173 with hot reload
# BROWSER=none overrides `open: true` in vite.config.ts, which under WSL tries to
# spawn a powershell.exe that is not on this machine and prints a stack trace.
run:
    @[ -f config.json ] || echo "[warn] no config.json — the page loads unconfigured; copy config-example.json and fill it in"
    BROWSER=none npm run dev

# Serve the production bundle from dist/, to check what actually ships
preview: build
    npm start

# Type-check and bundle to dist/
build:
    npm run build

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
check: typecheck test build

# Remove dist/
clean:
    npm run clean

# Install dependencies — on the platform you build from (see the note at the top)
install:
    npm install
