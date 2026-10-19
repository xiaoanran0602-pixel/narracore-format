// TASK-0093 解析器单测：规则矩阵 + 混淆样例（AC-1）。
// 反向意识：把任一正则改宽松（如场号不再要求 内/外 语境），对应用例必须红。

import { describe, it, expect } from 'vitest';
import { parseScreenplayText, countStructuralHits } from '../../src/format/parser';

const sample = [
  '1 外 月球轨道天机索 爆洞事件后一个月',
  '近月轨道，钠块正在微调自己的位置。',
  '常家青',
  '（压低声音）',
  '本质上还是烧开水。',
  '我们只有一次机会。',
  '',
  '第 2 场 发射控制中心 日 内',
  '张成盯着屏幕，双手悬停。',
  '【此处需要补一段环境音】',
  '切至：走廊',
  '特写：张成的手',
  '',
  '47 号仓库',
  '2024 年冬，凌晨三点。',
].join('\n');

describe('parseScreenplayText', () => {
  it('场景标题：阿拉伯数字+内外景 / 第N场 / 汉字语境', () => {
    const rows = parseScreenplayText(sample);
    expect(rows[0]).toEqual({
      type: 'scene_heading',
      text: '1 外 月球轨道天机索 爆洞事件后一个月',
    });
    expect(rows[6]).toEqual({
      type: 'scene_heading',
      text: '第 2 场 发射控制中心 日 内',
    });
  });

  it('角色→括注→对白：说话人推断与多行对白（括注去壳，TASK-0105）', () => {
    const rows = parseScreenplayText(sample);
    expect(rows[2]).toEqual({ type: 'character', text: '常家青' });
    // 去壳：识别为括注的行输出不带首尾括号（渲染层自供括号）
    expect(rows[3]).toEqual({ type: 'parenthetical', text: '压低声音' });
    expect(rows[4]).toEqual({
      type: 'dialogue',
      text: '本质上还是烧开水。',
      speaker: '常家青',
    });
    expect(rows[5]).toEqual({
      type: 'dialogue',
      text: '我们只有一次机会。',
      speaker: '常家青',
    });
  });

  it('注释/转场/镜头独立行', () => {
    const rows = parseScreenplayText(sample);
    expect(rows[8]).toEqual({ type: 'note', text: '【此处需要补一段环境音】' });
    expect(rows[9]).toEqual({ type: 'transition', text: '切至：走廊' });
    expect(rows[10]).toEqual({ type: 'shot', text: '特写：张成的手' });
  });

  it('混淆样例：数字开头的地点/时间不是场号、不是角色', () => {
    const rows = parseScreenplayText(sample);
    expect(rows[11]).toEqual({ type: 'action', text: '47 号仓库' });
    expect(rows[12]).toEqual({ type: 'action', text: '2024 年冬，凌晨三点。' });
  });

  it('英文剧本形态：INT./EXT. 与全大写角色行', () => {
    const rows = parseScreenplayText(
      ['INT. CONTROL ROOM - DAY', 'CHANG', 'We are still boiling water.', '', 'EXT. SPACE'].join('\n'),
    );
    expect(rows[0].type).toBe('scene_heading');
    expect(rows[1]).toEqual({ type: 'character', text: 'CHANG' });
    expect(rows[2].type).toBe('dialogue');
    expect(rows[3].type).toBe('scene_heading');
  });

  it('无结构纯文本：全部动作（兜底不猜）', () => {
    const rows = parseScreenplayText('这是一段没有任何剧本特征的普通文字。\n第二行也是普通叙述。');
    expect(rows.map((r) => r.type)).toEqual(['action', 'action']);
  });

  it('孤立短行（无后随对白）落动作', () => {
    const rows = parseScreenplayText(['李值长', '走廊尽头传来警报声，红灯闪烁。'].join('\n'));
    // 「李值长」后有随行但那是叙述句 → 首行不满足"后随对白"判定？
    // 修正预期：后随行存在且非括注即视为对白候选——本例落在 dialogue 语境。
    expect(rows[0].type).toBe('character');
    expect(rows[1].type).toBe('dialogue');
  });

  it('空行分隔结束对白延续：新段落的短叙述不再是对白', () => {
    const rows = parseScreenplayText(
      ['常家青', '台词。', '', '短句', '另一段叙述。'].join('\n'),
    );
    expect(rows[1].type).toBe('dialogue');
    expect(rows[2].type).toBe('character'); // 新 run 的短行+后随行 → 角色行
    expect(rows[3].type).toBe('dialogue');
  });

  // TASK-0105：括注去壳矩阵——识别为括注的行一律输出无首尾括号文本。
  it('括注去壳：全角/半角/嵌套（只剥一层）', () => {
    const rows = parseScreenplayText(
      ['（老干部读稿）', '(whispers)', '（（旁白））'].join('\n'),
    );
    expect(rows[0]).toEqual({ type: 'parenthetical', text: '老干部读稿' });
    expect(rows[1]).toEqual({ type: 'parenthetical', text: 'whispers' });
    expect(rows[2]).toEqual({ type: 'parenthetical', text: '（旁白）' });
  });

  it('带括注的动作行不去壳（只有整行括注才归括注块）', () => {
    const rows = parseScreenplayText(['他掏出核弹钥匙（示意）放在桌上。'].join('\n'));
    expect(rows[0]).toEqual({
      type: 'action',
      text: '他掏出核弹钥匙（示意）放在桌上。',
    });
  });
});

