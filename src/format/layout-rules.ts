// 剧本排版规则 —— 单一事实源（TASK-0040 CP-1）
//
// 本模块是「编辑态排版、打印预览、PDF 导出」三者共用的唯一排版规则来源。
// 任何第二份排版实现都是审查 FAIL 项（见任务卡红线）。
//
// 核心设计：固定字符网格（打字机排版）
// - 每个字占死一个格子 → 每页字数固定 → 页数可估片长（1 页 ≈ 1 分钟成片）
// - 中文 33 字/行 × 38 行/页，英文 61 字符/行 × 55 行/页
// - 参照 injuben 与美剧电影工业标准（ADR-0034 §五）
//
// 字格形状是两轨的真正差异（不是 2:1 等比放大）：
// - 中文 12/12 = 1.00 正方形字格
// - 英文 7.2/12 = 0.60 扁长字格（与 Courier Prime 实测 advance/em = 0.5996 吻合）

import type { DocumentBlock } from './types';

// ---------------------------------------------------------------------------
// 常量：一手源码数值（Screenplain / injuben 源码常量 + 主会话换算）
// ---------------------------------------------------------------------------

/** 字格宽度（pt） */
export const CHAR_WIDTH_PT = {
  zh: 12, // 1/6 in = 12pt
  en: 7.2, // 1/10 in = 7.2pt
} as const;

/** 字号（pt） */
export const FONT_SIZE_PT = {
  zh: 12,
  en: 12,
} as const;

/** 正文栈按作品语言选择；编辑态与打印态必须使用同一栈。
 * 这些是系统/自托管字体候选，不引入运行时网络下载依赖。 */
// TASK-0066 CP-1：中文轨换 Sarasa Mono SC（等距更纱黑体），经 next/font/local
// 自托管，CSS 变量 --font-script 由 [locale]/layout.tsx 注入。
//
// 换掉 Noto Serif SC 的原因（实测，非推测）：该字体名从未被任何 next/font 或
// @font-face 加载过——layout.tsx 只加载 Inter 与 Literata。声明它等于声明了一个
// 不存在的字体，浏览器直接 fallback 到系统 Songti/SimSun。所有者看到的「不优雅、
// 不像打字机」正是系统宋体，不是这里写的字体。
//
// Sarasa Mono SC 实测汉字/拉丁 advance = 1000/500 = 精确 2.0（详见 layout.tsx
// 注释与任务卡证据）。固定字符网格（CHARS_PER_LINE = 33 汉字/行）要求汉字占死
// 一格、西文半格，只有真 2:1 等宽字体能让屏幕折行与打印分页逐字一致。
//
// 只写 var(--font-script)，不在后面再拼一串 fallback。
// 实测踩过的坑（webkit E2E "full-width advances drift"）：--font-script 由
// next/font/local 生成，其值本身已是「族名 + <族名> Fallback + 我们配的 fallback」
// 的完整链。若在这里再追加 'Sarasa Mono SC', 'Noto Sans Mono CJK SC', monospace，
// 最终 font-family 变成两层 fallback 叠加的长链——webkit 与 chromium 对该链的
// 选字结果不一致，同一行汉字被分配到不同字体，全角步进分裂成 16px/17px 两组
// （chromium drift 0.000，webkit drift 1.000，超出 0.25 容差）。
// 兜底责任交给 next/font 的 fallback 配置（见 [locale]/layout.tsx），
// 单一来源，两个引擎解析一致。
export const CJK_FONT_FAMILY = 'var(--font-script)';
export const LATIN_MONO_FONT_FAMILY =
  "'Courier Prime', 'Courier New', Courier, monospace";

export const FONT_FAMILY = {
  zh: CJK_FONT_FAMILY,
  en: LATIN_MONO_FONT_FAMILY,
} as const;

/** 行高（pt） */
export const LINE_HEIGHT_PT = {
  zh: 18, // 1.5 倍
  en: 12, // 单倍
} as const;

/** 每行字符数 */
export const CHARS_PER_LINE = {
  zh: 33,
  en: 61,
} as const;

/** 每页行数 */
export const LINES_PER_PAGE = {
  zh: 38,
  en: 55,
} as const;

/** 页面尺寸（in） */
export const PAGE_SIZE_IN = {
  zh: { width: 5.5, height: 9.5 }, // 文本框
  en: { width: 6.1, height: 9.17 }, // 文本框
} as const;

