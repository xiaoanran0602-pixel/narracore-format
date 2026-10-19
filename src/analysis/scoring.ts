// 移植自主仓库 backend/core/src/modules/analysis/scoring.py 前半（9c781b16）：
// M5 确定性统计口径。全部数值由纯函数产出、带版本号；口径变更必须升
// ANALYZER_VERSION——旧结果不冒充新口径。
// 行为由 test/analysis/fixtures/golden.json 金样例锁定。

import { isPySpace } from './scene-material';
import type { PayloadBlock } from './scene-material';

/** M5 确定性统计口径版本。 */
export const ANALYZER_VERSION = '1.0';

function blockText(block: PayloadBlock): string {
  const v = block.text;
  return typeof v === 'string' ? v : '';
}

/** 字数 = Unicode 码点数（Python len；不是 JS 的 UTF-16 单元数）。 */
export function charCount(text: string): number {
  return Array.from(text).length;
}

/** 角色名归一：strip + 全角空格→半角 + 连续 ASCII 双空格折叠。 */
export function normalizeCharacterName(raw: string): string {
  let normalized = raw.replaceAll('\u3000', ' ');
  // Python str.strip() 语义（Python 空白集）
  let start = 0;
  let end = Array.from(normalized).length;
  const cps = Array.from(normalized);
  while (start < end && isPySpace(cps[start]!)) start += 1;
  while (end > start && isPySpace(cps[end - 1]!)) end -= 1;
  normalized = cps.slice(start, end).join('');
  while (normalized.includes('  ')) {
    normalized = normalized.replaceAll('  ', ' ');
  }
  return normalized;
}

/** 对白块字数 / 场总字数；空场或零分母定义为 0.0。 */
export function dialogueRatio(sceneBlocks: PayloadBlock[]): number {
  const total = sceneBlocks.reduce((sum, b) => sum + charCount(blockText(b)), 0);
  if (total === 0) return 0.0;
  const dialogue = sceneBlocks
    .filter((b) => b.type === 'dialogue')
    .reduce((sum, b) => sum + charCount(blockText(b)), 0);
  return dialogue / total;
}

/** 场景数 = scene_heading 块计数。 */
export function countScenes(blocks: PayloadBlock[]): number {
  return blocks.filter((b) => b.type === 'scene_heading').length;
}

/** 角色出现次数：character 块文本归一后按名字聚合计数（插入序）。 */
export function characterAppearances(blocks: PayloadBlock[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const block of blocks) {
    if (block.type === 'character') {
      const name = normalizeCharacterName(blockText(block));
      if (name) counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  return counts;
}

/** 动作密度：动作块总字数 / 场数（每场平均动作字数；零场为 0.0）。 */
export function actionDensity(blocks: PayloadBlock[]): number {
  const scenes = countScenes(blocks);
  if (scenes === 0) return 0.0;
  const action = blocks
    .filter((b) => b.type === 'action')
    .reduce((sum, b) => sum + charCount(blockText(b)), 0);
  return action / scenes;
}

/** Python round(x, digits)（十进制半偶）的 JS 近似：用于 ratio/coverage 修约。 */
export function pyRound(x: number, digits: number): number {
  const factor = 10 ** digits;
  const scaled = x * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded: number;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  return rounded / factor;
}