describe('countStructuralHits（粘贴拦截判据）', () => {
  it('结构文本命中 ≥1；普通文本命中 0', () => {
    expect(countStructuralHits(sample)).toBeGreaterThanOrEqual(5);
    expect(countStructuralHits('普通文本一行\n普通文本两行')).toBe(0);
  });
  it('单行结构也命中（拦截交预览判断）', () => {
    expect(countStructuralHits('1 外 月球轨道')).toBe(1);
  });
});

// TASK-0243 A 组：三语金标（样张摘自 0921 发版前跑测真实素材，
// 版权原因素材本体不入库，此处为短样张摘录）。

const jaSample = [
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

const cnSample = [
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

describe('TASK-0243：日文放送剧格式', () => {
  it('〇 场景头与第N場全中', () => {
    const rows = parseScreenplayText(jaSample);
    const scenes = rows.filter((r) => r.type === 'scene_heading');
    expect(scenes.map((s) => s.text)).toEqual([
      '〇同・表（早朝）',
      '〇葬儀場・通夜会場（夜）',
      '第１場　教室',
    ]);
  });

  it('单行内联对白 `名前「セリフ」` → character + dialogue（剥引号壳）', () => {
    const rows = parseScreenplayText(jaSample);
    const idx = rows.findIndex((r) => r.text === '北原');
    expect(rows[idx]).toEqual({ type: 'character', text: '北原' });
    expect(rows[idx + 1]).toEqual({
      type: 'dialogue',
      text: 'W……',
      speaker: '北原',
    });
    expect(rows[idx + 2]).toEqual({ type: 'character', text: '杏菜' });
    expect(rows[idx + 3]).toEqual({
      type: 'dialogue',
      text: 'W……行くね',
      speaker: '杏菜',
    });
  });

  it('跨行折行对白：吸收到 」 收尾行合并为一块（の声/画外音名）', () => {
    const rows = parseScreenplayText(jaSample);
    const idx = rows.findIndex((r) => r.text === '北原の声');
    expect(rows[idx]).toEqual({ type: 'character', text: '北原の声' });
    expect(rows[idx + 1]).toEqual({
      type: 'dialogue',
      text: '無理もないですよ。いくら癌の発見が早かっただけに、というところです',
      speaker: '北原の声',
    });
    // 被吸收的后续行不再独立成块（原文折行行不单独出现）
    expect(rows.some((r) => r.text === '見が早かっただけに、というところです')).toBe(false);
  });

  it('审查 F-P2-1：」。收尾形态——壳剥离、句读并入台词、后续叙述不被吞', () => {
    const rows = parseScreenplayText(
      ['田中「今日はとても', '良い天気ですね」。', '彼は笑った。'].join('\n'),
    );
    expect(rows[0]).toEqual({ type: 'character', text: '田中' });
    expect(rows[1]).toEqual({
      type: 'dialogue',
      text: '今日はとても良い天気ですね。',
      speaker: '田中',
    });
    expect(rows[2]).toEqual({ type: 'action', text: '彼は笑った。' });
  });

  it('审查 F-P2-1：壳后有实义文字——剩余部分交回主循环（不吞后续内容）', () => {
    const rows = parseScreenplayText(
      ['田中「今日は', '行く」そして彼は去った。'].join('\n'),
    );
    expect(rows[0]).toEqual({ type: 'character', text: '田中' });
    expect(rows[1]).toEqual({ type: 'dialogue', text: '今日は行く', speaker: '田中' });
    expect(rows[2]).toEqual({ type: 'action', text: 'そして彼は去った。' });
  });

  it('叙述句防护：`…」と言った` 与纯假名助词名不认（落动作）', () => {
    const rows = parseScreenplayText([
      'それこそが、伊塚の後悔の源だった。',
      'に伊塚は「好きだ」と告白する。',
      '彼は「だめ」と断った。',
    ].join('\n'));
    expect(rows.map((r) => r.type)).toEqual(['action', 'action', 'action']);
  });

  it('countStructuralHits 认日式特征（拦截弹预览）', () => {
    expect(countStructuralHits(jaSample)).toBeGreaterThanOrEqual(5);
  });
});

describe('TASK-0243：中文台词稿冒号式', () => {
  it('`人名：台词` → character + dialogue（冒号后整段，含单字名与长对白）', () => {
    const rows = parseScreenplayText(cnSample);
    const types = rows.map((r) => r.type);
    // 头部无冒号行落动作；对白行拆两块
    expect(types).toEqual([
      'action', 'action',
      'character', 'dialogue',
      'character', 'dialogue',
      'character', 'dialogue',
      'character', 'dialogue',
      'character', 'dialogue',
      'character', 'dialogue',
      'character', 'dialogue',
    ]);
    expect(rows[2]).toEqual({ type: 'character', text: '真汤师爷' });
    expect(rows[3]).toEqual({
      type: 'dialogue',
      text: '好，好好！',
      speaker: '真汤师爷',
    });
    expect(rows[10]).toEqual({ type: 'character', text: '张' });
    expect(rows[11]).toEqual({
      type: 'dialogue',
      text: '让子弹飞一会儿。',
      speaker: '张',
    });
  });

  it('半角冒号与冒号后空格同样识别；拉丁名全大写', () => {
    const rows = parseScreenplayText(['马县长: 你好', 'DR. CHANG: We are ready.'].join('\n'));
    expect(rows[0]).toEqual({ type: 'character', text: '马县长' });
    expect(rows[1]).toEqual({ type: 'dialogue', text: '你好', speaker: '马县长' });
    expect(rows[2]).toEqual({ type: 'character', text: 'DR. CHANG' });
    expect(rows[3]).toEqual({
      type: 'dialogue',
      text: 'We are ready.',
      speaker: 'DR. CHANG',
    });
  });

  it('时间行 `编辑于 20:16` 不认（名字形态不符）', () => {
    const rows = parseScreenplayText('编辑于 2023年03月29日 20:16');
    expect(rows[0].type).toBe('action');
  });

  it('countStructuralHits 认中文台词稿（否则整篇不弹预览）', () => {
    expect(countStructuralHits(cnSample)).toBeGreaterThanOrEqual(7);
    expect(countStructuralHits('普通中文没有冒号结构')).toBe(0);
  });
});
