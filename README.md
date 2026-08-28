# dsh-popout-sidebar

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

> DeepSeek Harness (DSH) 插件：可弹出式侧边栏——文件树 + Git 未提交变更列表，点击文件即可多标签预览，并可弹出为独立浏览器标签页。
>
> 中文 ｜ [EN](README_EN.md)

## 安装 / Install

### 源码安装（GitHub）

```sh
dsh plugin --profile web add github:oxlyn/dsh-popout-sidebar
```

### 本地安装（开发）

```sh
git clone https://github.com/oxlyn/dsh-popout-sidebar.git
cd dsh-popout-sidebar
npm run build          # node scripts/build.js → src/host.js + src/client.js

# 在插件的父目录执行（dsh plugin add 的相对路径锚定调用目录）：
cd ..
dsh plugin --profile web add ./dsh-popout-sidebar   # 符号链接安装，改 src/ 后重启即可生效
dsh web
```

### 验证 / Verify

装完**重启 `dsh web`** 并**硬刷新浏览器**（Cmd/Ctrl+Shift+R），界面右上角应出现常驻侧边栏图标按钮（无会话时也可见）。也可验证配置层：

```sh
dsh --profile web --dump-config | grep dsh-popout-sidebar   # 配置层含本行
```

## 功能 / Features

| # | 形式 | 入口 | 说明 |
|---|------|------|------|
| 1 | 文件树视图（默认） | 面板打开即见 | 浏览当前工作区目录，懒加载展开、目录优先排序，实时跟随工作区/会话切换重新定位根目录 |
| 2 | Git 变更视图 | 面板右上角 git 分支图标 | 列出已变更未提交文件（`M`/`A`/`D`/`R`/`U` 徽章，悬停显示已暂存/未暂存，重命名显示原路径）；点击文件显示相对 HEAD 的着色 unified diff，未跟踪文件自动合成新文件 diff |
| 3 | 多标签预览 | 点击文件 | 预览覆盖层盖住侧边栏左侧整个区域，可同时打开多个文件；按扩展名自动语法高亮，另支持 Markdown 渲染、图片、PDF、HTML 沙箱 iframe；⇥ 收起整个预览（标签保留，点文件恢复） |
| 4 | 弹出独立标签页 | 面板左上角 ↗ | 弹出为 `/popout-sidebar` 独立网页，可拖到另一显示器；内容在左/面板在右，面板左右位置一键切换、宽度可拖动（默认最小宽，记忆偏好） |

**特性一览：**

- Git 变更列表按工作区分桶缓存：首次请求同步等待真实结果，之后即时响应 + 后台刷新（agent 每次工具执行后 700ms 去抖刷新，另有 15s 兜底轮询覆盖 IDE 等带外修改）
- 切换项目/会话时自动清空全部预览标签，杜绝跨项目内容串显
- git 变更行与文件树行可一键复制路径，或把 `@path` 引用写入会话输入框
- 面板与弹出页实时跟随 DSH 浅色 / 深色主题（弹出页经 `localStorage` 同步，首屏即正确）
- 与其他 sidebar 插件兼容：其他侧边卡片打开时自动让位到其左侧，两者同时可见
- 弹出页无标题栏，垂直空间全部留给内容；状态（live / git error / offline）并入面板顶行

## 设置 / Settings

DSH 设置面板（左下角 ⚙️）新增「**Popout Sidebar**」选项卡：

| 设置 | 默认 | 说明 |
|---|---|---|
| 默认展开 | 开 | 页面加载后侧边栏默认展开；关闭则默认收起 |
| 自动刷新 | 开 | Git 变更视图打开时每 2s 轮询最新状态 |
| 文件树 | 开 | 显示文件树视图与视图切换图标；关闭后面板固定显示 Git 变更视图 |
| 最短面板宽度 | 20% | 面板最小宽度（占窗口宽度的百分比，20–60%）；更宽可拖动面板左边缘调整 |

设置保存在浏览器 `localStorage`（键 `dsh-popout-sidebar:settings`），刷新后仍生效；弹出页的面板宽度/左右位置偏好分别存于 `dsh-popout-sidebar:panelw` / `panelLeft`。

## 实现方式 / How it works

插件分为 host 侧与 client 侧两部分，由 `scripts/build.js` 把 `src/{shared,host,client}` 拼装成两个单文件 bundle：

```
┌─ host 侧 src/index.js → src/host.js（Node 进程）────────────────┐
│  - runGit：execFile 执行 git（懒加载 child_process）             │
│      git status --porcelain=v1 -z   变更列表（按工作区分桶缓存） │
│      git diff HEAD -M -- <path>     着色 unified diff 文本       │
│  - ctx.webServer.register：                                      │
│      GET /popout-sidebar/gitstatus  变更列表 JSON                │
│      GET /popout-sidebar/gitdiff    单文件 diff JSON             │
│      GET /popout-sidebar/listdir    文件树目录列表               │
│      GET /popout-sidebar/content    文本内容（代码预览）         │
│      GET /popout-sidebar/media      图片 / PDF 二进制            │
│  - tools/result 事件 → 700ms 去抖刷新对应工作区的状态缓存        │
└──────────────────────────────────────────────────────────────────┘
                          │ fetch
┌─ client 侧 src/client.js（浏览器端 bundle）──────────────────────┐
│  - shell.overlay：右上角常驻图标按钮 + 侧边栏面板                │
│  - 文件树 ⇄ Git 变更视图切换；多标签预览覆盖层（左侧全区域）     │
│  - settings.section：Popout Sidebar 设置项                       │
│  - localStorage 跨页同步：当前会话 id、主题、面板偏好             │
└──────────────────────────────────────────────────────────────────┘
```

技术要点：纯可移植 JS 无构建转译（占位符字符串拼装）；共享模块 `shared/ext.js`（预览类型）、`shared/highlight.js`（零依赖语法高亮）、`shared/markdown.js`（Markdown 渲染）两端复用；host 依赖通过 `inject: ['webServer', 'sessionQuery', 'timer']` 声明。

## 环境要求 / Requirements

- Node `>=20`（DSH 宿主要求）
- `git` 在 PATH 中，且工作区为 git 仓库（否则 Git 变更视图显示错误提示，文件树不受影响）

## 开发 / Development

```sh
npm run build         # 重新生成 src/host.js 与 src/client.js
```

> 建议安装提交前守护（一次即可）：`ln -sf ../../scripts/precommit.sh .git/hooks/pre-commit`。每次 `git commit` 自动重建 bundle，产物与源码不同步会直接拦截提交。

项目结构：

```
dsh-popout-sidebar/
├── src/index.js          # 静态 Host 入口（ESM）
├── src/host.js           # ⚙️ 生成产物：Host 单文件（勿手改）
├── src/client.js         # ⚙️ 生成产物：Client 单文件 bundle（勿手改）
├── src/shared/           # 两端共享纯函数：ext / markdown / highlight
├── src/host/             # host 半模块：body（骨架）/ core（git+文件操作）/ page（弹出页 HTML）/ routes（HTTP 路由）
├── src/client/           # client 半模块：body（骨架）/ core / styles / icons / preview / components
├── scripts/build.js      # bundle 拼装脚本
└── cordis.patch.yml      # bundle 挂载补丁
```

## 更新 / Updates

```sh
dsh plugin --profile web update dsh-popout-sidebar    # 或重新 add
```

随后重启 `dsh web` 并硬刷新浏览器。

## 友情链接 / Links

- [LinuxDo](https://linux.do)

## License

[MIT](LICENSE)
