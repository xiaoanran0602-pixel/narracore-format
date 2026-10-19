// diagnose_scenes 工具（开源版，自私有仓 narracore-mcp 适配；计费层剥离——
// score 档在开源包同样免费）：影视化度诊断——「客户端 AI 举证、程序算分」
// （服务端无 LLM，调用方 AI 即「模型」）。两档：
// - mode=material：逐场编号素材 + 严格 Schema + 问题类型表，供客户端
//   AI 逐场举证（引用块序号 + 逐字引用证据）；
// - mode=score：对提交的 findings 做校验、证据映射、逐场 0–100 计分
//   （严重度加权证据覆盖率，BigInt 精确分数）与规则基线对比。
// 全部计分逻辑来自 src/analysis/ 移植件（金样例锁定），本文件只做装配。

import { createHash } from 'node:crypto';
import { prepareInput, withUsageHint, type ToolDeps } from './format-screenplay';
import { documentBlocksToPayload } from '../analysis/adapter';
import {
  renderSceneMaterial,
  sceneBlocks,
  EVIDENCE_MAP_VERSION,
} from '../analysis/scene-material';
import {
  PROBLEM_TYPES,
  SCENE_ANALYSIS_SCHEMA,
  SCENE_SCHEMA_VERSION,
} from '../analysis/scene-contract';
import { AI_SCORING_VERSION, scoreAiFindings, type Conclusion } from '../analysis/scene-score';
import type { BlockInput } from './blocks-input';
import { pyRound } from '../analysis/scoring';
import { MANUAL_URL } from '../brand';

/** 问题类型的简述（枚举键来自主仓库；描述为给客户端 AI 的说明文案）。 */
const PROBLEM_TYPE_DESCRIPTIONS: Record<string, string> = {
  abstract_psychology:
    'Inner states the camera cannot shoot directly (should be externalized into action or dialogue).',
  literary_summary:
    'Literary narration/summary instead of filmable, concrete events on screen.',
  unfilmable_information:
    'Information the audience cannot get from what is seen or heard (backstory dumped as action, unshootable captions).',
  unclear_space:
    'Spatial relationships are unclear — the scene cannot be staged or blocked.',
  weak_visible_action:
    'The visible action is weak; nothing concrete for actors to do on camera.',
  unplayable_direction:
    'Directions that cannot be executed in production (camera/editing instructions written into the script).',
};

/**
 * mode 枚举正本：schema describe 与 handler 校验同源引用，不在两处手写。
 */
export const DIAGNOSE_MODES = ['material', 'score'] as const;
export type DiagnoseMode = (typeof DIAGNOSE_MODES)[number];

export interface DiagnoseInput {
  input_format?: 'text' | 'blocks';
  text?: string;
  blocks?: BlockInput[];
  request_id?: string;
  mode: DiagnoseMode;
  /** material 档：只出这些场（1 起，默认全部） */
  scenes?: number[];
  /** score 档：客户端 AI 的逐场结论（scene = material 返回的场号） */
  findings?: Array<{
    scene: number;
    summary: string;
    problems: Array<{
      type: string;
      severity: string;
      evidence: string;
      blocks?: number[];
      suggestion?: string;
    }>;
  }>;
}

export interface DiagnoseMaterialSuccess {
  ok: true;
  tool: 'diagnose_scenes';
  mode: 'material';
  versions: { scene_schema: string; evidence_map: string };
  problem_types: Array<{ type: string; description: string }>;
  schema: unknown;
  scenes: Array<{
    scene: number;
    scene_id: string;
    heading: string;
    scene_chars: number;
    /** 素材序号 n → 块 id（证据映射回锚用） */
    block_ids: string[];
    material: string;
  }>;
  next_step: string;
  request_id: string;
}

export interface DiagnoseScoreSuccess {
  ok: true;
  tool: 'diagnose_scenes';
  mode: 'score';
  versions: { scene_schema: string; evidence_map: string; ai_scoring: string };
  scenes: Array<{
    scene: number;
    scene_id: string;
    heading: string;
    /** 0–100；null = 有无效条目（信息不足），不冒充满分 */
    score: number | null;
    invalid_count: number;
    scene_chars: number;
    summary: string | null;
    problems: Array<{
      block_ids: string[];
      type: string;
      penalty_points: number;
      severity: string;
      evidence: string;
      suggestion: string;
      start: number;
      end: number;
      spans: Array<[number, number]>;
    }>;
    baseline: unknown;
  }>;
  overall: {
    scenes: number;
    scored: number;
    needs_review: number;
    average_score: number | null;
  };
  request_id: string;
}

export type DiagnoseFailure = {
  ok: false;
  reason:
    | 'missing_text'
    | 'text_too_long'
    | 'nothing_to_format'
    | 'invalid_blocks'
    | 'invalid_findings'
    | 'invalid_mode'
    | 'no_scenes'
    | 'diagnose_failed';
  message: string;
  request_id?: string;
};

