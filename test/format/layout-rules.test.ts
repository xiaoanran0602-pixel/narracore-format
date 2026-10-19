// 排版规则单测（TASK-0040 CP-1）
//
// 验证范围：
// - AC-4: 字格常量逐值断言（中文 1/6in、33 字、38 行；英文 1/10in、61 字符、55 行）
// - AC-5: 分行断言（给定 100 字文本，断言分行结果）
// - AC-6: 列宽比断言（动作/对白 = 33/21 ≈ 1.57，英文 61/36 ≈ 1.69）
// - 七块类型版式快照
// - 语言探测阈值边界

import { describe, expect, it } from 'vitest';
import type { DocumentBlock } from '../../src/format/types';
import {
  ACTION_WIDTH_CHARS,
  CHAR_WIDTH_PT,
  CHARS_PER_LINE,
  DIALOGUE_WIDTH_CHARS,
  FONT_FAMILY,
  FONT_SIZE_PT,
  INDENT_CHARS,
  LINE_HEIGHT_PT,
  LINES_PER_PAGE,
  PAGE_MARGIN_IN,
  PAGE_SIZE_IN,
  blocksToLayoutRules,
  layoutRulesToCssVariables,
  calculateBlockLines,
  calculateTotalPages,
  detectContentLanguage,
  detectLanguageFromBlocks,
  isFullWidthGridCharacter,
  splitIntoGridRuns,
  splitIntoLines,
  paginateBlocks,
  resolveBlockSpacing,
} from '../../src/format/layout-rules';

// ---------------------------------------------------------------------------
// 测试数据
// ---------------------------------------------------------------------------

const sampleBlocks: DocumentBlock[] = [
  { id: '1', type: 'scene_heading', text: '内景 咖啡馆 - 日', scene_id: null },
  { id: '2', type: 'action', text: '阳光透过落地窗洒在木质桌面上。' },
  { id: '3', type: 'character', text: '李明' },
  { id: '4', type: 'parenthetical', text: '（低声）' },
  { id: '5', type: 'dialogue', text: '我们不能再这样下去了。' },
  { id: '6', type: 'transition', text: '切至：' },
  { id: '6s', type: 'shot', text: '特写：桌上的怀表' },
  { id: '7', type: 'note', text: '这里需要补充背景。' },
];

const englishBlocks: DocumentBlock[] = [
  { id: '1', type: 'scene_heading', text: 'INT. COFFEE SHOP - DAY', scene_id: null },
  { id: '2', type: 'action', text: 'Sunlight streams through the window.' },
  { id: '3', type: 'character', text: 'JOHN' },
  { id: '4', type: 'parenthetical', text: '(whispering)' },
  { id: '5', type: 'dialogue', text: "We can't keep doing this." },
  { id: '6', type: 'transition', text: 'CUT TO:' },
  { id: '6s', type: 'shot', text: 'CLOSE ON: the pocket watch' },
  { id: '7', type: 'note', text: 'Need more background here.' },
];

// ---------------------------------------------------------------------------
// AC-4: 字格常量逐值断言
// ---------------------------------------------------------------------------

