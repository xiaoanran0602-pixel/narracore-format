// analyze_screenplay 工具（开源版，自私有仓 narracore-mcp 适配；计费层剥离）：
// 五项确定性统计 + 场景清单 + 角色戏份表。逐场口径来自主仓库 analysis 执行器
// 移植（src/analysis/，金样例锁定），场景头结构化字段来自 scene-heading-parse
// 复制件；角色对白统计由回显 blocks 的 speaker 驱动。

import { createHash } from 'node:crypto';
import { prepareInput, withUsageHint, type Prepared, type ToolDeps } from './format-screenplay';
import { documentBlocksToPayload } from '../analysis/adapter';
import {
  wordsExecutor,
  dialogueRatioExecutor,
  scenesExecutor,
  charactersExecutor,
  actionDensityExecutor,
  splitByScene,
  manuscriptBlocks,
} from '../analysis/executors';
import { ANALYZER_VERSION, normalizeCharacterName, dialogueRatio, actionDensity, pyRound } from '../analysis/scoring';
import { parseSceneHeading, type ParsedSceneHeading } from '../format/scene-heading-parse';
import type { Diagnostic, ValidationStatus } from './diagnostics';
import type { BlockInput } from './blocks-input';
import { MANUAL_URL } from '../brand';

/**
 * 场景头结构化（复制件前置层）：主仓库 parseSceneHeading 只识别「第N场」
 * （无空格）与「场 N」（跨两 token），不识别文本模式常见的「第 1 场」
 * 三段式；这里先把场号段压缩再去解析——不修改复制件本身（复制纪律）。
 */
export function parseHeadingStructured(text: string): ParsedSceneHeading | null {
  const collapsed = text.replace(
    /^(第)\s+([0-9一二三四五六七八九十百千]+)\s+(场)(?=\s|$)/,
    '$1$2$3',
  );
  return parseSceneHeading(collapsed);
}

export interface AnalyzeInput {
  input_format?: 'text' | 'blocks';
  text?: string;
  blocks?: BlockInput[];
  request_id?: string;
}

export interface SceneRow {
  scene: number;
  scene_id: string;
  heading: string;
  parsed: {
    scene_label: string | null;
    location: string | null;
    time_of_day: string | null;
    interior: string | null;
  } | null;
  block_count: number;
  chars: number;
  dialogue_ratio: number;
  action_chars: number;
  characters: string[];
}

export interface CharacterRow {
  name: string;
  /** 人物行（character 块）出现次数（主仓库 appearances 口径） */
  cue_count: number;
  /** 出场场次数（人物行或对白任一出现即计入） */
  scenes_present: number;
  dialogue_lines: number;
  dialogue_chars: number;
  /** 该角色对白字数 / 全篇对白字数（4 位小数；无对白为 0） */
  share_of_dialogue: number;
}

export interface AnalyzeSuccess {
  ok: true;
  tool: 'analyze_screenplay';
  analyzer_version: string;
  validation_status: ValidationStatus;
  diagnostics: Diagnostic[];
  totals: {
    scenes: number;
    chars: number;
    dialogue_ratio: number;
    action_density: number;
    characters: number;
    /** 首个场景标题之前的块数（主仓库口径不计入任何场） */
    leading_blocks: number;
  };
  scenes: SceneRow[];
  characters: CharacterRow[];
  next_step: string;
  request_id: string;
}

export type AnalyzeFailure = {
  ok: false;
  reason: 'missing_text' | 'text_too_long' | 'nothing_to_format' | 'invalid_blocks';
  message: string;
  request_id?: string;
  contract_version?: string;
  diagnostics?: Diagnostic[];
};

/** 本工具的引导句（英文正本）。 */
const ANALYZE_USAGE_HINT = `Send the screenplay as {"text": "..."} or the same "blocks" you received from format_screenplay — full manual: ${MANUAL_URL}`;