/** 页边距（in） */
export const PAGE_MARGIN_IN = {
  zh: { left: 1.5, top: 1.0, right: 1.5, bottom: 0.5 },
  en: { left: 1.5, top: 1.0, right: 0.9, bottom: 0.83 },
} as const;

/** 各元素左缩进（字符数，距文本框左缘） */
export const INDENT_CHARS = {
  scene_heading: { zh: 0, en: 0 },
  action: { zh: 0, en: 0 },
  dialogue: { zh: 5, en: 9 },
  parenthetical: { zh: 9.8, en: 13 },
  character: { zh: 11.5, en: 19 },
  transition: { zh: 0, en: 0 }, // 右对齐，无左缩进
  note: { zh: 0, en: 0 },
  shot: { zh: 0, en: 0 },
} as const;

/** 对白列宽（含缩进，字符数） */
export const DIALOGUE_WIDTH_CHARS = {
  zh: 21 + 5, // 21 字 + 5 缩进 = 26
  en: 36 + 9, // 36 字符 + 9 缩进 = 45
} as const;

/** 动作列宽（字符数） */
export const ACTION_WIDTH_CHARS = {
  zh: 33,
  en: 61,
} as const;

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export type ContentLanguage = 'zh' | 'en';

export interface LayoutRulesOptions {
  /** 作品语言（内容语言），由调用方提供；未提供时由内容探测 */
  contentLang?: ContentLanguage;
}

export interface BlockLayout {
  /** 块类型 */
  type: DocumentBlock['type'];
  /** 左缩进（字符数） */
  indentChars: number;
  /** 左缩进（pt） */
  indentPt: number;
  /** 左缩进（in） */
  indentIn: number;
  /** 是否右对齐 */
  alignRight: boolean;
  /** 是否大写 */
  uppercase: boolean;
  /** 是否小字（括注/备注） */
  smallText: boolean;
  /** 是否居中 */
  centered: boolean;
  /** 字距（CSS 值；由规则输出，避免编辑/打印各自硬编码） */
  letterSpacing: string;
  /** 全角字符相对其字体天然步进所需的字距修正（pt） */
  fullWidthLetterSpacingPt: number;
  /** 半角字符相对 Courier 0.6em 天然步进所需的字距修正（pt） */
  halfWidthLetterSpacingPt: number;
  /** 每行字符数（该块类型实际可用） */
  charsPerLine: number;
  /** 列宽（字符数，含缩进） */
  widthChars: number;
  /** 字号（pt） */
  fontSizePt: number;
  /** 行高（pt） */
  lineHeightPt: number;
  /** 字格宽（pt） */
  charWidthPt: number;
  /** 上边距（行数，块间间距） */
  marginTopLines: number;
  /** 下边距（行数） */
  marginBottomLines: number;
}

export interface LayoutRules {
  /** 语言轨 */
  lang: ContentLanguage;
  /** 正文字体族（按作品语言；编辑态与打印态共用） */
  fontFamily: string;
  /** 全角字符字体栈 */
  fullWidthFontFamily: string;
  /** 半角字符等宽字体栈 */
  halfWidthFontFamily: string;
  /** 字格宽（pt） */
  charWidthPt: number;
  /** 字号（pt） */
  fontSizePt: number;
  /** 行高（pt） */
  lineHeightPt: number;
  /** 每行字符数（基准：动作/场景标题） */
  charsPerLine: number;
  /** 每页行数 */
  linesPerPage: number;
  /** 页面尺寸（in） */
  pageSizeIn: { width: number; height: number };
  /** 页边距（in） */
  pageMarginIn: { left: number; top: number; right: number; bottom: number };
  /** 各块类型版式 */
  blocks: Record<DocumentBlock['type'], BlockLayout>;
}

// ---------------------------------------------------------------------------
// 语言探测
// ---------------------------------------------------------------------------

/**
 * 探测文本的主要内容语言
 * 判据：CJK 码点占比 ≥ 0.3 → 中文，否则 → 英文
 * （阈值 0.3 由执行者定案：纯英文 0%，纯中文 100%，混排剧本通常 > 50%）
 */
export function detectContentLanguage(text: string): ContentLanguage {
  if (!text || text.trim().length === 0) return 'zh'; // 空文本默认中文轨

  // 分母保留空格与标点，但按 Unicode code point 计数，避免生僻汉字的
  // surrogate pair 被误算为两个字符。
  const characters = [...text];
  const cjkCount = characters.filter(isFullWidthGridCharacter).length;
  const totalChars = characters.length;

  if (totalChars === 0) return 'zh';
  const ratio = cjkCount / totalChars;
  return ratio >= 0.3 ? 'zh' : 'en';
}

