import { defineConfig } from "greenly";

export default defineConfig({
  name: "MenteeMateBot",
  checks: [
    { name: "TypeScript", command: "pnpm tsc --noEmit" },
    { name: "Oxfmt", command: "pnpm fmt:check", onFail: "pnpm fmt" },
    { name: "Oxlint", command: "pnpm lint" },
    { name: "Tests", command: "pnpm test" },
  ],
});
