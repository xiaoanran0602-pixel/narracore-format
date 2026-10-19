// 前置归一层单测（P7-9）：确定性文本变换的边界行为（真实剧本指标由
// test/acceptance/fusion-screenplay.test.ts 承担——该验收文件属私有仓，
// 本开源仓的对应覆盖见 test/tools/*.test.ts）。

import { describe, expect, it } from 'vitest';
import { preNormalizeScreenplayText } from '../../src/format/pre-normalize';
import { parseScreenplayText } from '../../src/format/parser';

describe('preNormalizeScreenplayText', () => {
  it('「角色 (扩写)」→ 角色行 + 括注行；解析器随后识别为 character/parenthetical/dialogue', () => {
    const input = ['外 走廊 夜 内', '', '常家青 (压低声音)', '本质上还是烧开水。'].join('\n');
    const { text, changes } = preNormalizeScreenplayText(input);
    expect(changes.cueSplits).toBe(1);
    const rows = parseScreenplayText(text);
    expect(rows.map((r) => r.type)).toEqual([
      'scene_heading',
      'character',
      'parenthetical',
      'dialogue',
    ]);
    expect(rows[1]!.text).toBe('常家青');
    expect(rows[2]!.text).toBe('压低声音');
    expect(rows[3]).toMatchObject({ text: '本质上还是烧开水。', speaker: '常家青' });
  });

  it('句中括注的动作行不拆（只有整行「名字+末尾括号」才拆）', () => {
    const input = '他停下（犹豫了一下）继续往前走，走进仓库。';
    const { text, changes } = preNormalizeScreenplayText(input);
    expect(changes.cueSplits).toBe(0);
    expect(text).toBe(input);
  });

  it('名字超过 6 字的「名字+括号」不拆（非 cue 形态）', () => {
    const input = ['某个很长的说明文字（备注）'].join('\n');
    const { changes } = preNormalizeScreenplayText(input);
    expect(changes.cueSplits).toBe(0);
  });

  it('括号后无对白（空行收口）不拆', () => {
    const input = ['常家青 (画外音)', '', '下一段动作。'].join('\n');
    const { changes } = preNormalizeScreenplayText(input);
    expect(changes.cueSplits).toBe(0);
  });

  it('PDF 残留剔除：换页符与独立页码「N.」行', () => {
    const input = ['第一场 甲地 日 内', '动作一。', '\f2.', '动作二。', '3.', '动作三。'].join('\n');
    const { text, changes } = preNormalizeScreenplayText(input);
    expect(changes.pageArtifactsStripped).toBe(2);
    expect(text).not.toContain('2.');
    expect(text).not.toContain('3.');
    expect(text).toContain('动作二。');
  });

  it('角色行后的超长对白按句末标点软折行至 ≤30 字（保真不删字）', () => {
    const long = '这句话特别长超过三十个字符上限没有任何句读直到最后。第二句也拖得很长很长很长很长。';
    const input = ['常家青', long].join('\n');
    const { text, changes } = preNormalizeScreenplayText(input);
    expect(changes.dialogueLinesWrapped).toBe(1);
    const rows = parseScreenplayText(text);
    const dialogue = rows.filter((r) => r.type === 'dialogue');
    expect(dialogue.length).toBeGreaterThan(1);
    for (const d of dialogue) expect(Array.from(d.text).length).toBeLessThanOrEqual(30);
    // 保真：拼接后与原文一致
    expect(dialogue.map((d) => d.text).join('')).toBe(long);
  });

  it('动作语境的超长行不折（叙述归动作，逐行渲染由 PDF 布局承担）', () => {
    const input = ['外 甲地 日 内', '一段没有句读的超长叙述文字'.repeat(3)].join('\n');
    const { changes } = preNormalizeScreenplayText(input);
    expect(changes.dialogueLinesWrapped).toBe(0);
  });

  it('病理长墙（≤2 换行且 >300 字）按句切分', () => {
    const wall = '他走进来。灯亮了。有人说话。'.repeat(40); // 无换行、约 480 字
    const { text, changes } = preNormalizeScreenplayText(text0(wall));
    expect(changes.wallSentenceSplit).toBe(true);
    expect((text.match(/\n/g) ?? []).length).toBeGreaterThan(50);
  });

  it('干净常规文本零变换', () => {
    const clean = ['第 1 场 实验室 日 内', '', '张三盯着屏幕。', '', '常家青', '本质上还是烧开水。'].join('\n');
    const { text, changes } = preNormalizeScreenplayText(clean);
    expect(changes.cueSplits + changes.pageArtifactsStripped + changes.dialogueLinesWrapped).toBe(0);
    expect(changes.wallSentenceSplit).toBe(false);
    expect(text).toBe(clean);
  });
});

function text0(wall: string): string {
  return wall;
}
