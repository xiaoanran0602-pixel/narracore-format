// 移植自主仓库 backend/core/src/modules/analysis/scene_material.py（9c781b16）。
// 场素材渲染 + 证据→块映射：模型看到的编号与程序映射依据的表必须是**同一次
// 快照遍历**（序号空间 = 渲染素材里的 1..N；空文本块不渲染不占号）。
// 行为由 test/analysis/fixtures/golden.json 金样例锁定。

import { createHash } from 'node:crypto';

/** 映射规则版本（匹配/歧义/越界处理变更时递增）。 */
export const EVIDENCE_MAP_VERSION = 'evidence-map-1';

/** 丢弃原因（枚举，不是散文）。 */
export const REASON_OUT_OF_RANGE = 'out_of_range';
export const REASON_TEXT_MISMATCH = 'text_mismatch';
export const REASON_AMBIGUOUS = 'ambiguous';
export const REASON_NO_MATCH = 'no_match';
export const REASON_EMPTY_EVIDENCE = 'empty_evidence';

/** 快照载荷形状（主仓库 documents 快照；MCP 侧由 adapter 构造，字段宽松对齐 Python 鸭子类型）。 */
export interface PayloadBlock {
  id?: unknown;
  type?: unknown;
  text?: unknown;
  scene_id?: unknown;
}

export interface PayloadItem {
  item_type?: unknown;
  blocks?: PayloadBlock[];
}

export interface SnapshotPayload {
  items?: PayloadItem[];
}

/** 一个渲染块：ordinal 是它在素材里的 1 起位置。 */
export interface SceneBlock {
  id: string;
  type: string;
  text: string;
  ordinal: number;
}

export interface MappingResult {
  blockIds: string[];
  reason: string | null;
}

/**
 * 该场的渲染块序列（快照顺序、1 起序号、空隙收拢）。遍历口径 = manuscript
 * 条目、从匹配的场景标题起、仅非空文本块，保留 id 供证据回锚。
 */
export function sceneBlocks(payload: SnapshotPayload, sceneId: string): SceneBlock[] {
  const blocks: SceneBlock[] = [];
  let inScene = false;
  for (const entry of payload.items ?? []) {
    if (entry.item_type !== 'manuscript') continue;
    for (const block of entry.blocks ?? []) {
      if (block.type === 'scene_heading') {
        inScene = String(block.scene_id ?? '') === sceneId;
      }
      if (!inScene) continue;
      const text = block.text;
      const blockId = block.id;
      if (!text || !blockId) continue;
      blocks.push({
        id: String(blockId),
        type: String(block.type ?? ''),
        text: String(text),
        ordinal: blocks.length + 1,
      });
    }
  }
  return blocks;
}

/** 场素材原文：`[n] [type] 正文` 行——模型看到什么，计分就映射什么。 */
export function renderSceneMaterial(payload: SnapshotPayload, sceneId: string): string {
  return sceneBlocks(payload, sceneId)
    .map((block) => `[${block.ordinal}] [${block.type}] ${block.text}`)
    .join('\n');
}

/** Python str.isspace() 的字符集（Unicode White_Space + \x1c-\x1f；不含 \ufeff）。 */
const PY_SPACE_CP = new Set<number>([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, // \t\n\v\f\r
  0x1c, 0x1d, 0x1e, 0x1f, // Python 额外的文件分隔符
  0x20, 0x85, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);
for (let cp = 0x2000; cp <= 0x200a; cp += 1) PY_SPACE_CP.add(cp);

/** 单字符是否 Python 空白（码点判断；移植层共用口径）。 */
export function isPySpace(ch: string): boolean {
  const cp = ch.codePointAt(0);
  return cp !== undefined && PY_SPACE_CP.has(cp);
}

/** 空白归一（" ".join(value.split()) 同义）：Python 空白语义、码点遍历。 */
export function pyNormalizeText(value: string): string {
  const out: string[] = [];
  let pending = false;
  for (const ch of value) {
    if (isPySpace(ch)) {
      if (out.length > 0) pending = true;
      continue;
    }
    if (pending) {
      out.push(' ');
      pending = false;
    }
    out.push(ch);
  }
  return out.join('');
}

/** 单场内容指纹：渲染块按 `id:normalized-text` 行拼接后 sha256（无库无钟）。 */
export function sceneContentFingerprint(blocks: readonly SceneBlock[]): string {
  const canonical = blocks.map((b) => `${b.id}:${pyNormalizeText(b.text)}`).join('\n');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * 把一条问题的证据锚回块 id。规则按序：
 * 1. 引用序号存在 → 全部在界内，且归一证据须出现在被引用块文本的拼接里
 *    （跨块引用可行）；
 * 2. 无引用序号 → 全场搜索：证据须恰好出现在一个块里（0=无匹配，>1=歧义）。
 * 其余一律带原因丢弃——绝不写错锚点。
 */
export function mapEvidence(input: {
  evidence: unknown;
  citedOrdinals: unknown;
  blocks: readonly SceneBlock[];
}): MappingResult {
  const { evidence, citedOrdinals, blocks } = input;
  if (typeof evidence !== 'string' || pyNormalizeText(evidence) === '') {
    return { blockIds: [], reason: REASON_EMPTY_EVIDENCE };
  }
  const needle = pyNormalizeText(evidence);

  const cited: number[] = [];
  if (Array.isArray(citedOrdinals)) {
    for (const raw of citedOrdinals) {
      if (typeof raw === 'boolean' || !Number.isInteger(raw)) {
        return { blockIds: [], reason: REASON_OUT_OF_RANGE };
      }
      if (raw < 1 || raw > blocks.length) {
        return { blockIds: [], reason: REASON_OUT_OF_RANGE };
      }
      cited.push(raw);
    }
  }

  if (cited.length > 0) {
    const picked = blocks.filter((b) => cited.includes(b.ordinal));
    const haystack = pyNormalizeText(picked.map((b) => b.text).join(' '));
    if (!haystack.includes(needle)) {
      return { blockIds: [], reason: REASON_TEXT_MISMATCH };
    }
    return { blockIds: picked.map((b) => b.id), reason: null };
  }

  const carriers = blocks.filter((b) => pyNormalizeText(b.text).includes(needle));
  if (carriers.length === 0) return { blockIds: [], reason: REASON_NO_MATCH };
  if (carriers.length > 1) return { blockIds: [], reason: REASON_AMBIGUOUS };
  return { blockIds: [carriers[0]!.id], reason: null };
}
