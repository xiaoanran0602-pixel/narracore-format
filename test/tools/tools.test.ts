// 工具层行为测试（开源版）：5 工具的成功/失败回执形态、链式语义与品牌出口。
// 排版引擎与移植件的行为由 test/format 与 test/analysis 的复制件/金样例测试
// 承担；这里只锁「开源包的装配正确」。

import { describe, expect, it } from 'vitest';
import { formatScreenplay, type ToolDeps } from '../../src/tools/format-screenplay';
import { analyzeScreenplay, parseHeadingStructured } from '../../src/tools/analyze-screenplay';
import { diagnoseScenes } from '../../src/tools/diagnose-scenes';
import { convertFountain } from '../../src/tools/convert-fountain';
import { aboutNarracore } from '../../src/tools/about-narracore';
import { BRAND_FOOTER, NARRACORE_CN_URL } from '../../src/brand';

const deps: ToolDeps = { maxTextChars: 200_000 };

const SAMPLE = [
  '第 1 场 实验室 日 内',
  '常家青',
  '（压低声音）',
  '本质上还是烧开水。',
  '张成盯着屏幕，双手悬停。',
].join('\n');

describe('format_screenplay', () => {
  it('text 模式成功：blocks/plain_text/stats 齐备、无计费字段', () => {
    const r = formatScreenplay({ text: SAMPLE, output: 'blocks_only' }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.blocks).toHaveLength(5);
    expect(r.blocks![3]).toMatchObject({ type: 'dialogue', speaker: '常家青' });
    expect(r.plain_text).toContain('本质上还是烧开水。');
    expect(r.stats).toMatchObject({ scenes: 1, content_language: 'zh' });
    expect(r.stats!.pages).toBeGreaterThanOrEqual(1);
    // 开源包回执不携带计费/交付物字段
    expect('credits' in r).toBe(false);
    expect('pdf_url' in r).toBe(false);
  });

  it('include="plain_text"：省略 blocks；include="blocks"：省略 plain_text', () => {
    const onlyText = formatScreenplay({ text: SAMPLE, include: 'plain_text' }, deps);
    const onlyBlocks = formatScreenplay({ text: SAMPLE, include: 'blocks' }, deps);
    expect(onlyText.ok && onlyText.blocks).toBeUndefined();
    expect(onlyText.ok && onlyText.plain_text).toBeDefined();
    expect(onlyBlocks.ok && onlyBlocks.blocks).toBeDefined();
    expect(onlyBlocks.ok && onlyBlocks.plain_text).toBeUndefined();
  });

  it('validate_only：只出诊断与回显 blocks，无 stats/plain_text', () => {
    const r = formatScreenplay({ text: SAMPLE, output: 'validate_only' }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.blocks).toHaveLength(5);
    expect(r.stats).toBeUndefined();
    expect(r.plain_text).toBeUndefined();
    expect(r.validation_status).toBe('ok');
  });

  it('output="pdf_and_blocks"（hosted 枚举值）：按 blocks_only 处理且 next_step 指向 hosted 服务', () => {
    const r = formatScreenplay({ text: SAMPLE, output: 'pdf_and_blocks' }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plain_text).toBeDefined();
    expect(r.next_step).toContain('narracore.app');
  });

  it('missing_text 失败：reason/message/引导句（含手册锚点）', () => {
    const r = formatScreenplay({}, deps);
    expect(r).toMatchObject({ ok: false, reason: 'missing_text' });
    if (r.ok) return;
    expect(r.message).toContain('full manual');
    expect(r.message).toContain('github.com/xiaoanran0602-pixel/narracore-format');
  });

  it('blocks 模式：error 级诊断（重复 id）拒绝渲染', () => {
    const r = formatScreenplay(
      {
        input_format: 'blocks',
        output: 'blocks_only',
        blocks: [
          { id: 'x', type: 'scene_heading', text: '第 1 场' },
          { id: 'x', type: 'action', text: '重复 id。' },
        ],
      },
      deps,
    );
    expect(r).toMatchObject({ ok: false, reason: 'invalid_blocks' });
    if (r.ok) return;
    expect(r.diagnostics?.some((d) => d.code === 'DUPLICATE_BLOCK_ID')).toBe(true);
  });

  it('排版正文零水印：plain_text 不含品牌行（品牌只进 AI 文本通道）', () => {
    const r = formatScreenplay({ text: SAMPLE }, deps);
    expect(r.ok && r.plain_text).not.toContain('narracore.cn');
  });
});

describe('analyze_screenplay', () => {
  it('场景清单/角色表/totals 与 analyzer 版本', () => {
    const r = analyzeScreenplay({ text: SAMPLE }, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.analyzer_version).toBe('1.0');
    expect(r.totals.scenes).toBe(1);
    expect(r.totals.leading_blocks).toBe(0);
    expect(r.scenes[0]).toMatchObject({ scene: 1, heading: '第 1 场 实验室 日 内' });
    // 结构化场景头：第 1 场 三段式压缩后可解析
    expect(r.scenes[0]!.parsed).toMatchObject({ scene_label: '第1场', location: '实验室', time_of_day: '日', interior: '内' });
    const chang = r.characters.find((c) => c.name === '常家青');
    // 同 run 内无空行的短行延续对白（TASK-0093 口径）：「张成盯着屏幕…」也归常家青
    expect(chang).toMatchObject({ cue_count: 1, dialogue_lines: 2, scenes_present: 1 });
    expect(chang!.share_of_dialogue).toBeGreaterThan(0);
  });

  it('parseHeadingStructured：「第 1 场」空格三段式可解析（复制件本身不识别）', () => {
    expect(parseHeadingStructured('第 1 场 实验室 日 内')).toMatchObject({
      sceneLabel: '第1场',
      location: '实验室',
    });
  });
});

