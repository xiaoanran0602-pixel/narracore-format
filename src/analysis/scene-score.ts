// 移植自主仓库 backend/core/src/modules/analysis/scoring.py 后半（9c781b16）：
// ai-2.0「模型只举证、程序算分」——影视化度 = 严重度加权证据覆盖率。
// 全程 BigInt 精确分数（对应 Python fractions.Fraction），无浮点漂移、
// 无时钟、无随机；同输入逐字节可复算。
// 行为由 test/analysis/fixtures/golden.json 金样例锁定。

import { PROBLEM_TYPES, SEVERITIES, type Severity } from './scene-contract';
import {
  sceneBlocks,
  mapEvidence,
  isPySpace,
  REASON_NO_MATCH,
  type SceneBlock,
  type SnapshotPayload,
} from './scene-material';
import { findRenderingKeys } from './render-guard';
import { pyRound } from './scoring';

/** AI 结论计分规则版本（与 ANALYZER_VERSION 是两个独立版本族）。 */
export const AI_SCORING_VERSION = 'ai-2.0';

/** 严重度 → 扣分强度（0–1）。改这里 = 口径变更，必须升 AI_SCORING_VERSION。 */
export const SEVERITY_WEIGHTS: Record<Severity, number> = {
  low: 0.25,
  medium: 0.5,
  high: 1.0,
};

/** 规则基线版本（基线指标集变更时递增）。 */
export const RULE_BASELINE_VERSION = 'rule-baseline-1';

/** 计分侧丢弃原因（映射侧原因住在 scene-material）。 */
export const REASON_MALFORMED = 'malformed';
export const REASON_SEVERITY_UNKNOWN = 'severity_unknown';
export const REASON_TYPE_UNKNOWN = 'type_unknown';
export const REASON_RENDERING_KEYS = 'rendering_keys';

/** 严重度强弱次序（同证据去重保留最高；权重数值唯一来源是 SEVERITY_WEIGHTS）。 */
const SEVERITY_RANK: Record<string, number> = Object.fromEntries(
  SEVERITIES.map((severity, index) => [severity, index]),
);

/** confidence 由程序注入（不接受模型自报值直写）。 */
const SUMMARY_CONFIDENCE = 0.5;
const PROBLEM_CONFIDENCE = 0.5;

// ── 精确分数（Python fractions.Fraction 的最小等价实现） ──────────────────

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a < 0n ? -a : a;
}

export class Frac {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint, den: bigint = 1n) {
    if (den === 0n) throw new Error('Frac: zero denominator');
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = gcd(num, den) || 1n;
    this.num = num / g;
    this.den = den / g;
  }

  /** 与 Python Fraction(str(w)) 一致：十进制字面量精确转分数。 */
  static fromDecimalString(s: string): Frac {
    const m = s.trim().match(/^([+-]?)(\d*)(?:\.(\d*))?$/);
    if (!m || (m[2] === '' && m[3] === undefined)) {
      throw new Error(`Frac: cannot parse ${JSON.stringify(s)}`);
    }
    const [, sign, int = '', frac = ''] = m;
    const digits = BigInt((int || '0') + (frac || ''));
    const value = new Frac(digits, 10n ** BigInt(frac.length));
    return sign === '-' ? new Frac(-value.num, value.den) : value;
  }

  add(o: Frac): Frac {
    return new Frac(this.num * o.den + o.num * this.den, this.den * o.den);
  }

  sub(o: Frac): Frac {
    return new Frac(this.num * o.den - o.num * this.den, this.den * o.den);
  }

  mul(o: Frac): Frac {
    return new Frac(this.num * o.num, this.den * o.den);
  }

  div(o: Frac): Frac {
    return new Frac(this.num * o.den, this.den * o.num);
  }

  /** 代数值比较（den 恒正）。 */
  cmp(o: Frac): number {
    const l = this.num * o.den;
    const r = o.num * this.den;
    return l < r ? -1 : l > r ? 1 : 0;
  }
}

/** Python 地板除 //（负数向下取整）。 */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  if (a % b !== 0n && a < 0n !== b < 0n) return q - 1n;
  return q;
}

/** 四舍五入（half-up）到整数；输入是精确分数，无浮点误差。 */
function roundHalfUp(value: Frac): number {
  return Number(floorDiv(2n * value.num + value.den, 2n * value.den));
}

/** 场非空正文字符数：scene_material 同一 walk 的 text 码点长度和（分母口径）。 */
export function sceneCharCount(blocks: readonly SceneBlock[]): number {
  return blocks.reduce((sum, block) => sum + Array.from(block.text).length, 0);
}

/**
 * 0–100 可拍程度分：round_half_up(100 * (1 - 加权覆盖 / max(1, 场字数)))。
 * 同一字位被多条区间覆盖时取最大强度（重复举证不重复扣分）。
 */
