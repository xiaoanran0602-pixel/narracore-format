// format_screenplay 工具实现（开源版，自私有仓 narracore-mcp 适配）：
// 计费/幂等预留/PDF 渲染/审计层全部剥离——本地运行、免费、无额度。
//
// 双模式（与 hosted 版同一管线，prepareInput 逐字一致）：
// - text（默认）：逐行剧本文本 → 解析器；结构守卫（UNRESOLVED_STRUCTURE）+
//   歧义行诊断；置信度=非歧义行占比（不是准确率），守卫触发时封顶 0.5。
// - blocks：调用方提交类型化块 → 确定性校验与渲染，不重新分类；
//   speaker 派生人物行（上一派生同名不重复派发）。
// output='validate_only'：只校验出诊断，不渲染。
// output='pdf_and_blocks'：hosted 服务的枚举值，本地包按 blocks_only 处理并
// 在 next_step 指向 hosted PDF 服务（开源包不含 PDF 链路——那是 narracore.app
// 的差异点）。

import { createHash } from 'node:crypto';
import { parseScreenplayText } from '../format/parser';
import { preNormalizeScreenplayText } from '../format/pre-normalize';
import { assessConfidence } from '../format/confidence';
import { toPlainText } from '../format/to-plain-text';
import {
  blocksToLayoutRules,
  paginateBlocks,
  detectLanguageFromBlocks,
  type ContentLanguage,
  type LayoutRules,
} from '../format/layout-rules';
import type { DocumentBlock } from '../format/types';
import {
  structureGuard,
  ambiguityDiagnostics,
  labeledHeaderDiagnostics,
  type Diagnostic,
  type ValidationStatus,
} from './diagnostics';
import { normalizeBlocks, type BlockInput } from './blocks-input';
import { MANUAL_URL, HOSTED_SERVICE_URL } from '../brand';

export const CONTRACT_VERSION = '3';

export interface ToolDeps {
  maxTextChars: number;
}

export type OutputMode = 'pdf_and_blocks' | 'blocks_only' | 'validate_only';

export interface ToolInput {
  input_format?: 'text' | 'blocks';
  text?: string;
  blocks?: BlockInput[];
  request_id?: string;
  content_language?: 'zh' | 'en' | 'auto';
  output?: OutputMode;
  /** 回执正文形态（默认 both） */
  include?: 'blocks' | 'plain_text' | 'both';
}

export interface Prepared {
  ok: true;
  renderBlocks: DocumentBlock[];
  echoed: Array<{ id?: string; type: string; text: string; speaker?: string }>;
  diagnostics: Diagnostic[];
  hasErrors: boolean;
  validationStatus: ValidationStatus;
  confidence: number;
  warnings: string[];
  chars: number;
  /** 调用方提交的块数（文本模式=解析产出的块数；不含派生元素） */
  inputCount: number;
  lang: ContentLanguage;
  plainText: string;
  pages: number;
  /** 页级明细：与回显 blocks 数组对齐的起始正文页（1 起） */
  pageStarts: number[];
}

export interface ToolSuccess {
  ok: true;
  contract_version: string;
  validation_status: ValidationStatus;
  diagnostics: Diagnostic[];
  /** include="plain_text" 时省略（此时回执只携带排版正文） */
  blocks?: Array<{ id?: string; type: string; text: string; speaker?: string }>;
  plain_text?: string;
  stats?: {
    input_blocks: number;
    render_elements: number;
    scenes: number;
    pages: number;
    page_starts: number[];
    chars: number;
    content_language: ContentLanguage;
  };
  confidence?: number;
  warnings?: string[];
  next_step: string;
  request_id: string;
}

export type ToolFailureReason =
  | 'missing_text'
  | 'text_too_long'
  | 'nothing_to_format'
  | 'invalid_blocks';

export interface ToolFailure {
  ok: false;
  reason: ToolFailureReason;
  message: string;
  request_id?: string;
  contract_version?: string;
  diagnostics?: Diagnostic[];
}

// 输入形态类失败 message 尾部追加工具专属正确用法句（沿 §0.21 引导模式；
// 锚点改为本仓 README）。