/**
 * 固定网格中的全角字符。除汉字/假名/韩文外，中国标点与全角形式也必须
 * 占一整格；其余字符走半角等宽轨。
 */
export function isFullWidthGridCharacter(char: string): boolean {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return false;

  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) || // Hangul Jamo
    (codePoint >= 0x2e80 && codePoint <= 0x303f) || // CJK radicals / punctuation
    (codePoint >= 0x3040 && codePoint <= 0x30ff) || // Hiragana / Katakana
    (codePoint >= 0x3130 && codePoint <= 0x318f) || // Hangul compatibility Jamo
    (codePoint >= 0x31c0 && codePoint <= 0x31ff) || // CJK strokes / Katakana extensions
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // CJK extension A
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK unified ideographs
    (codePoint >= 0xa960 && codePoint <= 0xa97f) || // Hangul Jamo extension A
    (codePoint >= 0xac00 && codePoint <= 0xd7ff) || // Hangul syllables / extension B
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // CJK compatibility ideographs
    (codePoint >= 0xff01 && codePoint <= 0xff60) || // Fullwidth forms
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x20000 && codePoint <= 0x2fa1f) || // CJK extensions B-F
    (codePoint >= 0x30000 && codePoint <= 0x323af) // CJK extensions G-H
  );
}

export interface GridTextRun {
  kind: 'full' | 'half';
  text: string;
}

/** 将一行合并为连续的全角/半角 run，避免为长稿的每个字符创建 DOM 节点。 */
export function splitIntoGridRuns(text: string): GridTextRun[] {
  const runs: GridTextRun[] = [];
  for (const char of text) {
    const kind = isFullWidthGridCharacter(char) ? 'full' : 'half';
    const previous = runs.at(-1);
    if (previous?.kind === kind) {
      previous.text += char;
    } else {
      runs.push({ kind, text: char });
    }
  }
  return runs;
}

/**
 * 从块数组探测内容语言
 */
export function detectLanguageFromBlocks(blocks: DocumentBlock[]): ContentLanguage {
  const allText = blocks.map((b) => b.text).join('\n');
  return detectContentLanguage(allText);
}

// ---------------------------------------------------------------------------
// 核心：blocksToLayoutRules —— 唯一排版规则入口
// ---------------------------------------------------------------------------

/**
 * 生成排版规则（单一事实源）
 *
 * @param blocks 剧本块数组（用于语言探测，如果未显式指定 contentLang）
 * @param options 选项：contentLang 显式指定作品语言
 * @returns 完整排版规则
 */
