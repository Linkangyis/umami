# Repository Guidelines

## Project Structure & Module Organization

Umami is a Next.js/React analytics application written primarily in TypeScript.

- `src/app/`: pages, layouts, and API route handlers.
- `src/components/`: shared UI and hooks; `src/store/`: Zustand state.
- `src/lib/`, `src/permissions/`, and `src/queries/`: utilities, authorization, and Prisma/SQL queries.
- `src/tracker/` and `src/recorder/`: browser tracking and session recording scripts.
- `src/assets/`: source artwork; `public/`: static files and translations.
- `prisma/`: PostgreSQL schema and migrations; `db/`: database-specific SQL.
- Unit tests sit beside source files; `src/test/` contains shared helpers; `tests/e2e/` contains browser/API scenarios.

## Build, Test, and Development Commands

Use pnpm and Node.js 22, matching the Node version in CI and Docker. Configure `DATABASE_URL` in a local `.env` before building.

- `pnpm install`: install dependencies.
- `pnpm build`: generate database clients, apply migrations, build browser scripts and geolocation data, then compile Next.js.
- `pnpm dev`: start the development server at `http://localhost:3000`.
- `pnpm start`: serve the production build.
- `pnpm test`: run Vitest once; the `pretest` script generates the Prisma client.
- `pnpm test:watch`: run Vitest interactively.
- `pnpm test:e2e`: run Playwright Chromium scenarios; starts the development server automatically.
- `pnpm lint`: run Biome linting. `pnpm format` rewrites formatting; `pnpm check` applies Biome checks and fixes.

## Coding Style & Naming Conventions

Follow `biome.json`: two-space indentation, LF endings, 100-character lines, single JavaScript quotes, and trailing commas. Use TypeScript, PascalCase component filenames (`UserButton.tsx`), and `use`-prefixed hooks (`useFilters.ts`). Follow neighboring utility naming. Use `@/` imports for modules under `src/` and let Biome organize imports.

## Testing Guidelines

Use Vitest with jsdom and React Testing Library. Name colocated tests `*.test.ts` or `*.test.tsx`; explicitly import Vitest APIs and use `test`. Import component rendering helpers from `@/test/render`; prefer accessible queries. Playwright tests use `tests/e2e/*.spec.ts` and `data-test` selectors. Add regression tests for behavior changes. No numeric coverage threshold is configured.

## Commit & Pull Request Guidelines

Branch from `dev` and target PRs to `dev`. Keep each PR focused. History mixes concise imperative subjects with `fix(scope): ...` and `feat: ...`; follow these patterns. Describe what changed and why, link related issues, and include validation results and screenshots for UI changes. Run `pnpm test`, `pnpm build`, and `pnpm lint` before submission.

## Configuration & Generated Files

Use a dedicated development database: builds apply migrations. Keep credentials in ignored `.env` files. Do not commit generated clients, `.next/`, `public/script.js`, or `public/recorder.js`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

开发完毕后部署：开发完以后部署到这个服务器（上面已经运行了一个了）root@47.76.235.118  密码:Aa!1961520994