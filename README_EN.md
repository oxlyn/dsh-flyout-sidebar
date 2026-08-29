# dsh-flyout-sidebar

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

> DeepSeek Harness (DSH) plugin: a flyout sidebar with a file tree and the Git changed-but-uncommitted files, multi-tab file preview, and a standalone flyout browser tab.
>
> [中文](README.md) ｜ EN

## Install

### From GitHub sources

```sh
dsh plugin --profile web add github:oxlyn/dsh-flyout-sidebar
```

### Local install (development)

```sh
git clone https://github.com/oxlyn/dsh-flyout-sidebar.git
cd dsh-flyout-sidebar
npm install
npm run build          # tsdown → dist/index.js + dist/client.js

# run from the parent directory (dsh plugin add resolves relative paths against the cwd):
cd ..
dsh plugin --profile web add ./dsh-flyout-sidebar   # symlink install; after editing src/ run npm run build and restart dsh web
dsh web
```

### Verify

After installing, **restart `dsh web`** and **hard-refresh the browser** (Cmd/Ctrl+Shift+R). A persistent sidebar icon button appears in the top-right corner (visible even with no session). You can also verify the config layer:

```sh
dsh --profile web --dump-config | grep dsh-flyout-sidebar   # this line should appear
```

## Features

| # | Form | Entry | Description |
|---|------|-------|-------------|
| 1 | File tree view (default) | visible when the panel opens | Browse the current workspace; lazy-expanded directories, directories first; re-roots automatically when the workspace/session switches |
| 2 | Git changes view | git-branch icon in the panel header | Lists changed-but-uncommitted files (`M`/`A`/`D`/`R`/`U` badges, hover for staged/unstaged, renames show the original path); clicking a file shows a colored unified diff against HEAD — untracked files get a synthesized new-file diff |
| 3 | Multi-tab preview | click a file | The preview overlay covers the entire area left of the sidebar; open many files at once; syntax highlighting by extension, plus Markdown, images, PDF and sandboxed HTML iframes; ⇥ collapses the whole preview (tabs kept, opening a file restores them) |
| 4 | Flyout tab | ↗ in the panel header | Pops out to `/flyout-sidebar`, draggable to another monitor; content left / file panel right, one-click side swap, draggable width (defaults to minimum, preference remembered) |

**Highlights:**

- Git status is cached per workspace: the first request awaits the real result, then polls answer instantly while a background refresh runs (700ms debounce after every agent tool run, plus a 15s safety poll covering IDE edits)
- Switching projects/sessions clears all preview tabs automatically, so content never leaks across workspaces
- One-click path copy, or write an `@path` quote into the session composer, from git change rows and file tree rows
- Both the panel and the flyout tab follow DSH's light/dark theme in real time (the flyout syncs via `localStorage`, correct on first paint)
- Coexists with other sidebar plugins: it shifts left of other side cards automatically, both stay visible
- The flyout has no title bar — all vertical space goes to content; the status (live / git error / offline) lives in the panel header row

## Settings

A "**Flyout Sidebar**" tab appears in the DSH settings panel (⚙️ in the bottom-left):

| Setting | Default | Description |
|---|---|---|
| Default expanded | on | Expand the sidebar on page load; when off it starts collapsed |
| Auto refresh | on | Poll the latest git status every 2s while the changes view is open |
| File tree | on | Show the file tree view and the view-toggle icon; when off the panel always shows the Git changes view |
| Min panel width | 20% | Minimum panel width (percent of window width, 20–60%); drag the panel's left edge to widen it |

Settings are stored in the browser's `localStorage` (key `dsh-flyout-sidebar:settings`); the flyout's panel width / side preferences live in `dsh-flyout-sidebar:panelw` / `panelLeft`.

## How it works

The plugin splits into a host side and a client side, written in TypeScript + JSX and bundled by **tsdown** into two single-file bundles:

```
┌─ host side src/index.ts → dist/index.js (Node process, ESM) ────┐
│  - host/artifacts.ts   artifact tracking (write/edit + shell    │
│                        snapshot diff)                           │
│  - host/git.ts         git status/diff (per-workspace cache)    │
│      git status --porcelain=v1 -z   change list                 │
│      git diff HEAD -M -- <path>     colored unified diff text   │
│  - host/workspace.ts   session → workspace cwd resolution       │
│  - host/files.ts       directory listing / text reading         │
│  - host/page.ts        standalone flyout page HTML (inlines the │
│                        shared modules)                          │
│  - host/routes.ts      ctx.webServer.register:                  │
│      GET /flyout-sidebar/gitstatus  change list JSON            │
│      GET /flyout-sidebar/gitdiff    per-file diff JSON          │
│      GET /flyout-sidebar/listdir    directory listing           │
│      GET /flyout-sidebar/content    text content (code preview) │
│      GET /flyout-sidebar/media      images / PDF binary         │
│  - tools/result event → 700ms debounced cache refresh           │
└──────────────────────────────────────────────────────────────────┘
                          │ fetch
┌─ client side src/client/index.tsx → dist/client.js (IIFE) ───────┐
│  - React components (classic JSX via an `h` factory; React is   │
│    provided at runtime by DSH's __ModuleLoader__ factory, the   │
│    bundle does not embed it)                                    │
│  - shell.overlay: persistent top-right icon button + panel      │
│  - file tree ⇄ Git changes views; multi-tab preview overlay     │
│  - settings.section: Flyout Sidebar settings                    │
│  - cross-tab localStorage sync: session id, theme, panel prefs  │
└──────────────────────────────────────────────────────────────────┘
```

Technical notes: a single `tsdown.config.ts` bundles both sides (host ESM / client IIFE); a custom `?raw` plugin inlines the shared module sources into the flyout page's classic `<script>` and embeds the vendored pdf.js into the host bundle (fully offline); shared modules `shared/ext.js` (preview types), `shared/highlight.js` (zero-dependency syntax highlighter) and `shared/markdown.js` (Markdown rendering) are portable JS with JSDoc types, reused on both sides and inlined into the flyout page; host dependencies are declared via `inject: ['webServer', 'sessionQuery', 'timer']`.

## Requirements

- Node `>=20` (DSH host requirement)
- `git` on the PATH and a git repository as the workspace (otherwise the Git changes view shows an error; the file tree is unaffected)
- Local builds need the devDependencies (`tsdown`, `typescript`, ...; zero runtime dependencies)

## Development

```sh
npm run build         # tsdown: regenerate dist/index.js and dist/client.js
npm run check         # tsc --noEmit strict type checking
npm test              # node:test smoke tests (host routes/events + client rendering + flyout page)
```

> Recommended one-time setup of the pre-commit guard: `ln -sf ../../scripts/precommit.sh .git/hooks/pre-commit`. Every `git commit` rebuilds the bundles automatically and blocks the commit if they are out of sync with the sources.

Project structure:

```
dsh-flyout-sidebar/
├── tsdown.config.ts      # tsdown build: host/client bundles + ?raw inline plugin
├── src/index.ts          # host entry (exports name/inject/apply, ESM)
├── dist/                 # ⚙️ generated: index.js (host) / client.js (browser), do not edit
├── src/shared/           # shared portable modules (JSDoc types, inlined into the flyout page): ext / markdown / highlight
├── src/host/             # host modules: types / artifacts / workspace / files / git / page (flyout HTML) / routes (HTTP)
├── src/client/           # client modules (TSX): jsx (React bridge) / runtime / store / styles / icons / preview / components
├── src/vendor/pdfjs/     # vendored pdf.js (embedded at build time, offline-safe)
├── test/                 # node:test smoke tests (black-box checks against dist)
└── cordis.patch.yml      # bundle mount patch
```

## Updates

```sh
dsh plugin --profile web update dsh-flyout-sidebar    # or `add` again
```

Then restart `dsh web` and hard-refresh the browser.

## Links

- [LinuxDo](https://linux.do)

## License

[MIT](LICENSE)
