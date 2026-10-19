// P7-2 移植层金样例对照：期望值全部由主仓库 Python 纯函数实际运行产出
// （tools/golden-gen.py @ 主仓库 9c781b16）。TS 移植必须逐字段复算一致——
// 这是「移植件行为 = 主仓库行为」的机器证明（替代复制件的快照纪律）。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  wordsExecutor,
  dialogueRatioExecutor,
  scenesExecutor,
  charactersExecutor,
  actionDensityExecutor,
  splitByScene,
  manuscriptBlocks,
} from '../../src/analysis/executors';
import {
  sceneBlocks,
  renderSceneMaterial,
  sceneContentFingerprint,
  mapEvidence,
  EVIDENCE_MAP_VERSION,
  type SnapshotPayload,
} from '../../src/analysis/scene-material';
import {
  SCENE_SCHEMA_VERSION,
  PROBLEM_TYPES,
  SEVERITIES,
} from '../../src/analysis/scene-contract';
import { isRenderingKey, findRenderingKeys } from '../../src/analysis/render-guard';
import {
  ANALYZER_VERSION,
  normalizeCharacterName,
  charCount,
  dialogueRatio,
  actionDensity,
  countScenes,
  characterAppearances,
} from '../../src/analysis/scoring';
import {
  AI_SCORING_VERSION,
  RULE_BASELINE_VERSION,
  SEVERITY_WEIGHTS,
  computeSceneScore,
  ruleBaseline,
  scoreAiFindings,
} from '../../src/analysis/scene-score';

const golden = JSON.parse(
  readFileSync(new URL('./fixtures/golden.json', import.meta.url), 'utf8'),
) as {
  meta: { main_repo_head: string };
  payloads: Record<'zh' | 'en' | 'no_scene', SnapshotPayload>;
  executors: Record<string, Record<string, unknown[]>>;
  scene_material: Record<string, any>;
  scoring: Record<string, any>;
  render_guard: Record<string, any>;
  score_ai_findings: Record<string, unknown[]>;
  score_ai_findings_inputs: Record<string, Record<string, unknown>>;
};

describe('金样例：版本常量', () => {
  it('与主仓库一致', () => {
    const v = golden.scene_material.versions;
    expect(EVIDENCE_MAP_VERSION).toBe(v.evidence_map);
    expect(SCENE_SCHEMA_VERSION).toBe(v.scene_schema);
    expect(ANALYZER_VERSION).toBe(v.analyzer);
    expect(AI_SCORING_VERSION).toBe(v.ai_scoring);
    expect(RULE_BASELINE_VERSION).toBe(v.rule_baseline);
    expect(SEVERITY_WEIGHTS).toEqual({ low: 0.25, medium: 0.5, high: 1.0 });
    expect(PROBLEM_TYPES).toHaveLength(6);
    expect(SEVERITIES).toEqual(['low', 'medium', 'high']);
  });
});

describe('金样例：五个统计执行器', () => {
  const runners = {
    words: wordsExecutor,
    dialogue_ratio: dialogueRatioExecutor,
    scenes: scenesExecutor,
    characters: charactersExecutor,
    action_density: actionDensityExecutor,
  } as const;

  for (const payloadName of ['zh', 'en', 'no_scene'] as const) {
    it(`payload=${payloadName} 五项全一致`, () => {
      const payload = golden.payloads[payloadName];
      const expected = golden.executors[payloadName]!;
      for (const [feature, runner] of Object.entries(runners)) {
        expect(runner(payload), `${payloadName}/${feature}`).toEqual(expected[feature]);
      }
    });
  }
});

describe('金样例：scene_material', () => {
  it('sceneBlocks / renderSceneMaterial / fingerprint 与 Python 一致', () => {
    const sm = golden.scene_material;
    expect(sceneBlocks(golden.payloads.zh, 's1')).toEqual(sm.scene_blocks_zh_s1);
    expect(sceneBlocks(golden.payloads.zh, 's2')).toEqual(sm.scene_blocks_zh_s2);
    expect(sceneBlocks(golden.payloads.zh, 'sX')).toEqual(sm.scene_blocks_zh_missing);
    expect(sceneBlocks(golden.payloads.en, 's1')).toEqual(sm.scene_blocks_en_s1);
    expect(renderSceneMaterial(golden.payloads.zh, 's1')).toBe(sm.render_zh_s1);
    expect(renderSceneMaterial(golden.payloads.en, 's1')).toBe(sm.render_en_s1);
    const s1 = sceneBlocks(golden.payloads.zh, 's1');
    expect(sceneContentFingerprint(s1)).toBe(sm.fingerprint_zh_s1);
    expect(sceneContentFingerprint([...s1].reverse())).toBe(sm.fingerprint_zh_s1_reordered);
  });

  it('mapEvidence 十四种输入路径一致（含越界/歧义/跨块/空白折叠）', () => {
    const blocks = sceneBlocks(golden.payloads.zh, 's1');
    for (const { case: c, block_ids, reason } of golden.scene_material.map_evidence) {
      const result = mapEvidence({ evidence: c.evidence, citedOrdinals: c.cited, blocks });
      expect({ block_ids: result.blockIds, reason: result.reason }).toEqual({ block_ids: block_ids, reason });
    }
  });
});