export function computeSceneScore(
  weightedSpans: ReadonlyArray<readonly [number, number, number]>,
  sceneChars: number,
): number {
  const spans = weightedSpans.map(
    ([s, e, w]) => [s, e, Frac.fromDecimalString(String(w))] as const,
  );
  const points = [...new Set(spans.flatMap(([s, e]) => [s, e]))].sort((a, b) => a - b);
  let coverage = new Frac(0n);
  for (let i = 0; i + 1 < points.length; i += 1) {
    const left = points[i]!;
    const right = points[i + 1]!;
    let best = new Frac(0n);
    for (const [start, end, weight] of spans) {
      if (start <= left && end >= right && weight.cmp(best) > 0) best = weight;
    }
    coverage = coverage.add(best.mul(new Frac(BigInt(right - left))));
  }
  const raw = new Frac(100n).mul(
    new Frac(1n).sub(coverage.div(new Frac(BigInt(Math.max(1, sceneChars))))),
  );
  return Math.min(100, Math.max(0, roundHalfUp(raw)));
}

/** 单条问题的自身扣分（penalty_points，整数）；与场分同一归一口径。 */
function penaltyPoints(
  spans: ReadonlyArray<readonly [number, number]>,
  weight: number,
  sceneChars: number,
): number {
  const total = spans.reduce((sum, [s, e]) => sum + (e - s), 0);
  const coverage = Frac.fromDecimalString(String(weight)).mul(new Frac(BigInt(total)));
  const raw = new Frac(100n).mul(coverage.div(new Frac(BigInt(Math.max(1, sceneChars)))));
  return Math.min(100, Math.max(0, roundHalfUp(raw)));
}

// ── 证据定位（场文本坐标 = 换行拼接、码点计） ─────────────────────────────

/** 空白归一 + 每个归一字符的原串（码点）下标；与 mapEvidence 比较规则同义。 */
function normalizeWithMap(raw: string): { normalized: string; indexMap: number[] } {
  const chars: string[] = [];
  const indexMap: number[] = [];
  let pendingSpace: number | null = null;
  const cps = Array.from(raw);
  for (let index = 0; index < cps.length; index += 1) {
    const ch = cps[index]!;
    if (isPySpace(ch)) {
      if (chars.length > 0 && pendingSpace === null) pendingSpace = index;
      continue;
    }
    if (pendingSpace !== null) {
      chars.push(' ');
      indexMap.push(pendingSpace);
      pendingSpace = null;
    }
    chars.push(ch);
    indexMap.push(index);
  }
  return { normalized: chars.join(''), indexMap };
}