/** withUsageHint 的生效范围：输入形态类 reason。 */
const USAGE_HINT_REASONS = new Set([
  'missing_text',
  'text_too_long',
  'nothing_to_format',
  'invalid_blocks',
  'invalid_findings',
  'invalid_mode',
  'invalid_direction',
  'missing_fountain',
  'no_scenes',
  'invalid_scenes',
]);

/** 失败回执 message 尾部追加引导句；reason 不在集合内的原样返回。 */
export function withUsageHint<T extends { ok: false; reason: string; message: string }>(failure: T, hint: string): T {
  if (!USAGE_HINT_REASONS.has(failure.reason)) return failure;
  return { ...failure, message: `${failure.message} ${hint}` };
}

/** 按 include 裁剪回执正文（both=默认全给；validate_only 回执本就只有 blocks）。 */
function applyInclude(receipt: ToolSuccess, include: 'blocks' | 'plain_text' | 'both' | undefined): ToolSuccess {
  if (include === 'blocks') {
    const { plain_text: _omit, ...rest } = receipt;
    void _omit;
    return rest;
  }
  if (include === 'plain_text') {
    const { blocks: _omit, ...rest } = receipt;
    void _omit;
    return rest;
  }
  return receipt;
}

/** 页级明细：paginateBlocks 一遍取每个渲染块首次落页（片段持块引用，Map 按
 *  对象身份编址），再经回显桥映射到输出 blocks。 */
function pageStartsOf(
  blocks: DocumentBlock[],
  rules: LayoutRules,
  renderIndexOfEchoed?: readonly number[],
): { pages: number; pageStarts: number[] } {
  const renderIndex = new Map<DocumentBlock, number>();
  blocks.forEach((b, i) => renderIndex.set(b, i));
  const firstPage = new Array<number>(blocks.length).fill(0);
  let pageCount = 0;
  for (const page of paginateBlocks(blocks, rules)) {
    pageCount += 1;
    for (const fragment of page.fragments) {
      const idx = renderIndex.get(fragment.block);
      if (idx !== undefined && firstPage[idx] === 0) firstPage[idx] = pageCount;
    }
  }
  for (let i = 0; i < firstPage.length; i += 1) {
    if (firstPage[i] === 0) firstPage[i] = pageCount; // 未入片段的兜底（不应发生）
  }
  const bridge = renderIndexOfEchoed ?? blocks.map((_, i) => i);
  return { pages: pageCount, pageStarts: bridge.map((ri) => firstPage[ri] ?? pageCount) };
}

/** 本工具的引导句（英文正本）。 */
const FORMAT_USAGE_HINT = `Send a screenplay as {"text": "..."} (or typed "blocks" for exact control) — full manual: ${MANUAL_URL}`;

