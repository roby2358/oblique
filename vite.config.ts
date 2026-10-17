import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: true,
    // Edits can arrive from outside this filesystem's event domain (a container, or the
    // Windows side of a WSL mount), where inotify never fires and the module graph keeps
    // serving the transform it cached. Poll instead.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
});

