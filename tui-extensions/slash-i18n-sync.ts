/**
 * slash-i18n-sync — 斜杠命令中文翻译的自动同步钩子。
 *
 * 触发方式：
 *   1. session_start 自动钩子：扫描 pi.getCommands()，与翻译字典 diff，
 *      若发现新命令则自动跑一次翻译迭代（调 自建api中转 flash 翻译 →
 *      外科手术式写入 JSON 三段 → bump userscript 版本 → 通知）。
 *      幂等：合并后新键进入字典，下次 diff 为空即不再跑。
 *   2. /i18n-sync            手动强制跑一次完整迭代。
 *      /i18n-sync check      只做 diff 报告，不写文件。
 *      /i18n-sync list       列出 pending（上次 LLM 失败遗留的）。
 *
 * 作用范围：source ∈ {extension, skill, prompt}（与字典现有覆盖面一致）。
 * builtin 命令（settings/model/export 等）按约定不入 web 字典，故跳过。
 *
 * 安全：只增不删、写入前备份、LLM 失败时只写 pending 报告不改字典。
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";

// ===== 路径常量 =====
const HOME = homedir();
const AGENT_DIR = join(HOME, ".pi", "agent");
const SETTINGS = process.env.SLASH_I18N_SETTINGS ?? join(AGENT_DIR, "settings.json");
const MODELS = process.env.SLASH_I18N_MODELS ?? join(AGENT_DIR, "models.json");
const PENDING = join(AGENT_DIR, "slash-i18n-pending.json");

// 翻译字典（篡改猴 userscript 从 GitHub raw 拉取这份 JSON）
// 可用环境变量覆盖，便于测试/换机。
const DICT_JSON = process.env.SLASH_I18N_DICT ?? "/home/jiabin/pi-web-zh/overlay/lib/slash-command-descriptions.zh-CN.json";
const USERSCRIPT = process.env.SLASH_I18N_USERSCRIPT ?? "/home/jiabin/pi-web-zh/userscripts/pi-web-slash-command-zh.user.js";

const LLM_TIMEOUT_MS = 25000;

// ===== 通用 =====
function safeReadJSON<T = any>(path: string): T | null {
	try {
		if (existsSync(path)) return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch {
		/* ignore */
	}
	return null;
}

interface LLMConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
}

/** 复用 capability-router 的解析方式：自建api中转 + deepseek-v4-flash。 */
function resolveLLMConfig(): LLMConfig | null {
	const settings = safeReadJSON<{ defaultProvider?: string; defaultModel?: string }>(SETTINGS);
	const models = safeReadJSON<{ providers?: Record<string, any> }>(MODELS);
	const providerId = settings?.defaultProvider ?? "自建api中转";
	const provider = models?.providers?.[providerId];
	if (!provider?.baseUrl) return null;
	let apiKey = provider.apiKey;
	if (typeof apiKey === "string" && apiKey.startsWith("$")) {
		apiKey = process.env[apiKey.slice(1)] ?? "";
	}
	if (!apiKey) return null;
	const flash = (provider.models ?? []).find((m: any) => /deepseek-v4-flash/i.test(m.id));
	const model = flash?.id ?? settings?.defaultModel ?? "cline-free/glm-5.2";
	return { baseUrl: provider.baseUrl, apiKey, model };
}

function hasCJK(s: string): boolean {
	return /[\u4e00-\u9fff]/.test(s);
}