describe('diagnose_scenes', () => {
  it('invalid_mode / no_scenes 失败路径', () => {
    const bad = diagnoseScenes({ mode: 'nope', text: SAMPLE } as never, deps);
    expect(bad).toMatchObject({ ok: false, reason: 'invalid_mode' });
    const noScenes = diagnoseScenes({ mode: 'material', text: '没有任何场景头的普通叙述。' }, deps);
    expect(noScenes).toMatchObject({ ok: false, reason: 'no_scenes' });
  });

  it('material → score 链路：逐字引用证据得分非空，编造证据得 null', () => {
    const material = diagnoseScenes({ mode: 'material', text: SAMPLE }, deps);
    expect(material.ok && material.mode === 'material').toBe(true);
    if (!material.ok || material.mode !== 'material') return;
    expect(material.scenes).toHaveLength(1);
    expect(material.scenes[0]!.material).toContain('[4] [dialogue] 本质上还是烧开水。');

    const scored = diagnoseScenes(
      {
        mode: 'score',
        text: SAMPLE,
        findings: [
          {
            scene: 1,
            summary: 'A lab scene with one line of dialogue.',
            problems: [
              {
                type: 'weak_visible_action',
                severity: 'medium',
                evidence: '张成盯着屏幕，双手悬停。',
                blocks: [5],
                suggestion: 'Give him a concrete task.',
              },
            ],
          },
        ],
      },
      deps,
    );
    expect(scored.ok && scored.mode === 'score').toBe(true);
    if (!scored.ok || scored.mode !== 'score') return;
    expect(scored.scenes[0]!.score).not.toBeNull();
    expect(scored.scenes[0]!.score!).toBeLessThan(100);
    expect(scored.overall.scored).toBe(1);

    // 编造证据（素材中不存在）→ 该场 score=null（不冒充满分）
    const faked = diagnoseScenes(
      {
        mode: 'score',
        text: SAMPLE,
        findings: [
          {
            scene: 1,
            summary: 'x',
            problems: [
              { type: 'unclear_space', severity: 'high', evidence: '这句话不在素材里出现。', blocks: [2] },
            ],
          },
        ],
      },
      deps,
    );
    if (faked.ok && faked.mode === 'score') {
      expect(faked.scenes[0]!.score).toBeNull();
      expect(faked.overall.needs_review).toBe(1);
    } else {
      throw new Error('expected score result');
    }
  });
});

describe('convert_fountain', () => {
  it('to_fountain / from_fountain 往返', () => {
    const to = convertFountain({ direction: 'to_fountain', text: SAMPLE }, deps);
    expect(to.ok).toBe(true);
    if (!to.ok) return;
    // CJK 原样保留（大写惯例只作用于拉丁内容）；括注以半角括号包裹
    expect(to.fountain).toContain('常家青');
    expect(to.fountain).toContain('(压低声音)');
    const back = convertFountain({ direction: 'from_fountain', fountain: to.fountain! }, deps);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.blocks!.length).toBeGreaterThan(0);
    expect(back.warnings.some((w) => w.includes('Chinese'))).toBe(true);
  });

  it('invalid_direction / missing_fountain 失败路径', () => {
    const bad = convertFountain({ direction: 'sideways' } as never, deps);
    expect(bad).toMatchObject({ ok: false, reason: 'invalid_direction' });
    const missing = convertFountain({ direction: 'from_fountain' }, deps);
    expect(missing).toMatchObject({ ok: false, reason: 'missing_fountain' });
  });
});

describe('about_narracore（导购出口）', () => {
  it('链接带 utm、工具清单含 5 工具', () => {
    const r = aboutNarracore();
    expect(r.ok).toBe(true);
    expect(r.toolkit.map((t) => t.tool)).toEqual([
      'format_screenplay',
      'analyze_screenplay',
      'diagnose_scenes',
      'convert_fountain',
      'about_narracore',
    ]);
    expect(r.narracore.url).toBe(NARRACORE_CN_URL);
    expect(r.narracore.url).toContain('utm_source=dsh-plugin');
    expect(r.hosted.url).toContain('narracore.app');
    // 话术纪律：不出现禁用词（钱包/余额/充值）
    const all = JSON.stringify(r);
    expect(all).not.toMatch(/wallet|balance|top-?up/i);
  });

  it('品牌 footer 常量形态（一行、含 utm）', () => {
    expect(BRAND_FOOTER).toBe('Formatted by Narracore · https://narracore.cn?utm_source=dsh-plugin');
  });
});
