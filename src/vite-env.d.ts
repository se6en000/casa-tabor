/// <reference types="vite/client" />

// Injected at build time by vite.config.ts (define). Identifies the shipped build
// so the client can detect a new deploy and auto-refresh.
declare const __BUILD_ID__: string
