/**
 * 将 pi 命令窗口（输入 / 时的快捷指令补全列表）右侧说明替换为中文。
 *
 * 覆盖：内置 slash 命令、扩展命令、技能命令、提示模板，以及部分参数补全。
 * 使用 /reload 即可热加载本扩展。
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
	AutocompleteItem,
	AutocompleteProvider,
	AutocompleteSuggestions,
} from "@earendil-works/pi-tui";

/** 内置 slash 命令中文说明（按命令名） */
const BUILTIN_ZH: Record<string, string> = {
	settings: "打开设置菜单",
	model: "选择模型（打开选择器）",
	"scoped-models": "启用/禁用 Ctrl+P 循环切换的模型",
	export: "导出会话（默认 HTML，可指定 .html/.jsonl 路径）",
	import: "从 JSONL 文件导入并恢复会话",
	share: "将会话分享为私密 GitHub gist",
	copy: "复制上一条助手消息到剪贴板",
	name: "设置会话显示名称",
	session: "显示会话信息与统计",
	changelog: "显示更新日志",
	hotkeys: "显示全部键盘快捷键",
	fork: "从之前的用户消息创建新分支会话",
	clone: "在当前位置复制当前会话",
	tree: "浏览会话树（切换分支）",
	trust: "保存项目信任决策，供后续会话使用",
	login: "配置提供商认证",
	logout: "移除提供商认证",
	new: "开始新会话",
	compact: "手动压缩会话上下文",
	resume: "恢复另一个会话",
	reload: "重新加载键位、扩展、技能、提示、主题与上下文文件",
	quit: "退出 pi",
	llama: "管理 llama.cpp 路由模型（下载/加载/卸载）",
	grill: "切换持续追问（grill）模式——智能体在执行前先盘问你",
	qna: "从最后一条助手消息中提取问题到编辑器（TUI + Web）",
};

/** 技能命令中文说明（按命令名，如 skill:firecrawl） */
const SKILL_ZH: Record<string, string> = {
	"skill:firecrawl": "通过 Firecrawl CLI 搜索、抓取并与网页交互（含实时搜索与全文抓取）",
	"skill:firecrawl-agent": "AI 驱动的自主数据提取：浏览复杂网站并返回结构化 JSON",
	"skill:firecrawl-crawl": "批量提取整个网站或站点分区的内容",
	"skill:firecrawl-download": "将整个网站下载为本地文件（markdown、截图等）",
	"skill:firecrawl-interact": "控制并与实时浏览器会话交互（点击、填表、流程导航）",
	"skill:firecrawl-map": "发现并列出网站上的所有 URL",
	"skill:firecrawl-monitor": "检测网站内容变化并通过 webhook/邮件通知",
	"skill:firecrawl-parse": "将本地文件（PDF/DOCX/HTML 等）转换为干净的 markdown",
	"skill:firecrawl-scrape": "从任意 URL 提取干净的 markdown（含 JS 渲染 SPA）",
	"skill:firecrawl-search": "带全文内容提取的网页搜索",
	"skill:grill-me": "一场无情的访谈，用以打磨计划或设计（grill 模式入口）",
	"skill:grilling": "对用户的计划、决策或想法进行无情的盘问，逐条追问直至达成共识",
	"skill:id-portfolio-mentor": "工业设计作品集导师——硬核评审、项目辅导与设计研究",
	"skill:design-project-organizer": "将杂乱的设计项目整理为结构化、可重启的作品集工作",
	"skill:ocr-image-pdf-via-gemini-relay": "用 gemini-3.6-flash-high 多模态读取图片/扫描件 PDF（转 JPEG 分批 OCR）",
	"skill:portfolio-figma-archive": "将作品集 Figma 画板格式化为事实已验证、零断链的 Obsidian 归档",
	"skill:sync-pi-relay-models": "将自定义 OpenAI 兼容中转的模型列表同步进 pi 的 models.json + settings.json",
	"skill:verify-llm-maxtokens-config": "验证 LLM 的 maxTokens/contextWindow 配置是否真实生效（对照实验法）",
};