/** 本工具的引导句（英文正本）。 */
const DIAGNOSE_USAGE_HINT = `Start with {"mode": "material"} to get the numbered scene material, then call again with mode="score" and your findings — full manual: ${MANUAL_URL}`;

export function diagnoseScenes(
  input: DiagnoseInput,
  deps: ToolDeps,
): DiagnoseMaterialSuccess | DiagnoseScoreSuccess | DiagnoseFailure {
  // mode 形态校验（沿 §0.21 handler 内校验模式）：空参/非法值 → 结构化失败。
  const mode = input.mode;
  if (typeof mode !== 'string' || !DIAGNOSE_MODES.includes(mode)) {
    return withUsageHint(
      {
        ok: false as const,
        reason: 'invalid_mode' as const,
        message:
          'Field "mode" is required: "material" (numbered scene material for you to analyze) or "score" (submit findings, the server validates and scores).',
      },
      DIAGNOSE_USAGE_HINT,
    );
  }

  const prepared = prepareInput(input, deps);
  if (!prepared.ok) return withUsageHint(prepared as DiagnoseFailure, DIAGNOSE_USAGE_HINT);

  const requestSource =
    (input.input_format ?? 'text') === 'blocks' ? JSON.stringify(input.blocks) : (input.text as string);
  const requestKey = [
    'diagnose',
    mode,
    input.scenes !== undefined ? JSON.stringify([...input.scenes].sort((a, b) => a - b)) : '',
    input.findings !== undefined ? JSON.stringify(input.findings) : '',
    requestSource,
  ].join('|');
  const requestHash = createHash('sha256').update(requestKey).digest('hex');
  const requestId = input.request_id ?? requestHash.slice(0, 32);

  const { payload, sceneHeadings } = documentBlocksToPayload(prepared.renderBlocks);
  if (sceneHeadings.length === 0) {
    return withUsageHint(
      {
        ok: false as const,
        reason: 'no_scenes' as const,
        message:
          'No scene headings found — scene diagnosis works per scene (scene_heading blocks). Submit a screenplay with scene headings.',
        request_id: requestId,
      },
      DIAGNOSE_USAGE_HINT,
    );
  }

  if (mode === 'material') {
    return buildMaterial(input, payload, sceneHeadings, requestId);
  }
  return scoreFindings(input, payload, sceneHeadings, requestId);
}

// ---- mode=material（素材准备） ----

function buildMaterial(
  input: DiagnoseInput,
  payload: Parameters<typeof renderSceneMaterial>[0],
  sceneHeadings: Array<{ sceneId: string; text: string }>,
  requestId: string,
): DiagnoseMaterialSuccess | DiagnoseFailure {
  const selected = input.scenes ?? sceneHeadings.map((_, i) => i + 1);
  const invalidScene = selected.find((n) => n < 1 || n > sceneHeadings.length);
  if (invalidScene !== undefined) {
    return withUsageHint(
      {
        ok: false as const,
        reason: 'invalid_findings' as const,
        message: `Scene ${invalidScene} does not exist (this screenplay has ${sceneHeadings.length} scene(s), 1-based).`,
        request_id: requestId,
      },
      DIAGNOSE_USAGE_HINT,
    );
  }

  const scenes = selected
    .slice()
    .sort((a, b) => a - b)
    .map((sceneNum) => {
      const heading = sceneHeadings[sceneNum - 1]!;
      const blocks = sceneBlocks(payload, heading.sceneId);
      return {
        scene: sceneNum,
        scene_id: heading.sceneId,
        heading: heading.text,
        scene_chars: blocks.reduce((sum, b) => sum + Array.from(b.text).length, 0),
        block_ids: blocks.map((b) => b.id),
        material: renderSceneMaterial(payload, heading.sceneId),
      };
    });

  return {
    ok: true,
    tool: 'diagnose_scenes',
    mode: 'material',
    versions: { scene_schema: SCENE_SCHEMA_VERSION, evidence_map: EVIDENCE_MAP_VERSION },
    problem_types: PROBLEM_TYPES.map((type) => ({
      type,
      description: PROBLEM_TYPE_DESCRIPTIONS[type] ?? '',
    })),
    schema: SCENE_ANALYSIS_SCHEMA,
    scenes,
    next_step:
      'For each scene, report problems as {type, severity(low|medium|high), evidence(quote the material verbatim), blocks:[ordinals], suggestion}. Then call diagnose_scenes again with mode="score" and findings=[{scene, summary, problems}] — the tool validates evidence, maps ordinals to blocks, and computes the 0-100 shootability score (invalid items make the scene score null). The screenplay is passed the same way (or pass the same blocks).',
    request_id: requestId,
  };
}

// ---- mode=score（程序计分；开源包同样免费） ----

