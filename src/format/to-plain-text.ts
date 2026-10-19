// blocks → 缩进纯文本（策划 §8.1）——不参与 PDF，只给 AI 直接展示与用户
// 粘贴回 narracore.cn 继续编辑。
//
// 对齐策略（近似网站视觉，等宽字体下可读）：
// - 缩进：indentChars 按语言轨折算为空格列（中文轨 1 字格 = 2 列、英文轨
//   = 1 列），四舍五入到整数列
// - 右对齐（transition）/居中（shot）：按「显示列宽」（CJK 2 列 / 其余
//   1 列）补 ASCII 空格对齐到 charsPerLine 总宽
// - 块间空行：按 resolveBlockSpacing 的邻接结果（与 paginateBlocks 同源）
// - 括注补回（）包裹（括号不进文档模型，展示层自供——与网站一致）

import type { ParsedRow } from './parser';
import {
  blocksToLayoutRules,
  isFullWidthGridCharacter,
  resolveBlockSpacing,
  splitIntoLines,
  type ContentLanguage,
} from './layout-rules';

export function toPlainText(
  rows: ParsedRow[],
  options: { contentLang?: ContentLanguage } = {},
): string {
  const blocks = rows;
  const rules = blocksToLayoutRules(blocks, options);
  const out: string[] = [];

  const displayColumns = (s: string): number =>
    [...s].reduce((width, char) => width + (isFullWidthGridCharacter(char) ? 2 : 1), 0);

  const targetColumns = rules.charsPerLine * (rules.lang === 'zh' ? 2 : 1);

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    const prevType = i > 0 ? blocks[i - 1].type : null;
    const nextType = i < blocks.length - 1 ? blocks[i + 1].type : null;
    const spacing = resolveBlockSpacing(rules, block.type, prevType, nextType);
    const layout = rules.blocks[block.type];

    for (let m = 0; m < spacing.marginTopLines; m += 1) out.push('');

    for (const line of splitIntoLines(block.text, block.type, rules)) {
      let text = layout.uppercase ? line.toUpperCase() : line;
      // 括注补回包裹括号（括号不进文档模型，展示层自供——与网站一致）；
      // 包裹符号随语言轨：中文轨全角（）、英文轨半角（剧本惯例）
      if (block.type === 'parenthetical') {
        text = rules.lang === 'zh' ? `（${text}）` : `(${text})`;
      }
      if (layout.alignRight) {
        out.push(' '.repeat(Math.max(0, targetColumns - displayColumns(text))) + text);
      } else if (layout.centered) {
        const pad = Math.max(0, targetColumns - displayColumns(text));
        out.push(' '.repeat(Math.floor(pad / 2)) + text);
      } else {
        const indentColumns = Math.round(
          layout.indentChars * (rules.lang === 'zh' ? 2 : 1),
        );
        out.push(' '.repeat(indentColumns) + text);
      }
    }

    for (let m = 0; m < spacing.marginBottomLines; m += 1) out.push('');
  }

  return out.join('\n');
}
