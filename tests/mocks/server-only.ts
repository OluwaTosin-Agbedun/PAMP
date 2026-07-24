// Stub for the "server-only" package (aliased in vitest.config.ts). The
// real package throws when imported outside a "react-server" bundler
// condition, which Vitest doesn't set — this makes every lib/* module
// that guards itself with `import "server-only"` importable in tests
// without weakening that guard for the actual Next.js build.
export {};