export function blocksToLayoutRules(
  blocks: DocumentBlock[],
  options: LayoutRulesOptions = {},
): LayoutRules {
  const lang = options.contentLang ?? detectLanguageFromBlocks(blocks);

  const charWidthPt = CHAR_WIDTH_PT[lang];
  const fontSizePt = FONT_SIZE_PT[lang];
  const fontFamily = FONT_FAMILY[lang];
  const lineHeightPt = LINE_HEIGHT_PT[lang];
  const charsPerLine = CHARS_PER_LINE[lang];
  const linesPerPage = LINES_PER_PAGE[lang];
  const pageSizeIn = PAGE_SIZE_IN[lang];
  const pageMarginIn = PAGE_MARGIN_IN[lang];

  const withGridTypography = (
    block: Omit<
      BlockLayout,
      'fullWidthLetterSpacingPt' | 'halfWidthLetterSpacingPt'
    >,
  ): BlockLayout => {
    const renderedFontSizePt = block.smallText
      ? block.fontSizePt * 0.875
      : block.fontSizePt;
    const fullWidthAdvancePt = charWidthPt * (lang === 'zh' ? 1 : 2);
    const halfWidthAdvancePt = charWidthPt * (lang === 'zh' ? 0.5 : 1);

    return {
      ...block,
      // CJK glyphs naturally advance 1em; Courier-family glyphs advance 0.6em.
      // The correction is emitted as a rule value so CSS never owns a second
      // copy of the grid arithmetic.
      fullWidthLetterSpacingPt: Number(
        (fullWidthAdvancePt - renderedFontSizePt).toFixed(6),
      ),
      halfWidthLetterSpacingPt: Number(
        (halfWidthAdvancePt - renderedFontSizePt * 0.6).toFixed(6),
      ),
    };
  };

  // 构建各块类型版式
  const blockLayouts: Record<DocumentBlock['type'], BlockLayout> = {
    scene_heading: withGridTypography({
      type: 'scene_heading',
      indentChars: INDENT_CHARS.scene_heading[lang],
      indentPt: INDENT_CHARS.scene_heading[lang] * charWidthPt,
      indentIn: (INDENT_CHARS.scene_heading[lang] * charWidthPt) / 72,
      alignRight: false,
      uppercase: true,
      smallText: false,
      centered: false,
      letterSpacing: 'normal',
      charsPerLine: ACTION_WIDTH_CHARS[lang],
      widthChars: ACTION_WIDTH_CHARS[lang],
      fontSizePt,
      lineHeightPt,
      charWidthPt,
      marginTopLines: 2, // 场景标题前空两行
      marginBottomLines: 1,
    }),
    action: withGridTypography({
      type: 'action',
      indentChars: INDENT_CHARS.action[lang],
      indentPt: INDENT_CHARS.action[lang] * charWidthPt,
      indentIn: (INDENT_CHARS.action[lang] * charWidthPt) / 72,
      alignRight: false,
      uppercase: false,
      smallText: false,
      centered: false,
      letterSpacing: 'normal',
      charsPerLine: ACTION_WIDTH_CHARS[lang],
      widthChars: ACTION_WIDTH_CHARS[lang],
      fontSizePt,
      lineHeightPt,
      charWidthPt,
      marginTopLines: 1,
      marginBottomLines: 1,
    }),
    character: withGridTypography({
      type: 'character',
      indentChars: INDENT_CHARS.character[lang],
      indentPt: INDENT_CHARS.character[lang] * charWidthPt,
      indentIn: (INDENT_CHARS.character[lang] * charWidthPt) / 72,
      alignRight: false,
      uppercase: true,
      smallText: false,
      centered: false, // 左缩进 11.5 字，不是居中
      letterSpacing: 'normal',
      charsPerLine: ACTION_WIDTH_CHARS[lang] - INDENT_CHARS.character[lang],
      widthChars: ACTION_WIDTH_CHARS[lang],
      fontSizePt,
      lineHeightPt,
      charWidthPt,
      marginTopLines: 1,
      marginBottomLines: 0, // 角色名后紧接对白，无空行
    }),
    parenthetical: withGridTypography({
      type: 'parenthetical',
      indentChars: INDENT_CHARS.parenthetical[lang],
      indentPt: INDENT_CHARS.parenthetical[lang] * charWidthPt,
      indentIn: (INDENT_CHARS.parenthetical[lang] * charWidthPt) / 72,
      alignRight: false,
      uppercase: false,
      smallText: true,
      centered: false,
      letterSpacing: 'normal',
      charsPerLine: ACTION_WIDTH_CHARS[lang] - INDENT_CHARS.parenthetical[lang],
      widthChars: ACTION_WIDTH_CHARS[lang],
      fontSizePt,
      lineHeightPt,
      charWidthPt,
      marginTopLines: 0,
      marginBottomLines: 0,
    }),
    dialogue: withGridTypography({
      type: 'dialogue',
      indentChars: INDENT_CHARS.dialogue[lang],
      indentPt: INDENT_CHARS.dialogue[lang] * charWidthPt,
      indentIn: (INDENT_CHARS.dialogue[lang] * charWidthPt) / 72,
      alignRight: false,
      uppercase: false,
      smallText: false,
      centered: false,
      letterSpacing: 'normal',
      // DIALOGUE_WIDTH_CHARS includes the left indent.  Only the content
      // column is available for text wrapping.
      charsPerLine: DIALOGUE_WIDTH_CHARS[lang] - INDENT_CHARS.dialogue[lang],
      widthChars: DIALOGUE_WIDTH_CHARS[lang],
      fontSizePt,
      lineHeightPt,
      charWidthPt,
      marginTopLines: 0,
      marginBottomLines: 1, // 对白后空一行
    }),
    transition: withGridTypography({
      type: 'transition',
      indentChars: 0,
      indentPt: 0,
      indentIn: 0,
      alignRight: true, // 转场右对齐
      uppercase: true,
      smallText: false,
      centered: false,
      letterSpacing: 'normal',
      charsPerLine: ACTION_WIDTH_CHARS[lang],
      widthChars: ACTION_WIDTH_CHARS[lang],
      fontSizePt,
      lineHeightPt,
      charWidthPt,
      marginTopLines: 1,
      marginBottomLines: 2, // 转场后空两行
    }),
    shot: withGridTypography({
      // TASK-0053 CP-2 专属排版：镜头/特殊指示——居中 + 大写（好莱坞 SHOT
      // 惯例：独立成行的拍摄指示，区别于右对齐的 transition 与左对齐动作）。
      type: 'shot',
      indentChars: INDENT_CHARS.shot[lang],
      indentPt: INDENT_CHARS.shot[lang] * charWidthPt,
      indentIn: (INDENT_CHARS.shot[lang] * charWidthPt) / 72,
      alignRight: false,
      uppercase: true,
      smallText: false,
      centered: true,
      letterSpacing: 'normal',
      charsPerLine: ACTION_WIDTH_CHARS[lang],
      widthChars: ACTION_WIDTH_CHARS[lang],
      fontSizePt,
      lineHeightPt,
      charWidthPt,
      marginTopLines: 1,
      marginBottomLines: 1,
    }),
    note: withGridTypography({
      type: 'note',
      indentChars: INDENT_CHARS.note[lang],
      indentPt: INDENT_CHARS.note[lang] * charWidthPt,
      indentIn: (INDENT_CHARS.note[lang] * charWidthPt) / 72,
      alignRight: false,
      uppercase: false,
      smallText: true,
      centered: false,
      letterSpacing: 'normal',
      charsPerLine: ACTION_WIDTH_CHARS[lang],
      widthChars: ACTION_WIDTH_CHARS[lang],
      fontSizePt,
      lineHeightPt,
      charWidthPt,
      marginTopLines: 1,
      marginBottomLines: 1,
    }),
  };

  return {
    lang,
    fontFamily,
    fullWidthFontFamily: CJK_FONT_FAMILY,
    halfWidthFontFamily: LATIN_MONO_FONT_FAMILY,
    charWidthPt,
    fontSizePt,
    lineHeightPt,
    charsPerLine,
    linesPerPage,
    pageSizeIn,
    pageMarginIn,
    blocks: blockLayouts,
  };
}