export function analyzeScreenplay(input: AnalyzeInput, deps: ToolDeps): AnalyzeSuccess | AnalyzeFailure {
  // ---- 准备：复用 format 管线（解析/校验/诊断/回显 speaker） ----
  const prepared = prepareInput(input, deps);
  if (!prepared.ok) return withUsageHint(prepared as AnalyzeFailure, ANALYZE_USAGE_HINT);

  const requestSource =
    (input.input_format ?? 'text') === 'blocks' ? JSON.stringify(input.blocks) : (input.text as string);
  const requestHash = createHash('sha256').update(`analyze|${requestSource}`).digest('hex');
  const requestId = input.request_id ?? requestHash.slice(0, 32);

  // 结构化输入存在 error 级诊断 → 不做分析（与 format 同判）
  if (prepared.hasErrors) {
    return {
      ok: false,
      reason: 'invalid_blocks',
      message: 'Structured input failed validation — fix the diagnostics and submit again.',
      diagnostics: prepared.diagnostics,
      request_id: requestId,
    };
  }

  const analysis = computeAnalysis(prepared);

  return {
    ok: true,
    tool: 'analyze_screenplay',
    analyzer_version: ANALYZER_VERSION,
    validation_status: prepared.validationStatus,
    diagnostics: prepared.diagnostics,
    totals: analysis.totals,
    scenes: analysis.scenes,
    characters: analysis.characters,
    next_step:
      'Next: call diagnose_scenes mode="material" for a per-scene shootability checklist — pass the same screenplay or its returned blocks (all tools here are free and local).',
    request_id: requestId,
  };
}

