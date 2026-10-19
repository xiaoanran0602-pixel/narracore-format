// P12 三语同步金样例（开源版适配；源自私有仓 test/format/trilingual-golden.test.ts）：
// 日文放送剧与中文冒号台词稿走 format_screenplay text 模式全链
// （pre-normalize → parser TASK-0243 → 渲染统计）。PDF 出稿断言属私有仓
// （开源包不含 PDF 链路）；指纹稳定性断言以本地 canonical sha256 等价承担。
// 反向检验意识：撤掉 parser.ts 的 TASK-0243 同步（还原旧副本），以下
// 断言全红——两类样稿当时整篇误判为动作块；删 pre-normalize 的内联守卫，
// 「超长冒号行不折断」两例必红（尾巴被切成动作块）。

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { formatScreenplay, type ToolDeps, type ToolSuccess } from '../../src/tools/format-screenplay';
import { blocksToFountain, fountainToBlocks } from '../../src/format/fountain';
import type { DocumentBlock } from '../../src/format/types';
import type { BlockInput } from '../../src/tools/blocks-input';

// 与 parser.test.ts 同源样张（摘自 0921 主仓库发版前跑测真实素材）
const JA_SAMPLE = [
  '〇同・表（早朝）',
  '杏菜、ホテルを出て、大通りの方へと',
  '向かっていく。',
  '北原「W……」',
  '杏菜「W……行くね」',
  '〇葬儀場・通夜会場（夜）',
  '北原の声「無理もないですよ。いくら癌の発',
  '見が早かっただけに、というところです」',
  '伊塚「W……思えば、二十年以上もの歳月を、',
  'ともに過ごしてきたことになります」',
  '北原、煙草を吸いながら電話している。',
  '第１場　教室',
].join('\n');

const CN_SAMPLE = [
  '《让子弹飞》剧本台词文稿整理',
  '影视台词君',
  '真汤师爷：好，好好！',
  '马县长：汤师爷，是好吃，还是好听？',
  '县长夫人：屁！',
  '麻匪甲：没打中？',
  '张：让子弹飞一会儿。',
  '官兵们：不吃饭！',
  '马县长：我马某走南闯北，靠的就是能文能武，与众不同，不光吃喝玩乐，更要雪月风花。',
].join('\n');

const deps: ToolDeps = { maxTextChars: 200_000 };

/** canonical 序列指纹（等价承担私有仓 fingerprintOfBlocks 的稳定性断言）。 */
function fp(blocks: readonly DocumentBlock[]): string {
  return createHash('sha256').update(blocks.map((b) => `${b.type}:${b.text}`).join('\n')).digest('hex');
}

function asSuccess(r: unknown): ToolSuccess {
  expect(r).toMatchObject({ ok: true });
  return r as ToolSuccess;
}

describe('P12 三语金样例：日文放送剧（text 模式全链）', () => {
  it('〇 场头 / 内联对白拆块 / 跨行吸收合并 / 渲染统计', () => {
    const r = asSuccess(formatScreenplay({ text: JA_SAMPLE, output: 'blocks_only' }, deps));
    const blocks = r.blocks!;

    // 场景头：〇 放送剧场头与「第１場」全中
    expect(blocks.filter((b) => b.type === 'scene_heading').map((s) => s.text)).toEqual([
      '〇同・表（早朝）',
      '〇葬儀場・通夜会場（夜）',
      '第１場　教室',
    ]);

    // 单行内联对白：名前「セリフ」→ character + dialogue（剥引号壳）
    const idx = blocks.findIndex((b) => b.text === '北原');
    expect(blocks[idx]).toMatchObject({ type: 'character' });
    expect(blocks[idx + 1]).toEqual({
      type: 'dialogue',
      text: 'W……',
      speaker: '北原',
    });

    // 跨行吸收：折行台词合并为一块（の声/画外音名）
    const dlg = blocks.find((b) => b.speaker === '北原の声');
    expect(dlg).toEqual({
      type: 'dialogue',
      text: '無理もないですよ。いくら癌の発見が早かっただけに、というところです',
      speaker: '北原の声',
    });
    // 被吸收的折行不独立成块
    expect(blocks.some((b) => b.text === '見が早かっただけに、というところです')).toBe(false);

    // 叙述行保持动作（不被内联对白吞并）
    expect(blocks).toContainEqual({
      type: 'action',
      text: '北原、煙草を吸いながら電話している。',
    });

    // 渲染：全角字格轨；歧义只余叙述行一处（诚实告警，非错误）
    expect(r.stats!.content_language).toBe('zh');
    expect(r.stats!.pages).toBeGreaterThan(0);
    // 页级明细：与回显 blocks 对齐、单调不减、首块第 1 页、
    // 最大值 = stats.pages（正文页口径）
    const ps = r.stats!.page_starts;
    expect(ps).toHaveLength(r.blocks!.length);
    expect(ps[0]).toBe(1);
    for (let i = 1; i < ps.length; i += 1) expect(ps[i]).toBeGreaterThanOrEqual(ps[i - 1]!);
    expect(Math.max(...ps)).toBe(r.stats!.pages);
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const ambiguous = r.diagnostics.filter((d) => d.code === 'AMBIGUOUS_ACTION_MAYBE_DIALOGUE');
    expect(ambiguous).toHaveLength(1); // 「杏菜、ホテルを出て…」叙述行
    expect(r.validation_status).toBe('needs_review');
    expect(r.confidence!).toBeGreaterThan(0.9);
  });
});