/**
 * 将排版规则翻译为 CSS 自定义属性。
 * 这是纯展示层适配，不包含任何独立版式常量；编辑态与预览态都必须
 * 由同一份 LayoutRules 经过此函数注入，避免再次维护一套排版数字。
 */
export function layoutRulesToCssVariables(
  rules: LayoutRules,
): Record<string, string> {
  const cssNumber = (value: number): string => String(Number(value.toFixed(6)));
  const variables: Record<string, string> = {
    '--layout-font-family': rules.fontFamily,
    '--layout-full-width-font-family': rules.fullWidthFontFamily,
    '--layout-half-width-font-family': rules.halfWidthFontFamily,
    '--layout-char-width': `${rules.charWidthPt}pt`,
    '--layout-font-size': `${rules.fontSizePt}pt`,
    '--layout-line-height': `${rules.lineHeightPt}pt`,
    '--layout-page-width': `${rules.pageSizeIn.width}in`,
    '--layout-page-height': `${rules.pageSizeIn.height}in`,
    '--layout-paper-width': `${
      rules.pageSizeIn.width + rules.pageMarginIn.left + rules.pageMarginIn.right
    }in`,
    '--layout-paper-height': `${
      rules.pageSizeIn.height + rules.pageMarginIn.top + rules.pageMarginIn.bottom
    }in`,
    '--layout-margin-left': `${rules.pageMarginIn.left}in`,
    '--layout-margin-top': `${rules.pageMarginIn.top}in`,
    '--layout-margin-right': `${rules.pageMarginIn.right}in`,
    '--layout-margin-bottom': `${rules.pageMarginIn.bottom}in`,
    // 兼容预览样式现有变量名；值仍由 LayoutRules 唯一决定。
    '--char-width': `${rules.charWidthPt}pt`,
    '--font-size': `${rules.fontSizePt}pt`,
    '--line-height': `${rules.lineHeightPt}pt`,
    '--page-width': `${rules.pageSizeIn.width}in`,
    '--page-height': `${rules.pageSizeIn.height}in`,
    '--paper-width': `${
      rules.pageSizeIn.width + rules.pageMarginIn.left + rules.pageMarginIn.right
    }in`,
    '--paper-height': `${
      rules.pageSizeIn.height + rules.pageMarginIn.top + rules.pageMarginIn.bottom
    }in`,
    '--margin-left': `${rules.pageMarginIn.left}in`,
    '--margin-top': `${rules.pageMarginIn.top}in`,
    '--margin-right': `${rules.pageMarginIn.right}in`,
    '--margin-bottom': `${rules.pageMarginIn.bottom}in`,
  };

  for (const [type, block] of Object.entries(rules.blocks)) {
    const prefix = `--layout-${type}`;
    variables[`${prefix}-indent`] = `${cssNumber(block.indentIn)}in`;
    variables[`${prefix}-margin-top`] = `${cssNumber(block.marginTopLines * rules.lineHeightPt)}pt`;
    variables[`${prefix}-margin-bottom`] = `${cssNumber(block.marginBottomLines * rules.lineHeightPt)}pt`;
    variables[`${prefix}-font-size`] = `${
      cssNumber(block.smallText ? block.fontSizePt * 0.875 : block.fontSizePt)
    }pt`;
    variables[`${prefix}-line-height`] = `${cssNumber(block.lineHeightPt)}pt`;
    variables[`${prefix}-text-align`] = block.alignRight
      ? 'right'
      : block.centered
        ? 'center'
        : 'left';
    variables[`${prefix}-text-transform`] = block.uppercase ? 'uppercase' : 'none';
    variables[`${prefix}-letter-spacing`] = block.letterSpacing;
    variables[`${prefix}-full-width-letter-spacing`] = `${
      cssNumber(block.fullWidthLetterSpacingPt)
    }pt`;
    variables[`${prefix}-half-width-letter-spacing`] = `${
      cssNumber(block.halfWidthLetterSpacingPt)
    }pt`;
    variables[`${prefix}-width`] = `${cssNumber(block.widthChars * rules.charWidthPt)}pt`;
    variables[`${prefix}-content-width`] = `${cssNumber(block.charsPerLine * rules.charWidthPt)}pt`;
  }

  return variables;
}