describe('AC-4: 字格常量逐值断言', () => {
  it('正文栈按作品语言分流，供编辑态与打印态共享', () => {
    const zh = blocksToLayoutRules([], { contentLang: 'zh' });
    const en = blocksToLayoutRules([], { contentLang: 'en' });
    expect(zh.fontFamily).toBe(FONT_FAMILY.zh);
    expect(en.fontFamily).toBe(FONT_FAMILY.en);
    expect(zh.fontFamily).not.toBe(en.fontFamily);
    expect(zh.fullWidthFontFamily).not.toBe(zh.halfWidthFontFamily);
    expect(en.fullWidthFontFamily).not.toBe(en.halfWidthFontFamily);
  });

  it('混排字距由字格规则派生，不由预览 CSS 另写一份', () => {
    const zh = blocksToLayoutRules([], { contentLang: 'zh' }).blocks.action;
    const en = blocksToLayoutRules([], { contentLang: 'en' }).blocks.action;
    expect(zh.fullWidthLetterSpacingPt).toBe(0);
    expect(zh.halfWidthLetterSpacingPt).toBeCloseTo(-1.2, 6);
    expect(en.fullWidthLetterSpacingPt).toBeCloseTo(2.4, 6);
    expect(en.halfWidthLetterSpacingPt).toBe(0);
  });

  it('中文轨：字格宽 12pt（1/6in），字号 12pt，行高 18pt', () => {
    expect(CHAR_WIDTH_PT.zh).toBe(12);
    expect(FONT_SIZE_PT.zh).toBe(12);
    expect(LINE_HEIGHT_PT.zh).toBe(18);
  });

  it('英文轨：字格宽 7.2pt（1/10in），字号 12pt，行高 12pt', () => {
    expect(CHAR_WIDTH_PT.en).toBe(7.2);
    expect(FONT_SIZE_PT.en).toBe(12);
    expect(LINE_HEIGHT_PT.en).toBe(12);
  });

  it('中文轨：每行 33 字，每页 38 行', () => {
    expect(CHARS_PER_LINE.zh).toBe(33);
    expect(LINES_PER_PAGE.zh).toBe(38);
  });

  it('英文轨：每行 61 字符，每页 55 行', () => {
    expect(CHARS_PER_LINE.en).toBe(61);
    expect(LINES_PER_PAGE.en).toBe(55);
  });

  it('中文轨：文本框 5.5 × 9.5 in', () => {
    expect(PAGE_SIZE_IN.zh.width).toBe(5.5);
    expect(PAGE_SIZE_IN.zh.height).toBe(9.5);
  });

  it('英文轨：文本框 6.1 × 9.17 in', () => {
    expect(PAGE_SIZE_IN.en.width).toBe(6.1);
    expect(PAGE_SIZE_IN.en.height).toBe(9.17);
  });

  it('中文轨：页边距 左 1.5 / 上 1.0 / 右 1.5 / 下 0.5 in', () => {
    expect(PAGE_MARGIN_IN.zh).toEqual({ left: 1.5, top: 1.0, right: 1.5, bottom: 0.5 });
  });

  it('英文轨：页边距 左 1.5 / 上 1.0 / 右 0.9 / 下 0.83 in', () => {
    expect(PAGE_MARGIN_IN.en).toEqual({ left: 1.5, top: 1.0, right: 0.9, bottom: 0.83 });
  });

  it('各元素缩进（中文）：场景/动作 0，对白 5，括注 9.8，角色 11.5', () => {
    expect(INDENT_CHARS.scene_heading.zh).toBe(0);
    expect(INDENT_CHARS.action.zh).toBe(0);
    expect(INDENT_CHARS.dialogue.zh).toBe(5);
    expect(INDENT_CHARS.parenthetical.zh).toBe(9.8);
    expect(INDENT_CHARS.character.zh).toBe(11.5);
    expect(INDENT_CHARS.transition.zh).toBe(0);
    expect(INDENT_CHARS.note.zh).toBe(0);
  });

  it('各元素缩进（英文）：场景/动作 0，对白 9，括注 13，角色 19', () => {
    expect(INDENT_CHARS.scene_heading.en).toBe(0);
    expect(INDENT_CHARS.action.en).toBe(0);
    expect(INDENT_CHARS.dialogue.en).toBe(9);
    expect(INDENT_CHARS.parenthetical.en).toBe(13);
    expect(INDENT_CHARS.character.en).toBe(19);
    expect(INDENT_CHARS.transition.en).toBe(0);
    expect(INDENT_CHARS.note.en).toBe(0);
  });

  it('对白列宽：中文 26（21+5），英文 45（36+9）', () => {
    expect(DIALOGUE_WIDTH_CHARS.zh).toBe(26);
    expect(DIALOGUE_WIDTH_CHARS.en).toBe(45);
  });

  it('动作列宽：中文 33，英文 61', () => {
    expect(ACTION_WIDTH_CHARS.zh).toBe(33);
    expect(ACTION_WIDTH_CHARS.en).toBe(61);
  });
});

