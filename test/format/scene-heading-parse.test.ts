// scene-heading-parse 特征测试（P7-1）。主仓库对该文件无专门单测（仅集成
// 测试间接使用），本文件为 MCP 侧自写的特征锁定：源文件为逐字复制件，
// 此处断言的是「复制件行为 = 主仓库行为」，主仓库同步时随快照纪律重跑。

import { describe, expect, it } from 'vitest';
import { parseSceneHeading } from '../../src/format/scene-heading-parse';

describe('parseSceneHeading（中文场景头）', () => {
  it('「场 1 咖啡馆 日 内」→ 场号/地点/时段/内外 全解析', () => {
    expect(parseSceneHeading('场 1 咖啡馆 日 内')).toEqual({
      sceneLabel: '场 1',
      location: '咖啡馆',
      timeOfDay: '日',
      interior: '内',
    });
  });

  it('「第一场 夜 内 城市天台」→ 词序自由：时段/内外先于地点', () => {
    expect(parseSceneHeading('第一场 夜 内 城市天台')).toEqual({
      sceneLabel: '第一场',
      location: '城市天台',
      timeOfDay: '夜',
      interior: '内',
    });
  });

  it('场号形式：跨 token「场 7」识别；同 token「场7」（数字在后）不识别，归入地点', () => {
    // 特征锁定：场号正则为 /^第?([0-9一二三四五六七八九十百千]+)场$/（场在尾），
    // 同 token 的「场7」不匹配 → 当作地点一部分；上游分析层据此理解主仓库行为。
    expect(parseSceneHeading('场 7 城门 日 外')?.sceneLabel).toBe('场 7');
    expect(parseSceneHeading('场7 城门 日 外')).toEqual({
      sceneLabel: null,
      location: '场7 城门',
      timeOfDay: '日',
      interior: '外',
    });
    expect(parseSceneHeading('第3场 码头 夜 内')?.sceneLabel).toBe('第3场');
    expect(parseSceneHeading('十二场 城楼 日 外')?.sceneLabel).toBe('十二场');
  });

  it('带空格的三段式「第 1 场」不识别（上游局限；MCP 侧由 analyze 前置层压缩处理）', () => {
    // 主仓库编辑器内写法为「第1场」（无空格），故复制件不识别三段式——
    // MCP 文本模式解析器识别「第 N 场」，analyze 工具在复制件外做空格压缩。
    expect(parseSceneHeading('第 1 场 实验室 日 内')).toEqual({
      sceneLabel: null,
      location: '第 1 场 实验室',
      timeOfDay: '日',
      interior: '内',
    });
  });

  it('中文时段扩展词（傍晚/清晨/黎明/黄昏）识别', () => {
    expect(parseSceneHeading('第一场 码头 傍晚 外')?.timeOfDay).toBe('傍晚');
  });

  it('普通动作短句也会把主体当地点（调用方须仅在 scene_heading 上调用）', () => {
    // 特征锁定：parseChinese 以「有地点即成功」为准，不判别是否场景头；
    // 上游（分析层）只对 scene_heading 块文本调用本函数。
    expect(parseSceneHeading('他走进来')).toEqual({
      sceneLabel: null,
      location: '他走进来',
      timeOfDay: null,
      interior: null,
    });
  });

  it('仅「内/外」单字 → 无场号无地点 → null', () => {
    expect(parseSceneHeading('内')).toBeNull();
    expect(parseSceneHeading('')).toBeNull();
    expect(parseSceneHeading('   ')).toBeNull();
  });
});

describe('parseSceneHeading（英文场景头）', () => {
  it('INT. CAFE - DAY → 地点/时段/内外（时段映射为中文语义值）', () => {
    expect(parseSceneHeading('INT. CAFE - DAY')).toEqual({
      sceneLabel: null,
      location: 'CAFE',
      timeOfDay: '日',
      interior: '内',
    });
  });

  it('EXT. ROOFTOP - NIGHT → 外/夜', () => {
    expect(parseSceneHeading('EXT. ROOFTOP - NIGHT')).toEqual({
      sceneLabel: null,
      location: 'ROOFTOP',
      timeOfDay: '夜',
      interior: '外',
    });
  });

  it('INT/EXT 与 I/E 前缀、MORNING/DUSK 映射', () => {
    expect(parseSceneHeading('INT/EXT STREET - MORNING')?.interior).toBe('内');
    expect(parseSceneHeading('INT/EXT STREET - MORNING')?.timeOfDay).toBe('晨');
    expect(parseSceneHeading('I/E BRIDGE - DUSK')?.interior).toBe('内');
    expect(parseSceneHeading('I/E BRIDGE - DUSK')?.timeOfDay).toBe('昏');
  });

  it('英文格式缺破折号分隔 → null（解析失败）', () => {
    expect(parseSceneHeading('INT. CAFE DAY')).toBeNull();
  });
});
