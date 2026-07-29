import { defineConfig } from "vite";

// Deliberately separate from vite.config.ts's test block. That config's
// `include: ['src/**/*.test.ts']` is what CI runs on every push — this file
// lives outside src/ specifically so it's never picked up there. See
// eval/eval-set.ts and eval-set.md for why.
export default defineConfig({
  test: {
    environment: "node",
    include: ["eval/**/*.ts"],
    testTimeout: 30_000,
    // These hit a live LLM against a shared free-tier quota; running cases
    // concurrently just trades a bit of speed for flaky 429s.
    fileParallelism: false,
  },
});