// ---------------------------------------------------------------------------
// AC-6: 列宽比断言
// ---------------------------------------------------------------------------

describe('AC-6: 列宽比断言', () => {
  it('中文：动作/对白 = 33/21 ≈ 1.57', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const ratio = rules.blocks.action.charsPerLine / rules.blocks.dialogue.charsPerLine;
    expect(ratio).toBeCloseTo(33 / 21, 2);
  });

  it('英文：动作/对白 = 61/36 ≈ 1.69', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'en' });
    const ratio = rules.blocks.action.charsPerLine / rules.blocks.dialogue.charsPerLine;
    expect(ratio).toBeCloseTo(61 / 36, 2);
  });

  it('同段文本对白行数显著多于动作', () => {
    const zhRules = blocksToLayoutRules([], { contentLang: 'zh' });
    const enRules = blocksToLayoutRules([], { contentLang: 'en' });
    const zhText = '字'.repeat(100);
    const enText = 'a'.repeat(100);

    expect(splitIntoLines(zhText, 'dialogue', zhRules).length).toBeGreaterThan(
      splitIntoLines(zhText, 'action', zhRules).length,
    );
    expect(splitIntoLines(enText, 'dialogue', enRules).length).toBeGreaterThan(
      splitIntoLines(enText, 'action', enRules).length,
    );
  });
});

// ---------------------------------------------------------------------------
// 语言探测
// ---------------------------------------------------------------------------