describe('P12 三语金样例：中文冒号台词稿（text 模式全链）', () => {
  it('人名：台词 → character+dialogue；单字名/长对白/叙述防护', () => {
    const r = asSuccess(formatScreenplay({ text: CN_SAMPLE, output: 'blocks_only' }, deps));
    const blocks = r.blocks!;

    // 头部两行（标题/署名）落动作；七条冒号对白各拆两块
    expect(blocks.map((b) => b.type)).toEqual([
      'action', 'action',
      'character', 'dialogue',
      'character', 'dialogue',
      'character', 'dialogue',
      'character', 'dialogue',
      'character', 'dialogue',
      'character', 'dialogue',
      'character', 'dialogue',
    ]);
    expect(blocks[10]).toMatchObject({ type: 'character', text: '张' });
    expect(blocks[11]).toEqual({
      type: 'dialogue',
      text: '让子弹飞一会儿。',
      speaker: '张',
    });

    // 超长冒号行（38 字）整条成一块对白——pre-normalize 内联守卫不折行
    const longDlg = blocks.find(
      (b) => b.speaker === '马县长' && b.text.includes('雪月风花'),
    );
    expect(longDlg).toEqual({
      type: 'dialogue',
      text: '我马某走南闯北，靠的就是能文能武，与众不同，不光吃喝玩乐，更要雪月风花。',
      speaker: '马县长',
    });
    // 尾巴没有被软折行切成动作块
    expect(blocks.some((b) => b.type === 'action' && b.text.startsWith('同，不光吃喝玩乐'))).toBe(false);

    expect(r.stats!.content_language).toBe('zh');
    // 标题/署名两行被判动作且短而无句末标点 → 诚实歧义告警（非错误）
    expect(r.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(r.diagnostics.filter((d) => d.code === 'AMBIGUOUS_ACTION_MAYBE_DIALOGUE')).toHaveLength(2);
    expect(r.validation_status).toBe('needs_review');
    expect(r.confidence!).toBeGreaterThan(0.8);
  });

  it('守卫回归：cue 形态行紧邻超长冒号对白（对白语境）也不折断', () => {
    // 「影视台词君」是 cue 形态行 → 旧逻辑会进入对白语境并对下一行软折行；
    // 内联守卫必须让 38 字冒号行原样交给解析器。
    const text = [
      '影视台词君',
      '马县长：我马某走南闯北，靠的就是能文能武，与众不同，不光吃喝玩乐，更要雪月风花。',
    ].join('\n');
    const r = asSuccess(formatScreenplay({ text, output: 'blocks_only' }, deps));
    const dialogues = r.blocks!.filter((b) => b.type === 'dialogue');
    expect(dialogues).toHaveLength(1);
    expect(dialogues[0]!.text).toBe(
      '我马某走南闯北，靠的就是能文能武，与众不同，不光吃喝玩乐，更要雪月风花。',
    );
    // TASK-0243 语义：cue 行后随内联对白 → 是署名/噪音，落动作
    expect(r.blocks!.filter((b) => b.type === 'action').map((a) => a.text)).toEqual([
      '影视台词君',
    ]);
  });
});

describe('P12 页级明细（page_starts）', () => {
  it('blocks 模式：与回显 blocks 对齐；派生人物/括注行不单列，对白块指向本体页', () => {
    const blocks: BlockInput[] = [
      { type: 'scene_heading', text: '第 1 场 实验室 日 内' },
      { type: 'dialogue', text: '本质上还是烧开水。', speaker: '常家青', delivery: '压低声音' },
      { type: 'action', text: '张成盯着屏幕。' },
    ];
    const r = asSuccess(
      formatScreenplay({ input_format: 'blocks', blocks, output: 'blocks_only' }, deps),
    );
    expect(r.blocks!).toHaveLength(3); // 回显 = 输入块数
    expect(r.stats!.render_elements).toBe(5); // + 派生 character + parenthetical
    expect(r.stats!.page_starts).toHaveLength(3);
    expect(r.stats!.page_starts.every((p) => p >= 1 && p <= r.stats!.pages)).toBe(true);
    expect(r.stats!.page_starts[0]).toBe(1);
  });
});

describe('P12 三语金样例：Fountain 往返指纹稳定', () => {
  // 反向检验意识：删掉 fountain.ts 的 rejoinColonInline（往返保形），
  // 「过内联名门、不过严格 cue 门」的名字（北原の声）回解析落动作，本例必红。
  it('日文+中文冒号稿 to_fountain → from_fountain 块序列与直析一致（canonical fp 相同）', () => {
    const direct = asSuccess(
      formatScreenplay({ text: `${JA_SAMPLE}\n\n${CN_SAMPLE}`, output: 'blocks_only' }, deps),
    );
    const asDoc = direct.blocks!.map((b) => ({ type: b.type as DocumentBlock['type'], text: b.text }));
    const fountain = blocksToFountain(asDoc);
    const back = fountainToBlocks(fountain);
    const backAsDoc = back.blocks.map((b) => ({ type: b.type as DocumentBlock['type'], text: b.text }));
    expect(backAsDoc.map((b) => [b.type, b.text])).toEqual(asDoc.map((b) => [b.type, b.text]));
    expect(fp(backAsDoc)).toBe(fp(asDoc));
  });
});
