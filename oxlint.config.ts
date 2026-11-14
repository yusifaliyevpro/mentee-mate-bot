import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "import", "vitest"],
  categories: {
    suspicious: "warn",
  },
  options: {
    typeAware: true,
    typeCheck: true,
  },
  ignorePatterns: [".wrangler"],
  rules: {
    eqeqeq: "warn",
    "no-throw-literal": "warn",
    "unicorn/prefer-node-protocol": "warn",
    "typescript/consistent-type-imports": "warn",
  },
  overrides: [
    {
      // Test fakes stand in for D1 and the Bot API, so they assert their way into those types.
      files: ["tests/**"],
      rules: {
        "typescript/no-unsafe-type-assertion": "off",
        "typescript/no-unnecessary-type-parameters": "off",
      },
    },
  ],
});