describe('语言探测', () => {
  it('纯中文 → zh', () => {
    expect(detectContentLanguage('这是一段中文文本。')).toBe('zh');
  });

  it('纯英文 → en', () => {
    expect(detectContentLanguage('This is English text.')).toBe('en');
  });

  it('CJK 占比 ≥ 0.3 → zh', () => {
    // 纯中文文本，CJK 占比 100%
    expect(detectContentLanguage('这是一段中文文本')).toBe('zh');
    expect(detectContentLanguage('中文本abcdefg')).toBe('zh');
  });

  it('CJK 占比 < 0.3 → en', () => {
    // 10 个字符中 2 个 CJK = 0.2
    expect(detectContentLanguage('中a文bcdefg')).toBe('en');
  });

  it('空文本 → zh（默认）', () => {
    expect(detectContentLanguage('')).toBe('zh');
    expect(detectContentLanguage('   ')).toBe('zh');
  });

  it('从块数组探测', () => {
    expect(detectLanguageFromBlocks(sampleBlocks)).toBe('zh');
    expect(detectLanguageFromBlocks(englishBlocks)).toBe('en');
  });

  it('中文标点、全角形式与生僻汉字均占全格', () => {
    expect(isFullWidthGridCharacter('。')).toBe(true);
    expect(isFullWidthGridCharacter('Ａ')).toBe(true);
    expect(isFullWidthGridCharacter('𠮷')).toBe(true);
    expect(isFullWidthGridCharacter('A')).toBe(false);
  });

  it('连续字符合并为全角/半角 run，避免逐字 DOM', () => {
    expect(splitIntoGridRuns('中文AB，CD')).toEqual([
      { kind: 'full', text: '中文' },
      { kind: 'half', text: 'AB' },
      { kind: 'full', text: '，' },
      { kind: 'half', text: 'CD' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// 全块类型版式快照（清单长度由单一事实源决定）
// ---------------------------------------------------------------------------

describe('全块类型版式快照', () => {
  it('中文轨完整规则', () => {
    const rules = blocksToLayoutRules(sampleBlocks, { contentLang: 'zh' });
    expect(rules).toMatchSnapshot();
  });

  it('英文轨完整规则', () => {
    const rules = blocksToLayoutRules(englishBlocks, { contentLang: 'en' });
    expect(rules).toMatchSnapshot();
  });

  it('场景标题：大写、无缩进、前空 2 行', () => {
    const rules = blocksToLayoutRules(sampleBlocks, { contentLang: 'zh' });
    const scene = rules.blocks.scene_heading;
    expect(scene.uppercase).toBe(true);
    expect(scene.indentChars).toBe(0);
    expect(scene.marginTopLines).toBe(2);
    expect(scene.letterSpacing).toBe('normal');
  });

  it('角色名：大写、缩进 11.5 字、后无空行', () => {
    const rules = blocksToLayoutRules(sampleBlocks, { contentLang: 'zh' });
    const character = rules.blocks.character;
    expect(character.uppercase).toBe(true);
    expect(character.indentChars).toBe(11.5);
    expect(character.marginBottomLines).toBe(0);
  });

  it('对白：缩进 5 字、可用列宽 21 字（总宽 26 字）、后空 1 行', () => {
    const rules = blocksToLayoutRules(sampleBlocks, { contentLang: 'zh' });
    const dialogue = rules.blocks.dialogue;
    expect(dialogue.indentChars).toBe(5);
    expect(dialogue.charsPerLine).toBe(21);
    expect(dialogue.widthChars).toBe(26);
    expect(dialogue.marginBottomLines).toBe(1);
  });

  it('括注：小字、缩进 9.8 字', () => {
    const rules = blocksToLayoutRules(sampleBlocks, { contentLang: 'zh' });
    const paren = rules.blocks.parenthetical;
    expect(paren.smallText).toBe(true);
    expect(paren.indentChars).toBe(9.8);
  });

  it('转场：右对齐、大写、后空 2 行', () => {
    const rules = blocksToLayoutRules(sampleBlocks, { contentLang: 'zh' });
    const transition = rules.blocks.transition;
    expect(transition.alignRight).toBe(true);
    expect(transition.uppercase).toBe(true);
    expect(transition.marginBottomLines).toBe(2);
  });

  it('备注：小字、无缩进', () => {
    const rules = blocksToLayoutRules(sampleBlocks, { contentLang: 'zh' });
    const note = rules.blocks.note;
    expect(note.smallText).toBe(true);
    expect(note.indentChars).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-5: 分行断言
// ---------------------------------------------------------------------------

describe('AC-5: 分行断言', () => {
  it('中文：100 字按 33 字/行分行', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const text = '字'.repeat(100);
    const lines = splitIntoLines(text, 'action', rules);

    // 100 / 33 = 3 行余 1
    expect(lines.length).toBe(4);
    expect(lines[0].length).toBe(33);
    expect(lines[1].length).toBe(33);
    expect(lines[2].length).toBe(33);
    expect(lines[3].length).toBe(1);
  });

  it('英文：100 西文字符按 61 字符/行分行', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'en' });
    const text = 'a'.repeat(100);
    const lines = splitIntoLines(text, 'action', rules);

    expect(lines.length).toBe(2);
    expect(lines[0].length).toBe(61);
    expect(lines[1].length).toBe(39);
  });

  it('英文：CJK 字符按 2 格计算', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'en' });
    // 30 个西文（30 格）+ 16 个 CJK（32 格）= 62 格，应在 61 格处换行。
    const text = 'a'.repeat(30) + '中'.repeat(16);
    const lines = splitIntoLines(text, 'action', rules);

    expect(lines.length).toBe(2);
    expect(lines[0]).toBe('a'.repeat(30) + '中'.repeat(15));
    expect(lines[1]).toBe('中');
  });

  it('中英混排：西文按 2:1 折算', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    // 20 个汉字（20 格）+ 20 个西文（10 格）= 30 格，33 格一行
    const text = '中'.repeat(20) + 'a'.repeat(20);
    const lines = splitIntoLines(text, 'action', rules);

    expect(lines.length).toBe(1);
    expect(lines[0]).toBe(text);
  });

  it('中英混排：超过行宽时换行', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    // 30 个汉字（30 格）+ 10 个西文（5 格）= 35 格 > 33 格
    const text = '中'.repeat(30) + 'a'.repeat(10);
    const lines = splitIntoLines(text, 'action', rules);

    // 30 格 + 3 格（6 个西文）= 33 格第一行，剩余 4 个西文第二行
    expect(lines.length).toBe(2);
  });

  it('中文全角标点按一格分行', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const lines = splitIntoLines('。'.repeat(34), 'action', rules);
    expect(lines.map((line) => [...line].length)).toEqual([33, 1]);
  });

  it('对白块：扣除缩进后按 21 字/行分行', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const text = '字'.repeat(50);
    const lines = splitIntoLines(text, 'dialogue', rules);

    // 50 / 21 = 2 行余 8
    expect(lines.length).toBe(3);
    expect(lines[0].length).toBe(21);
    expect(lines[1].length).toBe(21);
    expect(lines[2].length).toBe(8);
  });

  it('空文本返回单行空字符串', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    expect(splitIntoLines('', 'action', rules)).toEqual(['']);
  });

  it('显式换行保留连续空行与尾部空行（TASK-0067 F-0067-01）', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });

    expect(splitIntoLines('第一行\n\n第二行', 'action', rules)).toEqual([
      '第一行',
      '',
      '第二行',
    ]);
    expect(splitIntoLines('第一行\n', 'action', rules)).toEqual(['第一行', '']);
  });
});

