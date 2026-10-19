// convert_fountain 工具（开源版，自私有仓 narracore-mcp 适配；计费层剥离）：
// MCP 块 ↔ Fountain 双向转换。
// to_fountain：渲染块 → Fountain 文本（拉丁按惯例大写，CJK 原样）；
// from_fountain：Fountain 子集规则 → 类型化块（可直接喂 format_screenplay；
// 中文内容回落现有文本解析器并回填 speaker）。

import { createHash } from 'node:crypto';
import { prepareInput, withUsageHint, type ToolDeps } from './format-screenplay';
import { blocksToFountain, fountainToBlocks } from '../format/fountain';
import { normalizeBlocks, type BlockInput } from './blocks-input';
import { MANUAL_URL } from '../brand';

/**
 * direction 枚举正本：schema describe 与 handler 校验同源引用，不在两处手写。
 */
export const CONVERT_DIRECTIONS = ['to_fountain', 'from_fountain'] as const;
export type ConvertDirection = (typeof CONVERT_DIRECTIONS)[number];

export interface ConvertFountainInput {
  direction: ConvertDirection;
  input_format?: 'text' | 'blocks';
  text?: string;
  blocks?: BlockInput[];
  /** from_fountain：Fountain 源文本 */
  fountain?: string;
  request_id?: string;
}

export interface ConvertFountainSuccess {
  ok: true;
  tool: 'convert_fountain';
  direction: 'to_fountain' | 'from_fountain';
  fountain?: string;
  blocks?: BlockInput[];
  warnings: string[];
  stats: { input_blocks: number; output_blocks: number };
  next_step: string;
  request_id: string;
}

export type ConvertFountainFailure = {
  ok: false;
  reason:
    | 'missing_text'
    | 'text_too_long'
    | 'nothing_to_format'
    | 'invalid_blocks'
    | 'invalid_direction'
    | 'missing_fountain'
    | 'convert_failed';
  message: string;
  request_id?: string;
};

/** 本工具的引导句（英文正本）。 */
const CONVERT_USAGE_HINT = `For direction="to_fountain" send the screenplay as {"text": "..."} or "blocks"; for "from_fountain" send the Fountain text as {"fountain": "..."} — full manual: ${MANUAL_URL}`;

export function convertFountain(
  input: ConvertFountainInput,
  deps: ToolDeps,
): ConvertFountainSuccess | ConvertFountainFailure {
  // direction 形态校验（沿 §0.21 handler 内校验模式）：空参/非法值 → 结构化失败。
  const direction = input.direction;
  if (typeof direction !== 'string' || !CONVERT_DIRECTIONS.includes(direction)) {
    return withUsageHint(
      {
        ok: false as const,
        reason: 'invalid_direction' as const,
        message:
          'Field "direction" is required: "to_fountain" (screenplay → Fountain text) or "from_fountain" (Fountain text → typed blocks).',
      },
      CONVERT_USAGE_HINT,
    );
  }

  // ---- to_fountain：剧本（text/blocks）→ Fountain ----
  if (direction === 'to_fountain') {
    const prepared = prepareInput(input, deps);
    if (!prepared.ok) return withUsageHint(prepared as ConvertFountainFailure, CONVERT_USAGE_HINT);
    const requestSource =
      (input.input_format ?? 'text') === 'blocks' ? JSON.stringify(input.blocks) : (input.text as string);
    const requestHash = createHash('sha256').update(`convert-to|${requestSource}`).digest('hex');
    const requestId = input.request_id ?? requestHash.slice(0, 32);

    const fountain = blocksToFountain(prepared.renderBlocks);
    return {
      ok: true,
      tool: 'convert_fountain',
      direction: 'to_fountain',
      fountain,
      warnings: [],
      stats: { input_blocks: prepared.inputCount, output_blocks: prepared.renderBlocks.length },
      next_step:
        'Next: use this Fountain text in any Fountain-aware tool, or convert back with direction="from_fountain" to verify the roundtrip.',
      request_id: requestId,
    };
  }

  // ---- from_fountain：Fountain → 类型化块 ----
  if (input.fountain === undefined || input.fountain.trim().length === 0) {
    return withUsageHint(
      {
        ok: false as const,
        reason: 'missing_fountain' as const,
        message: 'direction="from_fountain" requires the "fountain" field (the Fountain source text).',
      },
      CONVERT_USAGE_HINT,
    );
  }
  if (Array.from(input.fountain).length > deps.maxTextChars) {
    return withUsageHint(
      {
        ok: false as const,
        reason: 'text_too_long' as const,
        message: `Fountain text exceeds the ${deps.maxTextChars}-character limit.`,
      },
      CONVERT_USAGE_HINT,
    );
  }

  const requestHash = createHash('sha256').update(`convert-from|${input.fountain}`).digest('hex');
  const requestId = input.request_id ?? requestHash.slice(0, 32);

  const parsed = fountainToBlocks(input.fountain);
  const normalizedBlocks = normalizeBlocks(parsed.blocks as BlockInput[]);
  if (normalizedBlocks.blocks.length === 0) {
    return withUsageHint(
      {
        ok: false as const,
        reason: 'nothing_to_format' as const,
        message: 'Nothing convertible found in the Fountain text.',
        request_id: requestId,
      },
      CONVERT_USAGE_HINT,
    );
  }

  return {
    ok: true,
    tool: 'convert_fountain',
    direction: 'from_fountain',
    blocks: parsed.blocks as BlockInput[],
    warnings: parsed.warnings,
    stats: { input_blocks: parsed.blocks.length, output_blocks: normalizedBlocks.blocks.length },
    next_step:
      'Next: pass the returned blocks to format_screenplay (input_format="blocks") for typeset text and stats, or to the analysis tools — all free and local.',
    request_id: requestId,
  };
}

/** 面向 AI 的一段说明文本（content[0]）。 */
export function summarizeConvertForAi(result: ConvertFountainSuccess): string {
  const directionText =
    result.direction === 'to_fountain'
      ? `Exported ${result.stats.input_blocks} block(s) to Fountain text (${result.fountain?.length ?? 0} chars).`
      : `Imported Fountain text into ${result.stats.input_blocks} typed block(s) — pass them to format_screenplay (input_format="blocks") to format.`;
  const parts = [directionText];
  if (result.warnings.length > 0) parts.push(`Warnings: ${result.warnings.join(' ')}`);
  parts.push(result.next_step);
  return parts.join(' ');
}
