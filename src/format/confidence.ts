// 解析置信度（策划 §7.4）——应对规则版解析器 0.81 吻合率的产品化处理，
// 不引入任何服务端模型。
//
// 歧义行定义：被兜底归入 action、长度 ≤ DIALOGUE_MAX_CHARS(30)、且无句末
// 标点的行——正是主仓库 TASK-0093 实测的对白误判来源。两处常量与
// parser.ts 内部常量语义一致；parser.ts 按纪律原样复制（不增导出），
// 故此处自持副本并在主仓库同步时一并核对。

import type { ParsedRow } from './parser';

const DIALOGUE_MAX_CHARS = 30;
const SENTENCE_END_RE = /[。！？…；：”」』]$/;
const MAX_WARNINGS = 10;

export interface ConfidenceReport {
  /** 0–1：1 − 歧义行数 / 总非空行数 */
  confidence: number;
  /** 歧义行提示（原文行号 + 文本），最多前 10 条，AI 可直接向用户复述 */
  warnings: string[];
}

/** 按原始文本的行号统计歧义行（rows 与非空输入行一一对应，按序对齐）。 */
export function assessConfidence(text: string, rows: ParsedRow[]): ConfidenceReport {
  const lines = text.split(/\r\n|\r|\n/);
  const warnings: string[] = [];
  let ambiguous = 0;
  let rowIndex = 0;

  for (let i = 0; i < lines.length && rowIndex < rows.length; i += 1) {
    if (lines[i].trim().length === 0) continue;
    const row = rows[rowIndex];
    rowIndex += 1;
    if (
      row.type === 'action' &&
      row.text.length <= DIALOGUE_MAX_CHARS &&
      !SENTENCE_END_RE.test(row.text)
    ) {
      ambiguous += 1;
      if (warnings.length < MAX_WARNINGS) {
        warnings.push(`第 ${i + 1} 行「${row.text}」被判为动作，可能是对白`);
      }
    }
  }

  const total = rows.length;
  const confidence = total === 0 ? 1 : Number((1 - ambiguous / total).toFixed(4));
  return { confidence, warnings };
}