// ---------------------------------------------------------------------------
// 块行数与页数计算
// ---------------------------------------------------------------------------

describe('块行数与页数计算', () => {
  it('单块行数 = 内容行 + 上边距 + 下边距', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    // 动作块：10 字 → 1 行内容 + 1 上 + 1 下 = 3 行
    expect(calculateBlockLines('十个字的动作描述', 'action', rules)).toBe(3);
  });

  it('尾部软换行计入块行数与分页片段（TASK-0067 F-0067-01）', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const text = '动作。\n';

    expect(calculateBlockLines(text, 'action', rules)).toBe(4);
    expect(
      paginateBlocks([{ id: 'trailing-break', type: 'action', text }], rules)
        .at(0)
        ?.fragments.at(0)?.lines,
    ).toEqual(['动作。', '']);
  });

  it('场景标题：1 行内容 + 2 上 + 1 下 = 4 行', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    expect(calculateBlockLines('内景 房间', 'scene_heading', rules)).toBe(4);
  });

  it('总页数按每页 38 行计算', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    // 10 个动作块，每块 3 行 = 30 行 → 1 页
    const blocks: DocumentBlock[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      type: 'action' as const,
      text: '十个字的动作描述',
    }));
    expect(calculateTotalPages(blocks, rules)).toBe(1);

    // 20 个动作块，每块 3 行 = 60 行 → 2 页
    const moreBlocks: DocumentBlock[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      type: 'action' as const,
      text: '十个字的动作描述',
    }));
    expect(calculateTotalPages(moreBlocks, rules)).toBe(2);
  });

  it('分页为连续排版：场景标题不强制起新页（TASK-0057 CP-0，screenplain/injuben 一手源码依据）', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const blocks: DocumentBlock[] = [
      { id: 'a', type: 'action', text: '动作。' },
      { id: 's', type: 'scene_heading', text: '第二场 内景' },
      { id: 'b', type: 'action', text: '第二场动作。' },
    ];
    const pages = paginateBlocks(blocks, rules);

    // 短内容连续排在一页——不再"多少场就多少页"
    expect(pages).toHaveLength(1);
    expect(pages[0].fragments.map((f) => f.block.type)).toEqual([
      'action',
      'scene_heading',
      'action',
    ]);
  });

  it('F-0057-03 边界：页剩余 5/6 行时跟随块被整块推页，标题必须一起走（不留孤儿）', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    // 标题块需求 = marginTop2 + 标题1 + marginBottom1 = 4 行；跟随动作块
    // 需 marginTop1 + 1 行 = 2 行（其 marginBottom 不挡起步）。安全阈值 7：
    // 剩余 5 或 6 行时，标题放得下但动作块会被内层整块推页 → 标题必须同走。
    // F-0057-03R 构造修正：filler 实占 mt1+n+mb1 行，要构造页剩余 R 行
    // 需 n = linesPerPage - 2 - R。对 5/6/7 三点断言（7 为安全阈值边界）。
    for (const remaining of [5, 6, 7]) {
      const fillerLines = rules.linesPerPage - 2 - remaining;
      const pages = paginateBlocks(
        [
          { id: 'fill', type: 'action', text: '字'.repeat(33 * fillerLines) },
          { id: 's', type: 'scene_heading', text: '第二场 内景' },
          { id: 'b', type: 'action', text: '跟随动作。' },
        ],
        rules,
      );
      const lastPage = pages[pages.length - 1];
      // 最后一页必须同时含标题与跟随块（标题没有孤悬在前一页页尾）
      const types = lastPage.fragments.map((f) => f.block.type);
      expect(types).toContain('scene_heading');
      expect(types).toContain('action');
      expect(types.indexOf('scene_heading')).toBeLessThan(types.lastIndexOf('action'));
    }
  });

  it('场景标题防孤行：页尾放不下「标题+1 行后续」时整块推到下一页', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    // 铺满第一页到只剩 2 行余量（标题需 marginTop2+标题1+marginBottom1+后续1=5 行）
    const filler: DocumentBlock[] = [
      { id: 'fill', type: 'action', text: '字'.repeat(33 * (rules.linesPerPage - 4)) },
    ];
    const blocks: DocumentBlock[] = [
      ...filler,
      { id: 's', type: 'scene_heading', text: '第二场 内景' },
      { id: 'b', type: 'action', text: '后续动作。' },
    ];
    const pages = paginateBlocks(blocks, rules);

    expect(pages.length).toBeGreaterThan(1);
    // 第二页从场景标题开始（标题没有被孤悬在第一页页尾）
    expect(pages[1].fragments[0].block.type).toBe('scene_heading');
    for (const page of pages) {
      const usedLines = page.fragments.reduce(
        (sum, fragment) =>
          sum + fragment.marginTopLines + fragment.lines.length + fragment.marginBottomLines,
        0,
      );
      expect(usedLines).toBeLessThanOrEqual(rules.linesPerPage);
    }
  });

  it('超长块按字格行切片，不让单块溢出页容量', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const pages = paginateBlocks(
      [{ id: 'long', type: 'action', text: '字'.repeat(33 * 40) }],
      rules,
    );

    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      const usedLines = page.fragments.reduce(
        (sum, fragment) =>
          sum + fragment.marginTopLines + fragment.lines.length + fragment.marginBottomLines,
        0,
      );
      expect(usedLines).toBeLessThanOrEqual(rules.linesPerPage);
    }
  });

  it('末页容不下下边距时保留正文到下一页，不产生负余量', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const pages = paginateBlocks(
      [{ id: 'edge', type: 'action', text: '字'.repeat(33 * 37) }],
      rules,
    );

    expect(pages).toHaveLength(2);
    const used = pages.map((page) =>
      page.fragments.reduce(
        (sum, fragment) =>
          sum + fragment.marginTopLines + fragment.lines.length + fragment.marginBottomLines,
        0,
      ),
    );
    expect(used).toEqual([37, 2]);
    expect(pages[1].fragments.at(-1)?.marginBottomLines).toBe(1);
  });

  it('块间下边距不能让页面超过固定容量', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const pages = paginateBlocks(
      [
        { id: 'action', type: 'action', text: '字'.repeat(33 * 35) },
        { id: 'dialogue', type: 'dialogue', text: '话' },
      ],
      rules,
    );

    expect(pages).toHaveLength(2);
    expect(
      pages[0].fragments.reduce(
        (sum, fragment) =>
          sum + fragment.marginTopLines + fragment.lines.length + fragment.marginBottomLines,
        0,
      ),
    ).toBe(37);
    expect(pages[1].fragments[0]?.block.type).toBe('dialogue');
    for (const page of pages) {
      const usedLines = page.fragments.reduce(
        (sum, fragment) =>
          sum + fragment.marginTopLines + fragment.lines.length + fragment.marginBottomLines,
        0,
      );
      expect(usedLines).toBeLessThanOrEqual(rules.linesPerPage);
    }
  });
});

