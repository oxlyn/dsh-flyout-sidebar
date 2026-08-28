# dsh-popout-sidebar

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

> DeepSeek Harness (DSH) plugin: a popout sidebar with a file tree and the Git changed-but-uncommitted files, multi-tab file preview, and a standalone popout browser tab.
>
> [中文](README.md) ｜ EN

## Install

### From GitHub sources

```sh
dsh plugin --profile web add github:oxlyn/dsh-popout-sidebar
```

### Local install (development)

```sh
git clone https://github.com/oxlyn/dsh-popout-sidebar.git
cd dsh-popout-sidebar
npm run build          # node scripts/build.js → src/host.js + src/client.js

# run from the parent directory (dsh plugin add resolves relative paths against the cwd):
cd ..
dsh plugin --profile web add ./dsh-popout-sidebar   # symlink install; edits to src/ apply after a restart
dsh web
```

### Verify

After installing, **restart `dsh web`** and **hard-refresh the browser** (Cmd/Ctrl+Shift+R). A persistent sidebar icon button appears in the top-right corner (visible even with no session). You can also verify the config layer:

```sh
dsh --profile web --dump-config | grep dsh-popout-sidebar   # this line should appear
```

## Features

| # | Form | Entry | Description |
|---|------|-------|-------------|
| 1 | File tree view (default) | visible when the panel opens | Browse the current workspace; lazy-expanded directories, directories first; re-roots automatically when the workspace/session switches |
| 2 | Git changes view | git-branch icon in the panel header | Lists changed-but-uncommitted files (`M`/`A`/`D`/`R`/`U` badges, hover for staged/unstaged, renames show the original path); clicking a file shows a colored unified diff against HEAD — untracked files get a synthesized new-file diff |
| 3 | Multi-tab preview | click a file | The preview overlay covers the entire area left of the sidebar; open many files at once; syntax highlighting by extension, plus Markdown, images, PDF and sandboxed HTML iframes; ⇥ collapses the whole preview (tabs kept, opening a file restores them) |
| 4 | Popout tab | ↗ in the panel header | Pops out to `/popout-sidebar`, draggable to another monitor; content left / file panel right, one-click side swap, draggable width (defaults to minimum, preference remembered) |

**Highlights:**

- Git status is cached per workspace: the first request awaits the real result, then polls answer instantly while a background refresh runs (700ms debounce after every agent tool run, plus a 15s safety poll covering IDE edits)
- Switching projects/sessions clears all preview tabs automatically, so content never leaks across workspaces
- One-click path copy, or write an `@path` quote into the session composer, from git change rows and file tree rows
- Both the panel and the popout tab follow DSH's light/dark theme in real time (the popout syncs via `localStorage`, correct on first paint)
- Coexists with other sidebar plugins: it shifts left of other side cards automatically, both stay visible
- The popout has no title bar — all vertical space goes to content; the status (live / git error / offline) lives in the panel header row

## Settings

A "**Popout Sidebar**" tab appears in the DSH settings panel (⚙️ in the bottom-left):

| Setting | Default | Description |
|---|---|---|
| Default expanded | on | Expand the sidebar on page load; when off it starts collapsed |
| Auto refresh | on | Poll the latest git status every 2s while the changes view is open |
| File tree | on | Show the file tree view and the view-toggle icon; when off the panel always shows the Git changes view |
| Min panel width | 20% | Minimum panel width (percent of window width, 20–60%); drag the panel's left edge to widen it |

Settings are stored in the browser's `localStorage` (key `dsh-popout-sidebar:settings`); the popout's panel width / side preferences live in `dsh-popout-sidebar:panelw` / `panelLeft`.

## How it works

The plugin splits into a host side and a client side, assembled by `scripts/build.js` from `src/{shared,host,client}` into two single-file bundles:

```
┌─ host side src/index.js → src/host.js (Node process) ───────────┐
│  - runGit: execFile git (child_process loaded lazily)           │
│      git status --porcelain=v1 -z   change list (per-workspace  │
│                                     bucketed cache)             │
│      git diff HEAD -M -- <path>     colored unified diff text   │
│  - ctx.webServer.register:                                      │
│      GET /popout-sidebar/gitstatus  change list JSON            │
│      GET /popout-sidebar/gitdiff    per-file diff JSON          │
│      GET /popout-sidebar/listdir    directory listing           │
│      GET /popout-sidebar/content    text content (code preview) │
│      GET /popout-sidebar/media      images / PDF binary         │
│  - tools/result event → 700ms debounced cache refresh           │
└──────────────────────────────────────────────────────────────────┘
                          │ fetch
┌─ client side src/client.js (browser bundle) ─────────────────────┐
│  - shell.overlay: persistent top-right icon button + panel      │
│  - file tree ⇄ Git changes views; multi-tab preview overlay     │
│  - settings.section: Popout Sidebar settings                    │
│  - cross-tab localStorage sync: session id, theme, panel prefs  │
└──────────────────────────────────────────────────────────────────┘
```

Technical notes: portable JS with no transpilation (placeholder string assembly); shared modules `shared/ext.js` (preview types), `shared/highlight.js` (zero-dependency syntax highlighter) and `shared/markdown.js` (Markdown rendering) are reused on both sides; host dependencies are declared via `inject: ['webServer', 'sessionQuery', 'timer']`.

## Requirements

- Node `>=20` (DSH host requirement)
- `git` on the PATH and a git repository as the workspace (otherwise the Git changes view shows an error; the file tree is unaffected)

## Development

```sh
npm run build         # regenerate src/host.js and src/client.js
```

> Recommended one-time setup of the pre-commit guard: `ln -sf ../../scripts/precommit.sh .git/hooks/pre-commit`. Every `git commit` rebuilds the bundles automatically and blocks the commit if they are out of sync with the sources.

Project structure:

```
dsh-popout-sidebar/
├── src/index.js          # static host entry (ESM)
├── src/host.js           # ⚙️ generated: host single file (do not edit)
├── src/client.js         # ⚙️ generated: client single-file bundle (do not edit)
├── src/shared/           # shared pure functions: ext / markdown / highlight
├── src/host/             # host half-module: body (skeleton) / core (git + file ops) / page (popout HTML) / routes (HTTP)
├── src/client/           # client half-module: body (skeleton) / core / styles / icons / preview / components
├── scripts/build.js      # bundle assembly script
└── cordis.patch.yml      # bundle mount patch
```

## Updates

```sh
dsh plugin --profile web update dsh-popout-sidebar    # or `add` again
```

Then restart `dsh web` and hard-refresh the browser.

## Links

- [LinuxDo](https://linux.do)

## License

[MIT](LICENSE)
