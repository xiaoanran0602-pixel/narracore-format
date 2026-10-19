// 机器可读诊断（0916 黑盒反馈采纳，PLAN §7.6）：
// 诊断带稳定 code / severity / 定位（行号或块 id）/ 修复建议；
// 语义：校验通过 ≠ 剧情理解正确，语义歧义用 REVISION_NOTE_PRESENT 等显式上报。

import type { ParsedRow } from '../format/parser';

export interface Diagnostic {
  code:
    | 'UNRESOLVED_STRUCTURE'
    | 'MISSING_SPEAKER'
    | 'UNBALANCED_DELIMITER'
    | 'REVISION_NOTE_PRESENT'
    | 'BRACKETED_ANNOTATION'
    | 'LABELED_HEADER_LINE'
    | 'EMPTY_TEXT'
    | 'AMBIGUOUS_ACTION_MAYBE_DIALOGUE'
    | 'DUPLICATE_BLOCK_ID'
    | 'SOURCE_NORMALIZED'
    | 'RENDER_OUTPUT_LOSS';
  severity: 'error' | 'warning' | 'info';
  /** 文本模式：1 起始行号 */
  line?: number;
  /** 结构化模式：调用方提交的块 id */
  block_id?: string;
  field?: string;
  message: string;
  suggested_action?: string;
}

export type ValidationStatus = 'ok' | 'needs_review' | 'invalid';

/**
 * 结构守卫（反馈 P0 + P7-9 长墙实测扩展）：长文本且 0 场景 0 角色 0 对白，
 * 或结构行占比 < 10% 且行数 > 20（无换行长墙句切后仅零星结构被恢复）→
 * 明显的结构线索未识别，不能以最高置信度静默降级为「整段动作」。
 * 阈值 10%/20 行按《不可控核聚变》真实剧本校准：正常识别时结构占比 57%。
 */
export function structureGuard(rows: ParsedRow[], text: string): Diagnostic[] {
  const isStructure = (r: ParsedRow) =>
    r.type === 'scene_heading' || r.type === 'character' || r.type === 'dialogue';
  const structureCount = rows.filter(isStructure).length;
  const chars = [...text].length;
  const noStructure = structureCount === 0 && (chars > 300 || rows.length <= 2);
  const sparseStructure = rows.length > 20 && structureCount / rows.length < 0.1;
  if (noStructure || sparseStructure) {
    return [
      {
        code: 'UNRESOLVED_STRUCTURE',
        severity: 'warning',
        message:
          'No scene headings, character cues, or dialogue were recognized (or almost none — most lines could not be resolved into screenplay structure). The text was formatted as continuous action, which is probably not the intended structure.',
        suggested_action:
          'Split the screenplay into one element per line (scene heading; CHARACTER name on its own; dialogue on the following lines), or submit typed blocks with input_format="blocks" so the server renders your structure as-is.',
      },
    ];
  }
  return [];
}

/** 文本模式歧义行（原 warnings）→ 诊断条目。labeledLines 中的行被定向提示取代。 */
export function ambiguityDiagnostics(
  warnings: string[],
  labeledLines?: Set<number>,
): Diagnostic[] {
  return warnings
    .map((message) => {
      const line = Number(message.match(/第 (\d+) 行/)?.[1] ?? 0);
      return { message, line };
    })
    .filter(({ line }) => line === 0 || !(labeledLines?.has(line) ?? false))
    .map(({ message, line }) => ({
      code: 'AMBIGUOUS_ACTION_MAYBE_DIALOGUE' as const,
      severity: 'warning' as const,
      ...(line > 0 ? { line } : {}),
      message,
      suggested_action:
        'Ask the user whether this line is dialogue; if so, correct the block and call again — or submit structured blocks.',
    }));
}

/** 标签式场景头（场次：/场景：/时间：/地点：/人物：…）——文本模式不解析，
 * 定向提示转结构化提交（0916 二轮反馈第 4 条），并返回行号定位。 */
const LABELED_HEADER_RE = /^(场次|场景|时间|地点|人物|内景|外景|景别|镜头号?)\s*[:：]/;

export function labeledHeaderDiagnostics(text: string): {
  diagnostics: Diagnostic[];
  lines: Set<number>;
} {
  const diagnostics: Diagnostic[] = [];
  const lines = new Set<number>();
  const raw = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i].trim();
    if (line.length > 0 && LABELED_HEADER_RE.test(line)) {
      lines.add(i + 1);
      diagnostics.push({
        code: 'LABELED_HEADER_LINE',
        severity: 'warning',
        line: i + 1,
        message: `Line ${i + 1} is a labeled header ("场次：/场景：…" style) — this convention is not auto-parsed in text mode.`,
        suggested_action:
          'Convert labeled headers into structured input: submit input_format="blocks" with scene_heading (location/time_of_day) and typed dialogue blocks with speaker.',
      });
    }
  }
  return { diagnostics, lines };
}