// ---------------------------------------------------------------------------
// TASK-0072 CP-1：括注邻接间距解析（唯一事实源，消灭编辑态/打印态双源）
//
// 背景：TASK-0066 独立审查 F-003 实测——editor-theme.css 曾用相邻兄弟/`:has()`
// 选择器只在编辑态清零括注两侧接缝，打印预览的 paginateBlocks 未做同等处理，
// 同一文档编辑态接缝 0px、打印态 24px。resolveBlockSpacing 是本卡引入的唯一
// 邻接解析入口，编辑态装饰（block-spacing-decoration.ts）与 paginateBlocks
// 都必须调用它——这里的用例本身即是反向验证：任何人把该函数改回"只读块自身
// marginTopLines/marginBottomLines、忽略 prevType/nextType"，以下用例会立即
// 失败（"删守卫后测试会失败"）。
// ---------------------------------------------------------------------------

describe('TASK-0072 AC-2：resolveBlockSpacing 邻接感知间距', () => {
  const rules = blocksToLayoutRules([], { contentLang: 'zh' });

  it('括注前是角色（角色→括注）：角色自身下边距为 0（原本已是 0，规则不得破坏）', () => {
    expect(rules.blocks.character.marginBottomLines).toBe(0);
    const spacing = resolveBlockSpacing(rules, 'character', null, 'parenthetical');
    expect(spacing.marginBottomLines).toBe(0);
  });

  it('括注前是对白（对白→括注）：对白自身下边距从 1 行清零为 0', () => {
    expect(rules.blocks.dialogue.marginBottomLines).toBe(1);
    const spacing = resolveBlockSpacing(rules, 'dialogue', null, 'parenthetical');
    expect(spacing.marginBottomLines).toBe(0);
  });

  it('括注后是角色（括注→角色）：角色自身上边距从 1 行清零为 0', () => {
    expect(rules.blocks.character.marginTopLines).toBe(1);
    const spacing = resolveBlockSpacing(rules, 'character', 'parenthetical', null);
    expect(spacing.marginTopLines).toBe(0);
  });

  it('括注后是对白（括注→对白）：对白自身上边距为 0（原本已是 0，规则不得破坏）', () => {
    expect(rules.blocks.dialogue.marginTopLines).toBe(0);
    const spacing = resolveBlockSpacing(rules, 'dialogue', 'parenthetical', null);
    expect(spacing.marginTopLines).toBe(0);
  });

  it('非括注邻接：块自身间距原样保留（action 前后均为 action）', () => {
    const spacing = resolveBlockSpacing(rules, 'action', 'action', 'action');
    expect(spacing.marginTopLines).toBe(rules.blocks.action.marginTopLines);
    expect(spacing.marginBottomLines).toBe(rules.blocks.action.marginBottomLines);
  });

  it('括注自身：邻接不改变其恒为 0 的间距', () => {
    const spacing = resolveBlockSpacing(rules, 'parenthetical', 'character', 'dialogue');
    expect(spacing.marginTopLines).toBe(0);
    expect(spacing.marginBottomLines).toBe(0);
  });

  it('文档首/尾（无前块或无后块）：不因缺失邻居而误清零', () => {
    const noPrev = resolveBlockSpacing(rules, 'character', null, null);
    expect(noPrev.marginTopLines).toBe(rules.blocks.character.marginTopLines);
    expect(noPrev.marginBottomLines).toBe(rules.blocks.character.marginBottomLines);

    const noNext = resolveBlockSpacing(rules, 'dialogue', null, null);
    expect(noNext.marginTopLines).toBe(rules.blocks.dialogue.marginTopLines);
    expect(noNext.marginBottomLines).toBe(rules.blocks.dialogue.marginBottomLines);
  });
});