describe('金样例：scoring 纯函数', () => {
  it('normalizeCharacterName（含全角空格与折叠）', () => {
    for (const { raw, normalized } of golden.scoring.normalize_character_name) {
      expect(normalizeCharacterName(raw)).toBe(normalized);
    }
  });

  it('charCount 按码点计（emoji 不按 UTF-16 双单元）', () => {
    for (const { text, count } of golden.scoring.char_count) {
      expect(charCount(text)).toBe(count);
    }
  });

  it('computeSceneScore 精确分数复算（含重叠取最大强度与 half-up 边界）', () => {
    for (const { spans, chars, score } of golden.scoring.compute_scene_score) {
      expect(computeSceneScore(spans, chars)).toBe(score);
    }
  });

  it('ruleBaseline 指标一致', () => {
    const s1 = sceneBlocks(golden.payloads.zh, 's1');
    expect(ruleBaseline(s1)).toEqual(golden.scoring.rule_baseline_zh_s1);
    expect(ruleBaseline([])).toEqual(golden.scoring.rule_baseline_empty);
  });

  it('聚合口径（dialogueRatio/actionDensity/countScenes/characterAppearances）与执行器同源', () => {
    // 执行器口径丢弃首个场景头之前的前导块；纯函数对传入列表全量计算，
    // 因此聚合对齐须用「有场归属」的块集合（splitByScene 之后）。
    const anchored = splitByScene(manuscriptBlocks(golden.payloads.zh)).flatMap(([, bs]) => bs);
    const words = wordsExecutor(golden.payloads.zh);
    const density = actionDensityExecutor(golden.payloads.zh);
    const scenes = countScenes(anchored);
    const actionChars = density.reduce((s, c) => s + (c.payload.value as number), 0);
    const totalChars = words.reduce((s, c) => s + (c.payload.value as number), 0);
    expect(actionDensity(anchored)).toBeCloseTo(actionChars / scenes, 12);
    expect(anchored.reduce((s, b) => s + charCount(typeof b.text === 'string' ? b.text : ''), 0)).toBe(totalChars);
    expect(characterAppearances(anchored)['常家青']).toBe(2);
    expect(dialogueRatio([])).toBe(0.0);
  });
});

describe('金样例：render_guard', () => {
  it('isRenderingKey 整词/camelCase 切词一致', () => {
    for (const [key, expected] of Object.entries(golden.render_guard.keys)) {
      if (key === '123') {
        expect(isRenderingKey(123)).toBe(expected);
      } else {
        expect(isRenderingKey(key), key).toBe(expected);
      }
    }
  });

  it('findRenderingKeys 递归路径一致；字符串值不扫描', () => {
    for (const { value, hits } of golden.render_guard.find) {
      expect(findRenderingKeys(value)).toEqual(hits);
    }
  });
});

describe('金样例：scoreAiFindings（ai-2.0）', () => {
  for (const [name, modelOutput] of Object.entries(golden.score_ai_findings_inputs)) {
    it(`${name} 结论逐字段一致`, () => {
      const result = scoreAiFindings(modelOutput, 's1', golden.payloads.zh);
      expect(result).toEqual(golden.score_ai_findings[name]);
    });
  }

  it('重复举证顺序无关（问题结论与分数逐字节一致；总结文案本就不同）', () => {
    const stripSummaryText = (cs: ReturnType<typeof scoreAiFindings>) =>
      cs.map((c) =>
        c.payload.label === 'summary'
          ? { ...c, payload: { label: 'summary', details: { ...(c.payload.details as object), text: '' } } }
          : c,
      );
    const lowFirst = stripSummaryText(scoreAiFindings(golden.score_ai_findings_inputs.duplicate_low_first!, 's1', golden.payloads.zh));
    const highFirst = stripSummaryText(scoreAiFindings(golden.score_ai_findings_inputs.duplicate_high_first!, 's1', golden.payloads.zh));
    expect(lowFirst).toEqual(highFirst);
  });
});