/** 完整英文描述 → 中文 */
const FULL_DESC_ZH: Array<[RegExp | string, string]> = [
	["Open settings menu", "打开设置菜单"],
	["Select model (opens selector UI)", "选择模型（打开选择器）"],
	["Enable/disable models for Ctrl+P cycling", "启用/禁用 Ctrl+P 循环切换的模型"],
	["Export session (HTML default, or specify path: .html/.jsonl)", "导出会话（默认 HTML，可指定 .html/.jsonl 路径）"],
	["Import and resume a session from a JSONL file", "从 JSONL 文件导入并恢复会话"],
	["Share session as a secret GitHub gist", "将会话分享为私密 GitHub gist"],
	["Copy last agent message to clipboard", "复制上一条助手消息到剪贴板"],
	["Set session display name", "设置会话显示名称"],
	["Show session info and stats", "显示会话信息与统计"],
	["Show changelog entries", "显示更新日志"],
	["Show all keyboard shortcuts", "显示全部键盘快捷键"],
	["Create a new fork from a previous user message", "从之前的用户消息创建新分支会话"],
	["Duplicate the current session at the current position", "在当前位置复制当前会话"],
	["Navigate session tree (switch branches)", "浏览会话树（切换分支）"],
	["Save project trust decision for future sessions", "保存项目信任决策，供后续会话使用"],
	["Configure provider authentication", "配置提供商认证"],
	["Remove provider authentication", "移除提供商认证"],
	["Start a new session", "开始新会话"],
	["Manually compact the session context", "手动压缩会话上下文"],
	["Resume a different session", "恢复另一个会话"],
	[
		"Reload keybindings, extensions, skills, prompts, themes, and context files",
		"重新加载键位、扩展、技能、提示、主题与上下文文件",
	],
	[/^Quit\b.*/, "退出 pi"],
	["Toggle relentless follow-up (grill) mode — agent interrogates you before acting", "切换持续追问（grill）模式——智能体在执行前先盘问你"],
	["Extract questions from last assistant message into editor (TUI + Web)", "从最后一条助手消息中提取问题到编辑器（TUI + Web）"],
];

/** 参数补全等场景的常见提示 */
const ARG_HINT_ZH: Record<string, string> = {
	"<provider/model>": "提供商/模型",
	"<provider>": "提供商",
};

/** 去掉扩展/技能描述前的来源标签，例如 "[project] Foo" */
function stripSourceTag(description: string): { tag?: string; body: string } {
	const match = description.match(/^(\[[^\]]+\])\s*(.*)$/);
	if (match) {
		return { tag: match[1], body: match[2] ?? "" };
	}
	return { body: description };
}

function hasCjk(text: string): boolean {
	return /[\u4e00-\u9fff]/.test(text);
}

function translateBuiltin(name: string): string | undefined {
	const bare = name.replace(/^\//, "");
	return BUILTIN_ZH[bare] ?? SKILL_ZH[bare];
}

function translateFullDescription(description: string): string | undefined {
	const trimmed = description.trim();
	for (const [pattern, zh] of FULL_DESC_ZH) {
		if (typeof pattern === "string") {
			if (trimmed === pattern || trimmed.toLowerCase() === pattern.toLowerCase()) {
				return zh;
			}
		} else if (pattern.test(trimmed)) {
			return zh;
		}
	}
	return undefined;
}

/**
 * 将英文说明替换为中文。
 * 若已有中文则原样返回；无法翻译时隐藏英文（返回 undefined）。
 */
function toChineseDescription(name: string | undefined, description: string | undefined): string | undefined {
	if (!description) {
		return name ? translateBuiltin(name) : undefined;
	}

	if (hasCjk(description)) {
		return description;
	}

	const { tag, body } = stripSourceTag(description);

	// 处理 "hint — desc" 形式（argumentHint 拼接）
	const dashSplit = body.split(/\s+[—–-]\s+/);
	if (dashSplit.length === 2) {
		const [hint, desc] = dashSplit;
		const zhHint = ARG_HINT_ZH[hint.trim()] ?? undefined;
		const zhDesc =
			(name ? translateBuiltin(name) : undefined) ??
			translateFullDescription(desc) ??
			undefined;
		if (zhDesc) {
			const text = zhHint ? `${zhHint} — ${zhDesc}` : zhDesc;
			return tag ? `${tag} ${text}` : text;
		}
		// 无法翻译时不展示英文
		return undefined;
	}

	const zh =
		(name ? translateBuiltin(name) : undefined) ??
		translateFullDescription(body);

	if (zh) {
		return tag ? `${tag} ${zh}` : zh;
	}

	// 纯标识符（如 provider 名）保留
	if (/^[a-z0-9._/@+-]+$/i.test(body.trim())) {
		return description;
	}

	// 其余英文无法可靠翻译时隐藏，避免看不懂的英文占位
	return undefined;
}

function annotateItem(item: AutocompleteItem): AutocompleteItem {
	const name = item.label || item.value;
	const description = toChineseDescription(name, item.description);
	if (description === item.description) {
		return item;
	}
	return { ...item, description };
}

function annotateSuggestions(result: AutocompleteSuggestions | null): AutocompleteSuggestions | null {
	if (!result || result.items.length === 0) {
		return result;
	}

	const isSlashNameCompletion = result.prefix.startsWith("/");
	return {
		...result,
		items: result.items.map((item) => {
			if (isSlashNameCompletion) {
				return annotateItem(item);
			}

			// 参数补全：尽量换成中文，否则保留原样（常为 provider/model 名）
			if (item.description && !hasCjk(item.description)) {
				const zh = translateFullDescription(item.description);
				if (zh) {
					return { ...item, description: zh };
				}
			}
			return item;
		}),
	};
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.addAutocompleteProvider((current: AutocompleteProvider): AutocompleteProvider => ({
			triggerCharacters: current.triggerCharacters,
			async getSuggestions(lines, cursorLine, cursorCol, options) {
				const result = await current.getSuggestions(lines, cursorLine, cursorCol, options);
				return annotateSuggestions(result);
			},
			applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
				return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
			},
			shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
				return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
			},
		}));
	});
}