function ts(): string {
	return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ===== 外科手术式 JSON 插入（保留人工排版的空行/分组/缩进） =====
function escapeJsonValue(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * 向字典文件的某个 section（bySourceName / byDescription / byCommandName）末尾追加条目。
 * 仅在末尾插入、给原最后一条补逗号、新最后一条不带逗号，其余原样保留。
 */
function insertSection(text: string, section: string, entries: Array<[string, string]>): string {
	if (entries.length === 0) return text;
	const open = text.indexOf(`"${section}": {`);
	if (open < 0) return text;
	const close = text.indexOf("\n  }", open); // 第一处 \n  }（后可跟逗号）
	if (close < 0) return text;
	const before = text.slice(0, close);
	const tail = text.slice(close);
	const beforeTrimmed = before.replace(/\s+$/, "");
	const endsWithComma = /,\s*$/.test(beforeTrimmed);
	const comma = endsWithComma ? "" : ",";
	const indent = "    ";
	const newLines = entries.map(
		([k, v], i) => `${indent}"${escapeJsonValue(k)}": "${escapeJsonValue(v)}"${i < entries.length - 1 ? "," : ""}`,
	);
	return beforeTrimmed + comma + "\n" + newLines.join("\n") + tail;
}

// ===== userscript 版本 bump =====
function bumpUserscriptPatch(): string | null {
	try {
		if (!existsSync(USERSCRIPT)) return null;
		const text = readFileSync(USERSCRIPT, "utf8");
		const m = text.match(/(@version\s+)(\d+)\.(\d+)\.(\d+)/);
		if (!m) return null;
		const next = `${m[2]}.${m[3]}.${Number(m[4]) + 1}`;
		const updated = text.replace(/(@version\s+)\d+\.\d+\.\d+/, `$1${next}`);
		writeFileSync(USERSCRIPT, updated, "utf8");
		return next;
	} catch {
		return null;
	}
}

// ===== 命令枚举与 diff =====
interface LiveCommand {
	source: string; // extension | skill | prompt
	name: string; // 原始 name
	commandKey: string; // byCommandName 的 key
	bySourceKey: string; // bySourceName 的 key
	description: string;
}

/** 仅取 extension / skill / prompt（与字典覆盖面一致；跳过 builtin）。 */
function enumerateCommands(pi: ExtensionAPI): LiveCommand[] {
	const out: LiveCommand[] = [];
	try {
		for (const c of pi.getCommands() as any[]) {
			const source = String(c.source ?? "");
			if (source !== "extension" && source !== "skill" && source !== "prompt") continue;
			const name = String(c.name ?? "");
			if (!name) continue;
			const desc = String(c.description ?? "");
			const commandKey = source === "skill" ? `skill:${name.replace(/^skill:/, "")}` : name;
			const bySourceKey = `${source}/${commandKey}`;
			out.push({ source, name, commandKey, bySourceKey, description: desc });
		}
	} catch {
		/* ignore */
	}
	return out;
}

interface DiffResult {
	pending: LiveCommand[]; // 需要翻译的新命令
	collisions: string[]; // 同名冲突（已存在 key，但描述不同）
}

function diffCommands(live: LiveCommand[], dict: any): DiffResult {
	const byName: Record<string, string> = dict?.byCommandName ?? {};
	const pending: LiveCommand[] = [];
	const collisions: string[] = [];
	const seen = new Set<string>();
	for (const c of live) {
		if (seen.has(c.commandKey)) continue; // 同名只取第一条
		seen.add(c.commandKey);
		if (c.commandKey in byName) {
			// 已翻译：检测描述漂移（可选记录，不强制重译）
			continue;
		}
		if (!c.description) continue;
		pending.push(c);
	}
	return { pending, collisions };
}

// ===== LLM 翻译 =====
async function llmTranslate(
	items: Array<{ key: string; en: string }>,
	cfg: LLMConfig,
	signal?: AbortSignal,
): Promise<Record<string, string>> {
	const prompt = `你是斜杠命令说明的翻译器。把每条英文 description 翻译成简洁的简体中文（zh-CN）。
规则：
- 保留命令语法原样：/caps、/route [query]、(start | pause)、| 管道等。
- 专有名词保留英文：Cloudflare Turnstile、Magic Context、compartment、sidekick、MCP、LLM、SPA、JSON、webhook、spider、jiti、pi、Scrapling 等。
- 简洁，不超过原文字数；不要解释、不要加引号。
- 只返回一个 JSON 数组，元素为 {"key":"<原 key>","zh":"<中文>"}，不要任何额外文字。

输入：
${JSON.stringify(items)}`;

	const ctrl = new AbortController();
	const timeout = setTimeout(() => ctrl.abort(), LLM_TIMEOUT_MS);
	if (signal) signal.addEventListener("abort", () => ctrl.abort(), { once: true });
	try {
		const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
			body: JSON.stringify({
				model: cfg.model,
				messages: [{ role: "user", content: prompt }],
				temperature: 0.2,
				max_tokens: 4096,
			}),
			signal: ctrl.signal,
		});
		if (!res.ok) return {};
		const data = (await res.json()) as any;
		const content: string = data?.choices?.[0]?.message?.content ?? "";
		return parseTranslationArray(content, items);
	} catch {
		return {};
	} finally {
		clearTimeout(timeout);
	}
}