/** 码点坐标的子串查找（避免 UTF-16 索引与 Python 码点索引错位）。 */
function indexOfByCodePoint(haystack: string, needle: string): number {
  if (needle === '') return -1;
  const h = Array.from(haystack);
  const n = Array.from(needle);
  outer: for (let i = 0; i + n.length <= h.length; i += 1) {
    for (let j = 0; j < n.length; j += 1) {
      if (h[i + j] !== n[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** 块文本在场文本（换行拼接）里的码点偏移。 */
function offsetOf(block: SceneBlock, blocks: readonly SceneBlock[]): number {
  let offset = 0;
  for (const candidate of blocks) {
    if (candidate.ordinal === block.ordinal) return offset;
    offset += Array.from(candidate.text).length + 1;
  }
  return offset;
}

/**
 * 把证据原文精确定位到被引用块内的场文本区间（可多段）。比较先做空白归一，
 * 区间映射回原始码点；被引用块按素材序号以单空格拼接。定位失败返回 null
 * （防御性：mapEvidence 已成功时不可达，但绝不因此伪造区间）。
 */
function locateEvidenceSpans(
  evidence: string,
  cited: readonly SceneBlock[],
  blocks: readonly SceneBlock[],
): Array<[number, number]> | null {
  const needle = normalizeWithMap(evidence).normalized;
  if (needle === '' || cited.length === 0) return null;
  const joined = cited.map((block) => block.text).join(' ');
  const { normalized, indexMap } = normalizeWithMap(joined);
  const position = indexOfByCodePoint(normalized, needle);
  if (position < 0) return null;
  const rawStart = indexMap[position]!;
  const rawEnd = indexMap[position + Array.from(needle).length - 1]! + 1;

  const spans: Array<[number, number]> = [];
  let joinOffset = 0;
  for (const block of cited) {
    const blockEnd = joinOffset + Array.from(block.text).length;
    const overlapStart = Math.max(rawStart, joinOffset);
    const overlapEnd = Math.min(rawEnd, blockEnd);
    if (overlapStart < overlapEnd) {
      const sceneOffset = offsetOf(block, blocks);
      spans.push([
        sceneOffset + overlapStart - joinOffset,
        sceneOffset + overlapEnd - joinOffset,
      ]);
    }
    joinOffset = blockEnd + 1; // 单空格分隔符不占块字符
  }
  return spans.length > 0 ? spans : null;
}

// ── 规则基线与 AI 发现计分 ────────────────────────────────────────────────

export interface RuleBaseline {
  kind: 'rule_baseline';
  version: string;
  reference_only: boolean;
  indicators: {
    has_action: boolean;
    has_dialogue: boolean;
    has_character: boolean;
    action_block_count: number;
    dialogue_block_count: number;
    character_block_count: number;
    action_char_coverage: number;
  };
}

/** 确定性结构指标（非空动作/对白/角色存在性与计数、动作字数占比）。仅供参考。 */
export function ruleBaseline(blocks: readonly SceneBlock[]): RuleBaseline {
  let actionCount = 0;
  let dialogueCount = 0;
  let characterCount = 0;
  let actionChars = 0;
  let totalChars = 0;
  for (const block of blocks) {
    const len = Array.from(block.text).length;
    totalChars += len;
    if (block.type === 'action') {
      actionCount += 1;
      actionChars += len;
    } else if (block.type === 'dialogue') {
      dialogueCount += 1;
    } else if (block.type === 'character') {
      characterCount += 1;
    }
  }
  return {
    kind: 'rule_baseline',
    version: RULE_BASELINE_VERSION,
    reference_only: true,
    indicators: {
      has_action: actionCount > 0,
      has_dialogue: dialogueCount > 0,
      has_character: characterCount > 0,
      action_block_count: actionCount,
      dialogue_block_count: dialogueCount,
      character_block_count: characterCount,
      action_char_coverage: totalChars > 0 ? pyRound(actionChars / totalChars, 4) : 0.0,
    },
  };
}

export interface Conclusion {
  scene_id: string;
  source_block_ids: string[];
  confidence: number;
  analysis_version: string;
  payload: Record<string, unknown>;
}

interface ProblemShape {
  type?: unknown;
  severity?: unknown;
  evidence?: unknown;
  blocks?: unknown;
  suggestion?: unknown;
}

/** Python str(x) 语义：null → 'None'；缺键由调用方给默认值。 */
function pyStr(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (value === null) return 'None';
  return String(value);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * 程序侧计分：把模型的问题列表映射为 conclusions。模型只回问题
 * （type/severity/evidence/blocks=素材块序号）与总结；数值、confidence、
 * analysis_version 与 start/end 一律由程序产出。未知类型/未知严重度/畸形/
 * 映射不上或定位失败 → 丢弃并计入 invalid_count（score=null，信息不足，
 * 不冒充满分）；原始输出任意位置命中渲染键 → 整批问题拒收。同
 * type+引用原文+引用块的重复问题去重保留最高严重度（顺序无关）。
 */
export function scoreAiFindings(
  modelOutput: Record<string, unknown>,
  sceneId: string,
  snapshotPayload: SnapshotPayload,
): Conclusion[] {
  const outputRaw = modelOutput['output'];
  const output: ProblemShape & { summary?: unknown; problems?: unknown } =
    isPlainObject(outputRaw) ? outputRaw : {};
  const blocks = sceneBlocks(snapshotPayload, sceneId);
  const sceneChars = sceneCharCount(blocks);

  const conclusions: Conclusion[] = [];
  const dropped: Record<string, number> = {};
  interface AcceptedEntry {
    order: number;
    rank?: number;
    conclusion?: Conclusion;
    weighted?: Array<[number, number, number]>;
  }
  // dedup key → 已保留条目；同 key 只留最高严重度（首次出现位置稳定）
  const accepted = new Map<string, AcceptedEntry>();

  const renderingHits = findRenderingKeys(modelOutput);
  const problems = output.problems;
  if (renderingHits.length > 0) {
    // 渲染指令混入模型结构：拒收整批问题，路径（仅键名）留证。
    dropped[REASON_RENDERING_KEYS] = renderingHits.length;
  } else if (Array.isArray(problems)) {
    for (const problem of problems) {
      if (!isPlainObject(problem)) {
        dropped[REASON_MALFORMED] = (dropped[REASON_MALFORMED] ?? 0) + 1;
        continue;
      }
      const shape = problem as unknown as ProblemShape;
      const problemType = shape.type;
      if (typeof problemType !== 'string' || !(PROBLEM_TYPES as readonly string[]).includes(problemType)) {
        dropped[REASON_TYPE_UNKNOWN] = (dropped[REASON_TYPE_UNKNOWN] ?? 0) + 1;
        continue;
      }
      const severity = shape.severity;
      if (typeof severity !== 'string' || !(severity in SEVERITY_WEIGHTS)) {
        dropped[REASON_SEVERITY_UNKNOWN] = (dropped[REASON_SEVERITY_UNKNOWN] ?? 0) + 1;
        continue;
      }
      const mapping = mapEvidence({
        evidence: shape.evidence,
        citedOrdinals: shape.blocks,
        blocks,
      });
      if (mapping.blockIds.length === 0) {
        const reason = mapping.reason ?? REASON_NO_MATCH;
        dropped[reason] = (dropped[reason] ?? 0) + 1;
        continue;
      }
      const cited = blocks.filter((block) => mapping.blockIds.includes(block.id));
      const evidence = String(shape.evidence);
      const spans = locateEvidenceSpans(evidence, cited, blocks);
      if (spans === null) {
        // mapEvidence 已担保可定位；防御性丢弃，不伪造区间。
        dropped[REASON_NO_MATCH] = (dropped[REASON_NO_MATCH] ?? 0) + 1;
        continue;
      }
      const dedupKey = [
        problemType,
        normalizeWithMap(evidence).normalized,
        mapping.blockIds.join('\u0000'),
      ].join('\u0000');
      const rank = SEVERITY_RANK[severity] ?? -1;
      const existing = accepted.get(dedupKey);
      if (existing !== undefined && (existing.rank ?? -1) >= rank) {
        // 同 type+引用原文+引用块且不更高：有效但冗余——不计无效、不重复扣分。
        continue;
      }
      const weight = SEVERITY_WEIGHTS[severity as Severity];
      const entry = existing ?? { order: accepted.size };
      entry.rank = rank;
      entry.conclusion = shapeProblem(sceneId, shape, mapping, problemType, spans, weight, sceneChars);
      entry.weighted = spans.map(([s, e]) => [s, e, weight]);
      accepted.set(dedupKey, entry);
    }
  } else {
    // problems 缺席或不是列表 = 结构不完整：计无效，杜绝「无问题冒充满分」。
    dropped[REASON_MALFORMED] = (dropped[REASON_MALFORMED] ?? 0) + 1;
  }

  const weightedSpans: Array<[number, number, number]> = [];
  for (const entry of accepted.values()) {
    // Map 保序：首次出现位置稳定
    if (entry.conclusion) conclusions.push(entry.conclusion);
    if (entry.weighted) weightedSpans.push(...entry.weighted);
  }

  const invalidCount = Object.values(dropped).reduce((a, b) => a + b, 0);
  const score = invalidCount === 0 ? computeSceneScore(weightedSpans, sceneChars) : null;

  appendSummary(conclusions, sceneId, output.summary, blocks, {
    rule_version: AI_SCORING_VERSION,
    score,
    invalid_count: invalidCount,
    scene_chars: sceneChars,
    baseline: ruleBaseline(blocks),
  });
  return conclusions;
}

/** 场总结也是一条结论：证据是整场（携带全部块 id），分数挂在 details.scoring。 */
function appendSummary(
  conclusions: Conclusion[],
  sceneId: string,
  summary: unknown,
  blocks: readonly SceneBlock[],
  scoring: Record<string, unknown>,
): void {
  if (typeof summary !== 'string' || summary.trim() === '' || blocks.length === 0) return;
  conclusions.push({
    scene_id: sceneId,
    source_block_ids: blocks.map((block) => block.id),
    confidence: SUMMARY_CONFIDENCE,
    analysis_version: AI_SCORING_VERSION,
    payload: {
      label: 'summary',
      details: { text: summary.trim(), scoring },
    },
  });
}

/** 一条已映射问题：start/end 是证据区间外包范围，spans 逐段精确；数值程序产出。 */
function shapeProblem(
  sceneId: string,
  problem: ProblemShape,
  mapping: { blockIds: string[] },
  label: string,
  spans: ReadonlyArray<readonly [number, number]>,
  weight: number,
  sceneChars: number,
): Conclusion {
  const first = spans[0]!;
  const last = spans[spans.length - 1]!;
  return {
    scene_id: sceneId,
    source_block_ids: [...mapping.blockIds],
    confidence: PROBLEM_CONFIDENCE,
    analysis_version: AI_SCORING_VERSION,
    payload: {
      value: penaltyPoints(spans, weight, sceneChars),
      unit: 'penalty_points',
      label,
      details: {
        severity: pyStr(problem.severity, ''),
        evidence: pyStr(problem.evidence, ''),
        suggestion: pyStr(problem.suggestion, ''),
        start: first[0],
        end: last[1],
        spans: spans.map(([s, e]) => [s, e]),
      },
    },
  };
}