describe('TASK-0072 AC-3：paginateBlocks 消费同一份邻接解析（打印态不再是第二套实现）', () => {
  it('角色→括注→对白：角色下边距与对白上边距在分页片段中均为 0', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const blocks: DocumentBlock[] = [
      { id: 'c', type: 'character', text: '李明' },
      { id: 'p', type: 'parenthetical', text: '（低声）' },
      { id: 'd', type: 'dialogue', text: '我们不能再这样下去了。' },
    ];
    const fragments = paginateBlocks(blocks, rules)[0].fragments;
    const character = fragments.find((f) => f.block.type === 'character');
    const parenthetical = fragments.find((f) => f.block.type === 'parenthetical');
    const dialogue = fragments.find((f) => f.block.type === 'dialogue');

    expect(character?.marginBottomLines).toBe(0);
    expect(parenthetical?.marginTopLines).toBe(0);
    expect(parenthetical?.marginBottomLines).toBe(0);
    expect(dialogue?.marginTopLines).toBe(0);
    // 未与括注相邻的一侧不受影响：角色自身上边距、对白自身下边距原样保留。
    expect(character?.marginTopLines).toBe(rules.blocks.character.marginTopLines);
    expect(dialogue?.marginBottomLines).toBe(rules.blocks.dialogue.marginBottomLines);
  });

  it('对白→括注→角色（舞台指示插入连续对话中间）：两侧接缝同样清零', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const blocks: DocumentBlock[] = [
      { id: 'd', type: 'dialogue', text: '先这样。' },
      { id: 'p', type: 'parenthetical', text: '（停顿）' },
      { id: 'c', type: 'character', text: '王芳' },
    ];
    const fragments = paginateBlocks(blocks, rules)[0].fragments;
    const dialogue = fragments.find((f) => f.block.type === 'dialogue');
    const character = fragments.find((f) => f.block.type === 'character');

    expect(dialogue?.marginBottomLines).toBe(0);
    expect(character?.marginTopLines).toBe(0);
  });

  it('回归防护：不与括注相邻的角色/对白维持原有间距，不被误清零', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const blocks: DocumentBlock[] = [
      { id: 'c1', type: 'character', text: '李明' },
      { id: 'd1', type: 'dialogue', text: '今天天气不错。' },
    ];
    const fragments = paginateBlocks(blocks, rules)[0].fragments;
    const character = fragments.find((f) => f.block.type === 'character');
    const dialogue = fragments.find((f) => f.block.type === 'dialogue');

    expect(character?.marginBottomLines).toBe(rules.blocks.character.marginBottomLines);
    expect(dialogue?.marginBottomLines).toBe(rules.blocks.dialogue.marginBottomLines);
  });
});

// 迁移注记（2026-09-16）：主仓库原文件此处有两个 describe——
// 「editor-theme.css 相邻兄弟选择器 grep」与「同源反向验证（TS 内存 Host
// 移除导出 + 全量编译）」。二者断言对象是主仓库前端源码/CSS 文件，本仓库
// 无对应文件，故不随迁（见 src/format/README.md）；其余断言零改动。

describe('CSS 变量只由规则输出，且包含每块的缩进/间距/字体', () => {
  it('CSS 变量由 layoutRulesToCssVariables 唯一输出', () => {
    const rules = blocksToLayoutRules([], { contentLang: 'zh' });
    const variables = layoutRulesToCssVariables(rules);
    expect(variables['--layout-font-family']).toBe(FONT_FAMILY.zh);
    expect(variables['--layout-dialogue-indent']).toBe('0.833333in');
    expect(variables['--layout-dialogue-content-width']).toBe('252pt');
    expect(variables['--layout-dialogue-margin-bottom']).toBe('18pt');
  });
});