function scoreFindings(
  input: DiagnoseInput,
  payload: Parameters<typeof renderSceneMaterial>[0],
  sceneHeadings: Array<{ sceneId: string; text: string }>,
  requestId: string,
): DiagnoseScoreSuccess | DiagnoseFailure {
  const findings = input.findings ?? [];
  if (findings.length === 0) {
    return withUsageHint(
      {
        ok: false as const,
        reason: 'invalid_findings' as const,
        message:
          'mode="score" requires findings: [{scene, summary, problems}] — run mode="material" first and cite its block ordinals.',
        request_id: requestId,
      },
      DIAGNOSE_USAGE_HINT,
    );
  }
  for (const item of findings) {
    if (!Number.isInteger(item.scene) || item.scene < 1 || item.scene > sceneHeadings.length) {
      return withUsageHint(
        {
          ok: false as const,
          reason: 'invalid_findings' as const,
          message: `findings.scene ${item.scene} is out of range (this screenplay has ${sceneHeadings.length} scene(s)).`,
          request_id: requestId,
        },
        DIAGNOSE_USAGE_HINT,
      );
    }
  }

  const result = scoreAllScenes(findings, payload, sceneHeadings);
  return { ...result, request_id: requestId };
}

interface FindingItem {
  scene: number;
  summary: string;
  problems: Array<{
    type: string;
    severity: string;
    evidence: string;
    blocks?: number[];
    suggestion?: string;
  }>;
}

function scoreAllScenes(
  findings: FindingItem[],
  payload: Parameters<typeof renderSceneMaterial>[0],
  sceneHeadings: Array<{ sceneId: string; text: string }>,
): Omit<DiagnoseScoreSuccess, 'request_id'> {
  const scenes: DiagnoseScoreSuccess['scenes'] = [];
  for (const item of findings) {
    const heading = sceneHeadings[item.scene - 1]!;
    const conclusions: Conclusion[] = scoreAiFindings(
      { output: { summary: item.summary, problems: item.problems } },
      heading.sceneId,
      payload,
    );
    const problemConclusions = conclusions.filter((c) => c.payload.label !== 'summary');
    const summaryConclusion = conclusions.find((c) => c.payload.label === 'summary');
    const scoring = (summaryConclusion?.payload.details as
      | { text?: string; scoring?: { score: number | null; invalid_count: number; scene_chars: number; baseline?: unknown } }
      | undefined) ?? undefined;

    scenes.push({
      scene: item.scene,
      scene_id: heading.sceneId,
      heading: heading.text,
      score: scoring?.scoring?.score ?? null,
      invalid_count: scoring?.scoring?.invalid_count ?? 0,
      scene_chars: scoring?.scoring?.scene_chars ?? 0,
      summary: scoring?.text ?? null,
      problems: problemConclusions.map((c) => {
        const details = c.payload.details as {
          severity: string;
          evidence: string;
          suggestion: string;
          start: number;
          end: number;
          spans: Array<[number, number]>;
        };
        return {
          block_ids: c.source_block_ids,
          type: c.payload.label as string,
          penalty_points: c.payload.value as number,
          severity: details.severity,
          evidence: details.evidence,
          suggestion: details.suggestion,
          start: details.start,
          end: details.end,
          spans: details.spans,
        };
      }),
      baseline: scoring?.scoring?.baseline ?? null,
    });
  }

  const scored = scenes.filter((s) => s.score !== null);
  const needsReview = scenes.length - scored.length;
  const average =
    scored.length > 0
      ? pyRound(scored.reduce((sum, s) => sum + (s.score as number), 0) / scored.length, 1)
      : null;

  return {
    ok: true,
    tool: 'diagnose_scenes',
    mode: 'score',
    versions: {
      scene_schema: SCENE_SCHEMA_VERSION,
      evidence_map: EVIDENCE_MAP_VERSION,
      ai_scoring: AI_SCORING_VERSION,
    },
    scenes,
    overall: { scenes: scenes.length, scored: scored.length, needs_review: needsReview, average_score: average },
  };
}

/** 面向 AI 的一段说明文本（content[0]）。 */
export function summarizeDiagnoseForAi(
  result: DiagnoseMaterialSuccess | DiagnoseScoreSuccess,
): string {
  if (result.mode === 'material') {
    return (
      `Scene material ready: ${result.scenes.length} scene(s) rendered as numbered block lists ([n] [type] text), ` +
      `with the strict findings schema and ${result.problem_types.length} problem types. ` +
      `Analyze each scene against the problem types, quote evidence verbatim with block ordinals, ` +
      `then call diagnose_scenes mode="score" with findings.`
    );
  }
  const parts = [
    `Scored ${result.overall.scored}/${result.overall.scenes} scene(s)`,
    result.overall.average_score !== null ? `, average shootability ${result.overall.average_score}/100` : '',
  ];
  if (result.overall.needs_review > 0) {
    parts.push(
      `; ${result.overall.needs_review} scene(s) have invalid findings (score=null) — evidence must quote the material verbatim with correct block ordinals; fix and rescore`,
    );
  }
  parts.push('.');
  return parts.join('');
}