// ---------------------------------------------------------------------------
// 辅助：分行计算（AC-5）
// ---------------------------------------------------------------------------

/**
 * 按固定字格分行
 * 给定文本和块类型，返回每行的内容（换行由字格决定，非容器宽度）
 *
 * @param text 原始文本
 * @param blockType 块类型
 * @param rules 排版规则
 * @returns 分行后的字符串数组
 */
export function splitIntoLines(
  text: string,
  blockType: DocumentBlock['type'],
  rules: LayoutRules,
): string[] {
  const block = rules.blocks[blockType];
  const maxChars = block.charsPerLine;

  if (!text || text.length === 0) return [''];

  // 中英混排处理：字符格宽度随作品语言轨确定。
  // 中文轨沿用中文排版：CJK 1 格、西文半格；英文轨沿用英文排版：
  // 西文 1 格、CJK 2 格。这样每个轨道的每行容量（33/61）不会被
  // 另一种字符的折算方式悄悄放大或缩小。
  const lines: string[] = [];
  let currentLine = '';
  let currentWidth = 0;

  for (const char of text) {
    // 判断字符类型：CJK 全角与西文半角按内容语言轨折算。
    if (char === '\r') continue;
    if (char === '\n') {
      lines.push(currentLine);
      currentLine = '';
      currentWidth = 0;
      continue;
    }

    const isFullWidth = isFullWidthGridCharacter(char);
    const charWidth =
      rules.lang === 'zh' ? (isFullWidth ? 1 : 0.5) : isFullWidth ? 2 : 1;

    if (currentWidth + charWidth > maxChars) {
      // 当前行已满，换行
      lines.push(currentLine);
      currentLine = char;
      currentWidth = charWidth;
    } else {
      currentLine += char;
      currentWidth += charWidth;
    }
  }

  // TASK-0067 F-0067-01：即使文本以显式换行结尾，也要保留最后的空行。
  // `a\n` 在编辑器与持久化层代表两行；若这里只在非空时 push，打印预览
  // 与分页会静默少算一行。非换行结尾时 currentLine 本来就包含末行。
  lines.push(currentLine);

  return lines;
}

/**
 * 计算块占用的行数（含上下边距）
 */
export function calculateBlockLines(
  text: string,
  blockType: DocumentBlock['type'],
  rules: LayoutRules,
): number {
  const contentLines = splitIntoLines(text, blockType, rules).length;
  const block = rules.blocks[blockType];
  return contentLines + block.marginTopLines + block.marginBottomLines;
}

/**
 * 邻接感知的块间距解析结果（TASK-0072 CP-1）。
 */