/** 双模式输入准备（与 hosted 版共享同一管线：analyze / diagnose / convert 复用）。 */
export function prepareInput(input: ToolInput, deps: ToolDeps): Prepared | ToolFailure {
  const mode = input.input_format ?? 'text';

  if (mode === 'blocks') {
    if (!Array.isArray(input.blocks) || input.blocks.length === 0) {
      return {
        ok: false,
        reason: 'invalid_blocks',
        message: 'input_format="blocks" requires a non-empty blocks array.',
        contract_version: CONTRACT_VERSION,
      };
    }
    const serialized = JSON.stringify(input.blocks);
    if (serialized.length > deps.maxTextChars * 2) {
      return {
        ok: false,
        reason: 'text_too_long',
        message: `blocks payload too large (limit ≈ ${deps.maxTextChars * 2} chars serialized). Split the screenplay and submit in parts.`,
        contract_version: CONTRACT_VERSION,
      };
    }
    const normalized = normalizeBlocks(input.blocks);
    const lang: ContentLanguage =
      input.content_language && input.content_language !== 'auto'
        ? input.content_language
        : detectLanguageFromBlocks(normalized.blocks);
    const rules = blocksToLayoutRules(normalized.blocks, { contentLang: lang });
    const pagination = pageStartsOf(normalized.blocks, rules, normalized.renderIndexOfEchoed);
    return {
      ok: true,
      renderBlocks: normalized.blocks,
      echoed: normalized.echoed,
      diagnostics: normalized.diagnostics,
      hasErrors: normalized.status === 'invalid',
      validationStatus: normalized.status,
      confidence: 1,
      warnings: [],
      chars: normalized.chars,
      inputCount: normalized.inputCount,
      lang,
      plainText: toPlainText(normalized.blocks, { contentLang: lang }),
      pages: pagination.pages,
      pageStarts: pagination.pageStarts,
    };
  }

  // text 模式
  if (input.text === undefined || input.text.length === 0) {
    return {
      ok: false,
      reason: 'missing_text',
      message: 'Field "text" is required when input_format="text" (default).',
      contract_version: CONTRACT_VERSION,
    };
  }
  if ([...input.text].length > deps.maxTextChars) {
    return {
      ok: false,
      reason: 'text_too_long',
      message: `Text exceeds the ${deps.maxTextChars}-character limit. Please split the screenplay into parts and format them one by one.`,
      contract_version: CONTRACT_VERSION,
    };
  }
  // 前置归一：转录形态改写在解析器之前
  const normalized = preNormalizeScreenplayText(input.text);
  const rows = parseScreenplayText(normalized.text);
  if (rows.length === 0) {
    return {
      ok: false,
      reason: 'nothing_to_format',
      message: 'Nothing to format — the input looks empty or is not screenplay-like text.',
      contract_version: CONTRACT_VERSION,
    };
  }
  const lang: ContentLanguage =
    input.content_language && input.content_language !== 'auto'
      ? input.content_language
      : detectLanguageFromBlocks(rows);
  const rules = blocksToLayoutRules(rows, { contentLang: lang });
  const pagination = pageStartsOf(rows, rules);

  // 可观察性：结构守卫 + 标签式场景头定向提示 + 歧义行诊断
  const guard = structureGuard(rows, normalized.text);
  const labeled = labeledHeaderDiagnostics(normalized.text);
  const { confidence: rawConfidence, warnings } = assessConfidence(normalized.text, rows);
  const confidence = guard.length > 0 ? Math.min(rawConfidence, 0.5) : rawConfidence;
  const diagnostics = [...guard, ...labeled.diagnostics, ...ambiguityDiagnostics(warnings, labeled.lines)];
  // 前置归一透明上报（info，不影响校验状态）
  const n = normalized.changes;
  if (n.cueSplits + n.pageArtifactsStripped + n.dialogueLinesWrapped > 0 || n.wallSentenceSplit) {
    diagnostics.push({
      code: 'SOURCE_NORMALIZED',
      severity: 'info',
      message:
        `Source normalized before parsing: ${n.cueSplits} character-extension cue(s) split, ` +
        `${n.pageArtifactsStripped} page-number artifact(s) removed, ${n.dialogueLinesWrapped} long dialogue line(s) wrapped, ` +
        `wall-of-text sentence split: ${n.wallSentenceSplit ? 'yes' : 'no'}.`,
      suggested_action:
        'Nothing to fix — this documents deterministic pre-parsing normalization (no semantic guessing).',
    });
  }
  const validationStatus: ValidationStatus = diagnostics.some((d) => d.severity === 'error')
    ? 'invalid'
    : diagnostics.length > 0
      ? 'needs_review'
      : 'ok';

  // 回显带 speaker（链式调用约定）：dialogue 回填其人物行的说话人，
  // 调用方把 blocks 原样传给其它工具时语义自洽。
  let lastSpeaker: string | undefined;
  const echoed: Prepared['echoed'] = rows.map((row) => {
    if (row.type === 'character') {
      lastSpeaker = row.text.trim();
    } else if (row.type !== 'dialogue' && row.type !== 'parenthetical') {
      lastSpeaker = undefined;
    }
    return row.type === 'dialogue' && lastSpeaker !== undefined
      ? { ...row, speaker: lastSpeaker }
      : row;
  });

  return {
    ok: true,
    renderBlocks: rows,
    echoed,
    diagnostics,
    hasErrors: false,
    validationStatus,
    confidence,
    warnings,
    chars: [...input.text].length,
    inputCount: rows.length,
    lang,
    plainText: toPlainText(rows, { contentLang: lang }),
    pages: pagination.pages,
    pageStarts: pagination.pageStarts,
  };
}

