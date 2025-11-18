import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "dist/**",
      "build/**",
      "next-env.d.ts",
      "*.tsbuildinfo",
      "tools/**", // Ignore all tool directories - they have their own ESLint configs
      "logs/**",
      "*.log",
      "*.min.js",
      "*.bundle.js",
      "__pycache__/**",
      "*.pyc",
      ".cache/**",
      ".turbo/**",
      "scripts/**", // Ignore script files
      "start-*.js", // Ignore root-level startup scripts
      "*.config.js", // Ignore config files
      "*.config.mjs",
    ],
  },
  // Override rules for JavaScript files (CommonJS)
  {
    files: ["**/*.js", "**/*.mjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off", // Allow require() in .js files
      "@typescript-eslint/no-var-requires": "off", // Allow require() in .js files
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn", // Warn instead of error for 'any'
    },
  },
  // Override rules for tool directories if they're not ignored
  {
    files: ["tools/**/*.js", "tools/**/*.jsx"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "import/no-anonymous-default-export": "off",
    },
  },
];

export default eslintConfig;