export interface BlockSpacing {
  /** 上边距（行数） */
  marginTopLines: number;
  /** 下边距（行数） */
  marginBottomLines: number;
}

/**
 * 邻接感知的块间距解析——唯一事实源（TASK-0072 CP-1）。
 *
 * 背景（TASK-0066 独立审查 F-003）：括注成组（角色—括注—对白视觉上是一组）
 * 曾经只在 editor-theme.css 用相邻兄弟选择器（`.sb-parenthetical + .sb-character`
 * 等）清零编辑态的接缝，打印预览的 paginateBlocks 仍读块自身的
 * marginTopLines/marginBottomLines——同一份文档编辑态接缝 0px、打印态 24px，
 * 是 layout-rules.ts 自述"唯一排版规则来源"要消灭的双源。
 *
 * 本函数是编辑态装饰（block-spacing-decoration.ts）与 paginateBlocks 唯二调用
 * 入口；两者都不得各自重算相邻兄弟关系。
 *
 * 规则（只清零"与括注相邻"的那一侧，不影响块在其它位置的间距，也不改
 * layout-rules 各块类型的通用 marginTopLines/marginBottomLines 常量）：
 * - prevType === 'parenthetical' → 本块 marginTopLines = 0（紧跟括注之后）
 * - nextType === 'parenthetical' → 本块 marginBottomLines = 0（紧邻括注之前）
 * - 括注自身的 marginTopLines/marginBottomLines 恒为 0（layout-rules 既有值），
 *   不因相邻块类型而改变。
 */
export function resolveBlockSpacing(
  rules: LayoutRules,
  type: DocumentBlock['type'],
  prevType: DocumentBlock['type'] | null,
  nextType: DocumentBlock['type'] | null,
): BlockSpacing {
  const own = rules.blocks[type];
  return {
    marginTopLines: prevType === 'parenthetical' ? 0 : own.marginTopLines,
    marginBottomLines: nextType === 'parenthetical' ? 0 : own.marginBottomLines,
  };
}

/**
 * 计算总页数
 */
export function calculateTotalPages(
  blocks: DocumentBlock[],
  rules: LayoutRules,
): number {
  return paginateBlocks(blocks, rules).length;
}

/**
 * 预览渲染使用的分页片段。
 *
 * 一个超长块可以被切成多个片段，但每个片段仍保留原块类型；这样分页容量
 * 由 LayoutRules.linesPerPage 实际消费，而不是只在单测里计算一个孤立页数。
 */
export interface LayoutBlockFragment {
  block: DocumentBlock;
  lines: string[];
  marginTopLines: number;
  marginBottomLines: number;
  startsBlock: boolean;
  endsBlock: boolean;
}

export interface LayoutPage {
  fragments: LayoutBlockFragment[];
}

/**
 * 将块按固定页容量切成预览页。
 *
 * 场景标题是分页起点；块内正文过长时按已计算好的字格行切片，避免浏览器
 * 自己按字体宽度二次换行。块间距只在首/末片段消费，跨页不会重复计入。
 */
