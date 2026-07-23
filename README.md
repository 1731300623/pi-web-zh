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
  patches/
    zh-cn-ui.patch
  scripts/
    apply.sh
    export-from-tree.sh
    sync-upstream.sh
    localize-ui.py          # 历史辅助脚本（可选）
  README.md
  README.en.md
```

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
