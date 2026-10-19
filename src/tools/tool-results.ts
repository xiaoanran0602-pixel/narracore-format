// 结果契约与错误恢复（精简自私有仓 narracore-mcp §0.17 P14 版）：
// 开源包无计费，recovery 矩阵去掉购买类分支，保留输入形态与瞬态分支。
//
// outputSchema 口径（沿私有仓探针实测结论，SDK 1.30）：
// - 根对象 strict（additionalProperties:false）→ 必须穷举工具全部可达字段；
// - 嵌套对象一律 loose（容忍内部字段演进，只锁根级契约）。

import { z } from 'zod';

// ---------------------------------------------------------------- recovery

export const recoverySchema = z.object({
  /** 给 AI 的下一步动作（祈使句，一句话可执行） */
  action: z.string(),
  /** 是否值得重试（修复输入后 / 等待后） */
  retryable: z.boolean(),
  /** 建议等待毫秒数（仅限「等一会再试同一请求」的场合） */
  retry_after_ms: z.number().optional(),
  /** 重试时是否沿用原 request_id */
  keep_request_id: z.boolean(),
  /** 参数类错误的字段路径（diagnostics 有 block_id 时优先块级） */
  field_path: z.string().optional(),
  /** 需要人确认的边界提示 */
  note: z.string().optional(),
});

export type Recovery = z.infer<typeof recoverySchema>;

interface FailureLike {
  ok: false;
  reason?: string;
  diagnostics?: Array<{ block_id?: string; line?: number; code?: string }>;
}

/**
 * 恢复矩阵（开源版：无购买类分支）。
 */
export function recoveryFor(failure: FailureLike): Recovery {
  const reason = failure.reason ?? 'unknown';
  const firstBlock = failure.diagnostics?.find((d) => d.block_id !== undefined)?.block_id;
  switch (reason) {
    case 'missing_text':
      return {
        action: 'Provide the "text" field (or "blocks" with input_format="blocks") and call again.',
        retryable: true,
        keep_request_id: false,
        field_path: 'text',
      };
    case 'text_too_long':
      return {
        action: 'Split the screenplay into parts at scene boundaries and submit them one by one.',
        retryable: true,
        keep_request_id: false,
        field_path: 'text',
      };
    case 'nothing_to_format':
      return {
        action: 'The input is not screenplay-like text — ask the user for the actual screenplay.',
        retryable: true,
        keep_request_id: false,
      };
    case 'invalid_blocks':
      return {
        action: 'Fix the error diagnostics in the listed blocks and submit again (validate_only checks without formatting).',
        retryable: true,
        keep_request_id: false,
        field_path: firstBlock !== undefined ? `blocks[${firstBlock}]` : 'blocks',
      };
    case 'invalid_findings':
      return {
        action: 'Fix the findings (scene numbers and verbatim evidence from mode="material") and resubmit.',
        retryable: true,
        keep_request_id: false,
        field_path: 'findings',
      };
    case 'invalid_mode':
      return {
        action: 'Set mode to "material" (numbered scene material) or "score" (submit findings) and call again.',
        retryable: true,
        keep_request_id: false,
        field_path: 'mode',
      };
    case 'invalid_direction':
      return {
        action: 'Set direction to "to_fountain" (screenplay → Fountain) or "from_fountain" (Fountain → blocks) and call again.',
        retryable: true,
        keep_request_id: false,
        field_path: 'direction',
      };
    case 'no_scenes':
    case 'invalid_scenes':
      return {
        action: 'Use scene numbers as returned by the tool (1-based); default omits the field for all scenes.',
        retryable: true,
        keep_request_id: false,
        field_path: 'scenes',
      };
    case 'missing_fountain':
      return {
        action: 'Provide the "fountain" field for direction="from_fountain".',
        retryable: true,
        keep_request_id: false,
        field_path: 'fountain',
      };
    case 'diagnose_failed':
    case 'convert_failed':
    case 'analysis_failed':
      return {
        action: `Local computation failed (${reason}) — retry the same request after a moment; if it repeats, report it at ${'https://github.com/xiaoanran0602-pixel/narracore-format/issues'}.`,
        retryable: true,
        retry_after_ms: 1000,
        keep_request_id: true,
      };
    default:
      return {
        action: 'Unexpected failure — inspect the message; if it mentions missing user material, ask for it instead of guessing.',
        retryable: false,
        keep_request_id: false,
        note: 'If this repeats, report it with the request_id.',
      };
  }
}