export function paginateBlocks(
  blocks: DocumentBlock[],
  rules: LayoutRules,
): LayoutPage[] {
  const pages: LayoutPage[] = [];
  let currentPage: LayoutPage = { fragments: [] };
  let remainingLines = rules.linesPerPage;

  const pushPage = () => {
    if (currentPage.fragments.length > 0) {
      pages.push(currentPage);
    }
    currentPage = { fragments: [] };
    remainingLines = rules.linesPerPage;
  };

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    const prevBlock = blockIndex > 0 ? blocks[blockIndex - 1] : null;
    const nextBlock = blockIndex < blocks.length - 1 ? blocks[blockIndex + 1] : null;
    // TASK-0072 CP-1：邻接感知间距——唯一解析入口，编辑态装饰
    // （block-spacing-decoration.ts）必须消费同一函数，不得各自重算。
    const spacing = resolveBlockSpacing(
      rules,
      block.type,
      prevBlock?.type ?? null,
      nextBlock?.type ?? null,
    );
    const lines = splitIntoLines(block.text, block.type, rules);

    // 场景分页（TASK-0057 CP-0）：连续排版，不强制每场新页——一手源码依据
    // screenplain（slug_style 仅 spaceBefore/After + keepWithNext=1）与
    // injuben（slug 同样无分页控制），两者一致；每场一页曾是本实现的臆断。
    // 防孤行（keepWithNext 语义）：标题放不下「自身 + 至少 1 行后续内容」时
    // 整块推到下一页，避免标题孤悬页尾。
    if (block.type === 'scene_heading' && currentPage.fragments.length > 0) {
      // F-0057-03：需计入下一块自身的 marginTop 与整块落页偏好——内层
      // 循环对「连首片段上边距都放不下」的块会整块推页，若只算标题+1 行，
      // 剩余 5/6 行的窗口里跟随块被推走、标题孤悬页尾（审查实测）。
      const isLastBlock = nextBlock === null;
      const nextNextBlock =
        blockIndex + 2 < blocks.length ? blocks[blockIndex + 2] : null;
      const nextSpacing = nextBlock
        ? resolveBlockSpacing(
            rules,
            nextBlock.type,
            block.type,
            nextNextBlock?.type ?? null,
          )
        : null;
      const nextMarginTop = nextSpacing ? nextSpacing.marginTopLines : 0;
      // F-0057-03R：计入跟随块 marginBottom——内层整块落页偏好按
      // mt+lines+mb 判定，漏算 mb 时剩余 6 行（action）/5 行（mt0 块）
      // 窗口仍产生孤儿标题（定向复审实测）。
      const nextMarginBottom = nextSpacing ? nextSpacing.marginBottomLines : 0;
      const keepWithNextLines =
        (isLastBlock ? 0 : 1) + nextMarginTop + nextMarginBottom;
      const neededLines =
        spacing.marginTopLines +
        lines.length +
        spacing.marginBottomLines +
        keepWithNextLines;
      if (remainingLines < neededLines) {
        pushPage();
      }
    }

    let lineOffset = 0;
    let startsBlock = true;
    while (lineOffset < lines.length) {
      const marginTopLines = startsBlock ? spacing.marginTopLines : 0;
      const remainingContent = lines.length - lineOffset;

      // 当前页连一行正文和首片段的上边距都放不下时，先换页。
      if (
        currentPage.fragments.length > 0 &&
        remainingLines <= marginTopLines
      ) {
        pushPage();
        continue;
      }

      const availableAfterTop = remainingLines - marginTopLines;
      const finalFragmentFits =
        remainingContent + spacing.marginBottomLines <= availableAfterTop;

      // 若整个剩余片段能完整放到一张新页，宁可换页，也不把最后一行与
      // 下边距拆开；这同时避免末页余量被扣成负数。
      const fullPageRequirement =
        marginTopLines + remainingContent + spacing.marginBottomLines;
      if (
        currentPage.fragments.length > 0 &&
        !finalFragmentFits &&
        fullPageRequirement <= rules.linesPerPage
      ) {
        pushPage();
        continue;
      }

      let take: number;
      if (finalFragmentFits) {
        take = remainingContent;
      } else if (remainingContent <= availableAfterTop) {
        // 正文恰好能放下但下边距放不下时，至少留一行正文到下一页，
        // 让末片段和它的下边距一起落页。
        take = Math.min(availableAfterTop, Math.max(1, remainingContent - 1));
      } else {
        take = availableAfterTop;
      }

      // 极端情况下页上只剩一个空隙，避免死循环：先结束当前页，再从新页
      // 重新计算同一片段。
      if (take <= 0 || (availableAfterTop <= 0 && currentPage.fragments.length > 0)) {
        pushPage();
        continue;
      }

      const fragmentLines = lines.slice(lineOffset, lineOffset + take);
      const endsBlock = lineOffset + take >= lines.length;
      // 下边距是块结束后的可选空行：只有当前片段确实为末片段且
      // 预留空间足够时才能消费。若正文只能占满最后一格，不能把下边距
      // 无条件写回片段，否则渲染层会制造超过 linesPerPage 的页面。
      const canReserveBottom =
        endsBlock && fragmentLines.length + spacing.marginBottomLines <= availableAfterTop;
      const marginBottomLines = canReserveBottom ? spacing.marginBottomLines : 0;
      currentPage.fragments.push({
        block,
        lines: fragmentLines,
        marginTopLines,
        marginBottomLines,
        startsBlock,
        endsBlock,
      });
      remainingLines -= marginTopLines + fragmentLines.length + marginBottomLines;
      lineOffset += take;
      startsBlock = false;

      if (!endsBlock) {
        pushPage();
      } else if (remainingLines === 0) {
        pushPage();
      }
    }
  }

  if (currentPage.fragments.length > 0) {
    pages.push(currentPage);
  }
  return pages;
}