export function formatScreenplay(input: ToolInput, deps: ToolDeps): ToolSuccess | ToolFailure {
  const outputMode: OutputMode = input.output ?? 'pdf_and_blocks';

  const prepared = prepareInput(input, deps);
  if (!prepared.ok) return withUsageHint(prepared, FORMAT_USAGE_HINT);

  const requestSource =
    (input.input_format ?? 'text') === 'blocks' ? JSON.stringify(input.blocks) : (input.text as string);
  const requestHash = createHash('sha256')
    .update([requestSource, input.output ?? 'pdf_and_blocks', input.include ?? 'both', input.content_language ?? 'auto'].join('|'))
    .digest('hex');
  const requestId = input.request_id ?? requestHash.slice(0, 32);

  // ---- validate_only：只校验不渲染 ----
  if (outputMode === 'validate_only') {
    return {
      ok: true,
      contract_version: CONTRACT_VERSION,
      validation_status: prepared.validationStatus,
      diagnostics: prepared.diagnostics,
      blocks: prepared.echoed,
      next_step: nextStepFor(outputMode),
      request_id: requestId,
    };
  }

  // 结构化输入存在 error 级诊断 → 拒绝渲染，返回定位明确的诊断
  if (prepared.hasErrors) {
    return withUsageHint(
      {
        ok: false as const,
        reason: 'invalid_blocks' as const,
        message:
          'Structured input failed validation — fix the diagnostics and submit again (or use output="validate_only" to check without formatting).',
        contract_version: CONTRACT_VERSION,
        diagnostics: prepared.diagnostics,
        request_id: requestId,
      },
      FORMAT_USAGE_HINT,
    );
  }

  return applyInclude(
    {
      ok: true as const,
      contract_version: CONTRACT_VERSION,
      validation_status: prepared.validationStatus,
      diagnostics: prepared.diagnostics,
      blocks: prepared.echoed,
      plain_text: prepared.plainText,
      stats: {
        input_blocks: prepared.inputCount,
        render_elements: prepared.renderBlocks.length,
        scenes: prepared.renderBlocks.filter((b) => b.type === 'scene_heading').length,
        pages: prepared.pages,
        page_starts: prepared.pageStarts,
        chars: prepared.chars,
        content_language: prepared.lang,
      },
      confidence: prepared.confidence,
      warnings: prepared.warnings.length > 0 ? prepared.warnings : undefined,
      next_step: nextStepFor(outputMode),
      request_id: requestId,
    },
    input.include,
  );
}

/** 成功回执下一步引导（开源版：链式调用免费；PDF 指向 hosted 服务）。 */
function nextStepFor(outputMode: OutputMode): string {
  if (outputMode === 'validate_only') {
    return 'Fix any error diagnostics (or ask the user about ambiguous lines), then call again — or submit structured blocks (input_format="blocks") for exact control.';
  }
  if (outputMode === 'pdf_and_blocks') {
    return `This open-source build exports structured blocks and typeset text only. To keep working on this screenplay, pass the returned blocks (input_format="blocks") to analyze_screenplay, diagnose_scenes, or convert_fountain — all free and local. A print-ready PDF export is available from the hosted Narracore service at ${HOSTED_SERVICE_URL}.`;
  }
  return 'To keep working on this screenplay, pass the returned blocks (input_format="blocks") to analyze_screenplay, diagnose_scenes, or convert_fountain — all free and local.';
}

/** 面向 AI 的一段说明文本（content[0]；品牌 footer 仅进此通道，不污染排版正文）。 */
export function summarizeForAi(result: ToolSuccess): string {
  const parts: string[] = [];
  if (result.stats) {
    parts.push(
      `Formatted ${result.stats.input_blocks} input blocks (${result.stats.render_elements} render elements) / ${result.stats.scenes} scenes / ${result.stats.pages} page(s) (${result.stats.content_language}).`,
    );
  } else {
    parts.push(`Validation finished: ${result.validation_status}.`);
  }
  if (result.confidence !== undefined) parts.push(`Confidence ${result.confidence}.`);
  if (result.validation_status !== 'ok') {
    parts.push(
      `${result.diagnostics.length} diagnostic(s) — review them with the user before delivering.`,
    );
  }
  parts.push(`Next: ${result.next_step}`);
  return parts.join(' ');
}
