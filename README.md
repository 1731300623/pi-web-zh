# pi-web-zh

[agegr/pi-web](https://github.com/agegr/pi-web) 的**独立中文汉化层**。

本仓库**不包含**完整上游源码，只保存：

- `overlay/`：汉化后的 UI 文件（可直接覆盖）
- `patches/zh-cn-ui.patch`：相对 `BASE.json` 中上游提交的 diff
- `scripts/`：一键应用 / 同步上游 / 从本地树导出

上游更新后，重新 `apply` 或 `sync-upstream` 即可；汉化迭代与官方仓库解耦。

## 默认语言

- 默认 `zh-CN`
- 实现：`overlay/lib/i18n.ts`（`t()` + 词典）
- 浏览器可扩展 `localStorage` 键：`pi-web-locale`（`zh-CN` | `en`）

## 快速使用（推荐）

在已有 pi-web 源码目录上应用汉化：

```bash
git clone git@github.com:1731300623/pi-web-zh.git
# 假设上游源码在 ../pi-web
./pi-web-zh/scripts/apply.sh ../pi-web hybrid

cd ../pi-web
npm install
npm run build
npm install -g .
# 重启 pi-web
```

### 一键：拉上游 + 打汉化 + 构建 + 全局安装

```bash
./scripts/sync-upstream.sh --install
# 或指定目录
./scripts/sync-upstream.sh --dir /home/jiabin/pi-web --install
```

## 三种应用模式

| 模式 | 命令 | 说明 |
|------|------|------|
| `overlay` | `./scripts/apply.sh <dir> overlay` | 直接复制 `overlay/` 文件（默认） |
| `patch` | `./scripts/apply.sh <dir> patch` | 使用 `git apply --3way` |
| `hybrid` | `./scripts/apply.sh <dir> hybrid` | 先 patch，失败再 overlay |

- 目标接近 `BASE.json` 的 `upstream_commit` 时，`patch` / `hybrid` 更干净。
- 上游改动很大时，`overlay` 可能覆盖掉那些文件里的上游新功能，需要手动合并后重新 export。

## 上游升级后怎么维护汉化

```bash
# 1) 更新干净上游
cd /path/to/pi-web
git fetch origin
git checkout main
git reset --hard origin/main

# 2) 应用汉化
/path/to/pi-web-zh/scripts/apply.sh . hybrid

# 3) 如有冲突：手动修好组件与 lib/i18n.ts

# 4) 把修好的汉化导回本仓库
/path/to/pi-web-zh/scripts/export-from-tree.sh /path/to/pi-web

# 5) 提交并推送 pi-web-zh
cd /path/to/pi-web-zh
git add -A && git commit -m "sync: rebase zh overlay onto upstream $(git -C /path/to/pi-web rev-parse --short HEAD)"
git push

# 6) 构建安装
cd /path/to/pi-web && npm run build && npm install -g .
```

## 目录结构

```text
pi-web-zh/
  BASE.json                 # 基于的上游 commit / 文件清单
  overlay/                  # 汉化文件快照
    app/layout.tsx
    components/*.tsx
    hooks/useAgentSession.ts
    lib/i18n.ts
    lib/slash-command-descriptions.zh-CN.json
    lib/slash-command-i18n.ts
  patches/
    zh-cn-ui.patch
  userscripts/
    pi-web-slash-command-zh.user.js  # 可选：本地未集成运行时词典时的 Violentmonkey 脚本
  scripts/
    apply.sh
    export-from-tree.sh
    sync-upstream.sh
    localize-ui.py          # 历史辅助脚本（可选）
  README.md
  README.en.md
```

## 动态 slash 命令描述（技能 / 扩展 / 提示模板）

内置 UI 文案走 `lib/i18n.ts` 的 `t()`。**动态加载**的 slash 命令描述（`get_commands` 返回的 extension / prompt / skill）走独立词典，避免把用户资源字符串塞进通用 UI 词典。

### 查找顺序

运行时 helper：`lib/slash-command-i18n.ts` → `localizeSlashCommandDescription` / `localizeSlashCommands`。

在 `zh-CN` 下对每条命令：

1. `bySourceName["<source>/<name>"]`（例如 `skill/skill:brave-search`、`extension/handoff`、`prompt/plan-only`）
2. `byDescription[exact English description]`（完整英文描述精确匹配）
3. 仍无命中则保留原始英文

`en` 语言（`localStorage["pi-web-locale"] = "en"`）直接返回原始英文，不查词典。
无 `description` 字段时保持 `undefined`。

集成点：`hooks/useAgentSession.ts` 的 `loadSlashCommands()` 在 `get_commands` 之后立刻映射，`ChatInput` 渲染与过滤使用同一份已本地化数组。

### 如何新增 / 更新一条翻译

1. 打开会话，在 DevTools 或后端日志中确认命令的 `source`、`name` 与**完整英文** `description`（与上游 frontmatter / `registerCommand` 字符串一致，含标点）。
2. 编辑共享词典 `lib/slash-command-descriptions.zh-CN.json`（源码树与 `overlay/` 同源）：
   - 稳定命令优先写 `bySourceName`（不怕英文描述微调时丢覆盖）
   - 同时写 `byDescription`，便于 userscript 与无 source 信息的精确匹配
3. **不必**改 `SKILL.md` / 扩展源码；词典只影响 pi-web 展示。
4. 上游英文描述变更后：复查对应中文是否仍准确；`bySourceName` 可能语义过期，`byDescription` 键必须与新的英文完全一致。

### 验证

```bash
cd /path/to/pi-web
node --test lib/slash-command-i18n.test.mjs
node_modules/.bin/tsc --noEmit
npm run lint
# 不要在日常开发中跑 next build

# 导回本仓库
/path/to/pi-web-zh/scripts/export-from-tree.sh /path/to/pi-web
```

浏览器：`/` 打开 slash 面板，确认技能/扩展/提示描述为中文；设置 `localStorage["pi-web-locale"]="en"` 并刷新后应恢复英文；未收录命令保持可读英文。

### 可选 userscript（localhost）

当运行的是**未集成**本词典的官方/旧版 pi-web，可用 Violentmonkey 安装：

[`userscripts/pi-web-slash-command-zh.user.js`](./userscripts/pi-web-slash-command-zh.user.js)

- 仅匹配 `http://localhost:30141/*` 与 `http://127.0.0.1:30141/*`
- 通过 `@resource` 加载本仓库 raw 的 `overlay/lib/slash-command-descriptions.zh-CN.json`，只使用 `byDescription`
- **仅**翻译 slash 面板命令按钮内的描述 `<span>`（同一 `<button>` 内必须有以 `/` 开头的命令名 span）；不遍历聊天消息或任意页面文本，不做子串替换
- `MutationObserver` 只处理新增节点与变更的文本节点（debounced），不在流式聊天时全量重扫 `document.body`；资源失败时静默降级
- Violentmonkey 可能缓存 `@resource`：词典更新后请在脚本管理里「更新」或重装脚本，并递增脚本 `@version`

已集成运行时路径的中文版**不需要**装 userscript。

## 与官方包的关系

| 操作 | 结果 |
|------|------|
| `npm install -g @agegr/pi-web` | 官方英文构建，**会覆盖**你的全局中文版 |
| `npm install -g .`（在已 apply 汉化的源码树） | 安装中文版 |
| 只更新本仓库 `pi-web-zh` | **不影响**正在运行的 pi-web，直到你重新 apply + build + install |

建议：全局包始终从「上游 + 本汉化层」构建，不要混用官方 registry 包。

## 基准版本

见 [`BASE.json`](./BASE.json)：

- upstream: `agegr/pi-web`
- commit: 以文件内 `upstream_commit` 为准

## License

汉化层脚本与翻译文件采用 MIT。  
上游 pi-web 仍遵循其原仓库许可证（MIT）。