/** 容错提取 JSON 数组（参考 capability-router llmRerank）。 */
function parseTranslationArray(
	content: string,
	items: Array<{ key: string; en: string }>,
): Record<string, string> {
	const start = content.indexOf("[");
	if (start < 0) return {};
	const sub = content.slice(start);
	const arrEnd = sub.lastIndexOf("]");
	let jsonStr: string | null = null;
	if (arrEnd >= 0) {
		jsonStr = sub.slice(0, arrEnd + 1);
	} else {
		const objs = sub.match(/\{[^{}]*\}/g);
		if (objs && objs.length) jsonStr = `[${objs.join(",")}]`;
	}
	let parsed: any[] | null = null;
	if (jsonStr) {
		try {
			parsed = JSON.parse(jsonStr);
		} catch {
			const objs = sub.match(/\{[^{}]*\}/g) ?? [];
			parsed = objs
				.map((s) => {
					try {
						return JSON.parse(s);
					} catch {
						return null;
					}
				})
				.filter((x): x is any => x !== null);
		}
	}
	if (!parsed || parsed.length === 0) return {};
	const validKeys = new Set(items.map((i) => i.key));
	const out: Record<string, string> = {};
	for (const item of parsed) {
		const k = String(item?.key ?? "");
		const zh = String(item?.zh ?? "");
		if (k && zh && validKeys.has(k)) out[k] = zh;
	}
	return out;
}

// ===== 一次翻译迭代 =====
interface SyncReport {
	pendingCount: number;
	translated: string[];
	failed: Array<{ key: string; en: string }>;
	newVersion: string | null;
	merged: boolean;
}

async function syncOnce(
	pi: ExtensionAPI,
	opts: { dryRun?: boolean; signal?: AbortSignal } = {},
): Promise<SyncReport> {
	const live = enumerateCommands(pi);
	const dict = safeReadJSON<any>(DICT_JSON);
	const { pending } = diffCommands(live, dict ?? {});

	const report: SyncReport = {
		pendingCount: pending.length,
		translated: [],
		failed: [],
		newVersion: null,
		merged: false,
	};

	if (pending.length === 0) return report;
	if (opts.dryRun) return report;

	// 准备翻译项
	const items = pending.map((c) => ({ key: c.commandKey, en: c.description }));
	const zhMap: Record<string, string> = {};
	// 已含中文的描述（如 install-scrapling-cachyos-py314）：直接用原文，不调 LLM
	const needLLM: Array<{ key: string; en: string }> = [];
	for (const it of items) {
		if (hasCJK(it.en)) zhMap[it.key] = it.en;
		else needLLM.push(it);
	}
	if (needLLM.length > 0) {
		const cfg = resolveLLMConfig();
		if (cfg) {
			const got = await llmTranslate(needLLM, cfg, opts.signal);
			for (const k of Object.keys(got)) zhMap[k] = got[k];
		}
	}

	// 合并：只合并有 zh 的；缺 zh 的进 failed
	const srcEntries: Array<[string, string]> = [];
	const descEntries: Array<[string, string]> = [];
	const cmdEntries: Array<[string, string]> = [];
	for (const c of pending) {
		const zh = zhMap[c.commandKey];
		if (!zh) {
			report.failed.push({ key: c.commandKey, en: c.description });
			continue;
		}
		srcEntries.push([c.bySourceKey, zh]);
		descEntries.push([c.description, zh]);
		cmdEntries.push([c.commandKey, zh]);
		report.translated.push(c.commandKey);
	}

	if (cmdEntries.length === 0) {
		// LLM 全失败：写 pending 报告，不动字典
		try {
			writeFileSync(
				PENDING,
				JSON.stringify(
					{ at: new Date().toISOString(), pending: pending.map((c) => ({ key: c.commandKey, en: c.description })) },
					null,
					2,
				),
				"utf8",
			);
		} catch {
			/* ignore */
		}
		return report;
	}

	// 写入字典（外科手术式，保留排版；先备份）
	try {
		if (existsSync(DICT_JSON)) copyFileSync(DICT_JSON, `${DICT_JSON}.bak-${ts()}`);
		const text = existsSync(DICT_JSON) ? readFileSync(DICT_JSON, "utf8") : null;
		if (!text) return report;
		let next = text;
		next = insertSection(next, "bySourceName", srcEntries);
		next = insertSection(next, "byDescription", descEntries);
		next = insertSection(next, "byCommandName", cmdEntries);
		// 校验合并结果仍是合法 JSON
		JSON.parse(next);
		writeFileSync(DICT_JSON, next, "utf8");
		report.merged = true;
		report.newVersion = bumpUserscriptPatch();
	} catch {
		report.merged = false;
	}

	return report;
}