/** 失败回执注入 recovery（保持既有 ok/reason/message/request_id 原样）。 */
export function withRecovery<T extends { ok: false; reason?: string }>(
  failure: T,
): T & { recovery: Recovery } {
  return { ...failure, recovery: recoveryFor(failure) };
}

// ------------------------------------------------------- 共享输出 schema 构件

const loose = z.looseObject.bind(z);

export const diagnosticOut = loose({
  code: z.string(),
  severity: z.string(),
  message: z.string(),
  line: z.number().optional(),
  block_id: z.string().optional(),
  suggested_action: z.string().optional(),
});

/** 失败分支公共字段（成功分支各工具自带，reason 仅失败出现——由契约测试锁）。 */
const failureOut = {
  reason: z.string().optional(),
  message: z.string().optional(),
  request_id: z.string().optional(),
  contract_version: z.string().optional(),
  diagnostics: z.array(diagnosticOut).optional(),
  recovery: recoverySchema.optional(),
};

const blockOut = loose({
  id: z.string().optional(),
  type: z.string(),
  text: z.string().optional(),
  speaker: z.string().optional(),
  delivery: z.string().optional(),
  scene_number: z.string().optional(),
  location: z.string().optional(),
  time_of_day: z.string().optional(),
});

const statsOut = loose({
  input_blocks: z.number(),
  render_elements: z.number(),
  scenes: z.number(),
  pages: z.number(),
  page_starts: z.array(z.number()),
  chars: z.number(),
  content_language: z.string(),
});

/** format_screenplay（成功+失败同根）。 */
export const formatOutputSchema = {
  ok: z.boolean(),
  ...failureOut,
  contract_version: z.string().optional(),
  validation_status: z.string().optional(),
  diagnostics: z.array(diagnosticOut).optional(),
  blocks: z.array(blockOut).optional(),
  plain_text: z.string().optional(),
  stats: statsOut.optional(),
  confidence: z.number().optional(),
  warnings: z.array(z.string()).optional(),
  next_step: z.string().optional(),
  request_id: z.string().optional(),
};

/** analyze_screenplay。 */
export const analyzeOutputSchema = {
  ok: z.boolean(),
  ...failureOut,
  tool: z.literal('analyze_screenplay').optional(),
  analyzer_version: z.string().optional(),
  validation_status: z.string().optional(),
  diagnostics: z.array(diagnosticOut).optional(),
  totals: z.unknown().optional(),
  scenes: z.array(z.unknown()).optional(),
  characters: z.array(z.unknown()).optional(),
  next_step: z.string().optional(),
  request_id: z.string().optional(),
};

/** diagnose_scenes（material 与 score 同根）。 */
export const diagnoseOutputSchema = {
  ok: z.boolean(),
  ...failureOut,
  tool: z.literal('diagnose_scenes').optional(),
  mode: z.string().optional(),
  versions: z.unknown().optional(),
  problem_types: z.array(z.unknown()).optional(),
  schema: z.unknown().optional(),
  scenes: z.array(z.unknown()).optional(),
  overall: z.unknown().optional(),
  next_step: z.string().optional(),
  request_id: z.string().optional(),
};

/** convert_fountain。 */
export const convertOutputSchema = {
  ok: z.boolean(),
  ...failureOut,
  tool: z.literal('convert_fountain').optional(),
  direction: z.string().optional(),
  fountain: z.string().optional(),
  blocks: z.array(blockOut).optional(),
  warnings: z.array(z.string()).optional(),
  stats: z.unknown().optional(),
  next_step: z.string().optional(),
  request_id: z.string().optional(),
};

/** about_narracore。 */
export const aboutOutputSchema = {
  ok: z.boolean(),
  ...failureOut,
  toolkit: z.array(z.unknown()).optional(),
  narracore: z.unknown().optional(),
  hosted: z.unknown().optional(),
  open_source: z.unknown().optional(),
};