/** 组装分析结果：逐场口径全部来自移植执行器（金样例锁定），聚合与角色表在其上组合。 */
function computeAnalysis(prepared: Prepared): {
  totals: AnalyzeSuccess['totals'];
  scenes: SceneRow[];
  characters: CharacterRow[];
} {
  const { payload, sceneHeadings } = documentBlocksToPayload(prepared.renderBlocks);

  const words = wordsExecutor(payload);
  const ratios = dialogueRatioExecutor(payload);
  const sceneRows = scenesExecutor(payload);
  const characterRows = charactersExecutor(payload);
  const actionChars = actionDensityExecutor(payload);

  const perSceneCharacters = new Map<string, string[]>();
  for (const conclusion of characterRows) {
    const list = perSceneCharacters.get(conclusion.scene_id) ?? [];
    const label = (conclusion.payload as { label?: string }).label;
    if (typeof label === 'string') list.push(label);
    perSceneCharacters.set(conclusion.scene_id, list);
  }

  const scenes: SceneRow[] = sceneHeadings.map((heading, index) => {
    const parsed = parseHeadingStructured(heading.text);
    const sceneId = heading.sceneId;
    const [, sceneBlockList] = splitByScene(manuscriptBlocks(payload))[index] ?? [null, []];
    return {
      scene: index + 1,
      scene_id: sceneId,
      heading: heading.text,
      parsed:
        parsed === null
          ? null
          : {
              scene_label: parsed.sceneLabel,
              location: parsed.location,
              time_of_day: parsed.timeOfDay,
              interior: parsed.interior,
            },
      block_count: sceneBlockList.length,
      chars: (words[index]?.payload.value as number) ?? 0,
      dialogue_ratio: (ratios[index]?.payload.value as number) ?? 0,
      action_chars: (actionChars[index]?.payload.value as number) ?? 0,
      characters: perSceneCharacters.get(sceneId) ?? [],
    };
  });

  // 聚合：只用有场归属的块（与逐场口径一致；前导块单独上报）
  const anchored = splitByScene(manuscriptBlocks(payload)).flatMap(([, blocks]) => blocks);
  const allBlocks = manuscriptBlocks(payload);
  const leadingBlocks = allBlocks.length - anchored.length;

  // 角色表：出场口径来自执行器（人物行计数）；对白口径来自回显 speaker
  const cueCounts = new Map<string, number>();
  for (const conclusion of characterRows) {
    const label = (conclusion.payload as { label?: string }).label ?? '';
    cueCounts.set(label, (cueCounts.get(label) ?? 0) + ((conclusion.payload.value as number) ?? 0));
  }

  const dialogueStats = new Map<string, { lines: number; chars: number; scenes: Set<number> }>();
  let sceneCursor = 0;
  let totalDialogueChars = 0;
  for (const block of prepared.echoed) {
    if (block.type === 'scene_heading') sceneCursor += 1;
    if (block.type !== 'dialogue' || block.speaker === undefined) continue;
    const name = normalizeCharacterName(block.speaker);
    if (!name) continue;
    const entry = dialogueStats.get(name) ?? { lines: 0, chars: 0, scenes: new Set<number>() };
    entry.lines += 1;
    entry.chars += Array.from(block.text).length;
    entry.scenes.add(sceneCursor);
    dialogueStats.set(name, entry);
    totalDialogueChars += Array.from(block.text).length;
  }
  // 人物行块计入出场场景（无对白的角色也进表）
  const nameScenes = new Map<string, Set<number>>();
  sceneCursor = 0;
  for (const block of prepared.echoed) {
    if (block.type === 'scene_heading') sceneCursor += 1;
    if (block.type === 'character') {
      const name = normalizeCharacterName(block.text);
      if (!name) continue;
      const set = nameScenes.get(name) ?? new Set<number>();
      set.add(sceneCursor);
      nameScenes.set(name, set);
    }
  }

  const names = new Set<string>([...cueCounts.keys(), ...dialogueStats.keys()]);
  const characters: CharacterRow[] = [...names]
    .map((name) => {
      const dialogue = dialogueStats.get(name);
      const scenesPresent = new Set<number>([
        ...(nameScenes.get(name) ?? []),
        ...(dialogue?.scenes ?? []),
      ]);
      return {
        name,
        cue_count: cueCounts.get(name) ?? 0,
        scenes_present: scenesPresent.size,
        dialogue_lines: dialogue?.lines ?? 0,
        dialogue_chars: dialogue?.chars ?? 0,
        share_of_dialogue:
          totalDialogueChars > 0 && dialogue
            ? pyRound(dialogue.chars / totalDialogueChars, 4)
            : 0.0,
      };
    })
    .sort((a, b) => b.dialogue_chars - a.dialogue_chars || b.cue_count - a.cue_count);

  return {
    totals: {
      scenes: sceneRows.length,
      chars: words.reduce((sum, c) => sum + ((c.payload.value as number) ?? 0), 0),
      dialogue_ratio: scenes.length > 0 ? pyRound(dialogueRatio(anchored), 6) : 0.0,
      action_density: pyRound(actionDensity(anchored), 6),
      characters: names.size,
      leading_blocks: leadingBlocks,
    },
    scenes,
    characters,
  };
}

/** 面向 AI 的一段说明文本（content[0]）。 */
export function summarizeAnalyzeForAi(result: AnalyzeSuccess): string {
  const top = result.characters.slice(0, 3).map((c) => `${c.name} (${c.dialogue_lines} lines)`);
  const parts = [
    `Analyzed ${result.totals.scenes} scene(s), ${result.totals.characters} character(s), ${result.totals.chars} chars (analyzer ${result.analyzer_version}).`,
    `Dialogue ratio ${result.totals.dialogue_ratio}; top speakers: ${top.length > 0 ? top.join(', ') : 'none'}.`,
  ];
  if (result.totals.leading_blocks > 0) {
    parts.push(
      `${result.totals.leading_blocks} block(s) before the first scene heading are not attributed to any scene (analyzer convention).`,
    );
  }
  if (result.validation_status !== 'ok') {
    parts.push(`${result.diagnostics.length} diagnostic(s) — review them with the user.`);
  }
  parts.push(result.next_step);
  return parts.join(' ');
}