// ===== 通知文案 =====
function reportToNotify(r: SyncReport): { msg: string; level: "success" | "warning" | "error" } {
	if (r.pendingCount === 0) return { msg: "斜杠命令翻译已是最新，无新命令。", level: "success" };
	if (!r.merged && r.translated.length === 0) {
		return {
			msg: `发现 ${r.pendingCount} 条新命令，但 LLM 翻译失败，已写入 pending 报告：${PENDING}`,
			level: "warning",
		};
	}
	const ver = r.newVersion ? `；userscript → ${r.newVersion}` : "";
	const failedNote = r.failed.length ? `；${r.failed.length} 条未翻译` : "";
	return {
		msg: `已自动翻译 ${r.translated.length} 条新斜杠命令并写入字典${ver}${failedNote}。请提交并推送 pi-web-zh 以生效。`,
		level: r.failed.length ? "warning" : "success",
	};
}

// ===== 扩展入口 =====
let autoRanThisSession = false;

export default function (pi: ExtensionAPI) {
	// 触发钩子：session_start 后自动跑一次（幂等：合并后下次 diff 为空）
	pi.on("session_start", (_event, ctx) => {
		if (autoRanThisSession) return;
		autoRanThisSession = true;
		// 静默检测 + 自动迭代；失败不影响主流程
		(async () => {
			try {
				const r = await syncOnce(pi);
				if (r.pendingCount > 0) {
					const n = reportToNotify(r);
					ctx.ui.notify(n.msg, n.level as any);
				}
			} catch {
				/* ignore */
			}
		})();
	});

	// 手动入口
	pi.registerCommand("i18n-sync", {
		description: "Slash command zh-CN i18n sync: /i18n-sync [check|list] — detect new commands & auto-translate",
		getArgumentCompletions(prefix: string) {
			const opts = ["check", "list"];
			const f = opts.filter((o) => o.startsWith(prefix));
			return f.length ? f.map((o) => ({ value: o, label: o })) : null;
		},
		handler: async (args, ctx) => {
			const a = (args ?? "").trim();
			const live = enumerateCommands(pi);
			const dict = safeReadJSON<any>(DICT_JSON);
			const { pending } = diffCommands(live, dict ?? {});

			if (a === "check") {
				if (pending.length === 0) {
					ctx.ui.notify("已是最新：无新命令待翻译。", "success");
				} else {
					ctx.ui.notify(
						`待翻译 ${pending.length} 条：${pending.map((c) => c.commandKey).join(", ")}`,
						"warning",
					);
				}
				return;
			}

			if (a === "list") {
				const p = safeReadJSON<any>(PENDING);
				if (!p?.pending?.length) {
					ctx.ui.notify("无 pending 报告（上次未遗留失败项）。", "success");
				} else {
					ctx.ui.notify(
						`pending ${p.pending.length} 条：${p.pending.map((x: any) => x.key).join(", ")}`,
						"warning",
					);
				}
				return;
			}

			// 默认：强制跑一次完整迭代
			ctx.ui.setStatus("i18n-sync", "翻译中…");
			try {
				const r = await syncOnce(pi, { signal: ctx.signal });
				ctx.ui.setStatus("i18n-sync", undefined);
				const n = reportToNotify(r);
				ctx.ui.notify(n.msg, n.level as any);
			} catch (e) {
				ctx.ui.setStatus("i18n-sync", undefined);
				ctx.ui.notify(`i18n-sync 失败: ${e instanceof Error ? e.message : String(e)}`, "error");
			}
		},
	});
}
