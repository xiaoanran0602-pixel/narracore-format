// 移植自主仓库 backend/core/src/modules/analysis/executors.py（9c781b16）：
// 五个确定性统计执行器——函数体逐字移植，仅去掉 Connection / run_id /
// project_id 三个装配层参数。输入是快照载荷（MCP 侧由 adapter 构造），
// 结论锚定 scene_id + source_block_ids，confidence=1.0（确定性规则）。
// 行为由 test/analysis/fixtures/golden.json 金样例锁定。

import type { PayloadBlock, SnapshotPayload } from './scene-material';
import {
  ANALYZER_VERSION,
  charCount,
  characterAppearances,
  dialogueRatio,
  normalizeCharacterName,
  pyRound,
} from './scoring';
import type { Conclusion } from './scene-score';

export type { Conclusion } from './scene-score';

function blockText(block: PayloadBlock): string {
  const v = block.text;
  return typeof v === 'string' ? v : '';
}

/**
 * 把块序列切成 (场景标题块, 该场块列表)——场界 = scene_heading。
 * 首个场景标题之前的内容块不计入任何场级结论（前导块没有所属场景）；
 * 全篇无场景标题时返回空列表。
 */
export function splitByScene(blocks: PayloadBlock[]): Array<[PayloadBlock, PayloadBlock[]]> {
  const scenes: Array<[PayloadBlock, PayloadBlock[]]> = [];
  let currentHeading: PayloadBlock | null = null;
  let currentBlocks: PayloadBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'scene_heading') {
      if (currentHeading !== null) scenes.push([currentHeading, currentBlocks]);
      currentHeading = block;
      currentBlocks = [block];
    } else if (currentHeading !== null) {
      currentBlocks.push(block);
    }
  }
  if (currentHeading !== null) scenes.push([currentHeading, currentBlocks]);
  return scenes;
}

/** 快照载荷中的 manuscript 条目块（多条目拼接保持快照顺序）。 */
export function manuscriptBlocks(payload: SnapshotPayload): PayloadBlock[] {
  const blocks: PayloadBlock[] = [];
  for (const entry of payload.items ?? []) {
    if (entry.item_type === 'manuscript') blocks.push(...(entry.blocks ?? []));
  }
  return blocks;
}

function sceneBlockIds(sceneBlocks: PayloadBlock[]): string[] {
  return sceneBlocks
    .filter((b) => typeof b.id === 'string')
    .map((b) => b.id as string);
}

function conclusion(sceneId: string, blockIds: string[], payload: Record<string, unknown>): Conclusion {
  return {
    scene_id: sceneId,
    source_block_ids: blockIds,
    confidence: 1.0,
    analysis_version: ANALYZER_VERSION,
    payload,
  };
}

/** Python sorted() 的码点序比较（str 比较按 Unicode 码点）。 */
export function compareCodePoints(a: string, b: string): number {
  const ac = Array.from(a);
  const bc = Array.from(b);
  const len = Math.min(ac.length, bc.length);
  for (let i = 0; i < len; i += 1) {
    const av = ac[i]!.codePointAt(0)!;
    const bv = bc[i]!.codePointAt(0)!;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return ac.length - bc.length;
}

/** stats.words.count：逐场字数。 */
export function wordsExecutor(payload: SnapshotPayload): Conclusion[] {
  const conclusions: Conclusion[] = [];
  for (const [heading, blocks] of splitByScene(manuscriptBlocks(payload))) {
    const total = blocks.reduce((sum, b) => sum + charCount(blockText(b)), 0);
    conclusions.push(conclusion(String(heading.scene_id), sceneBlockIds(blocks), { value: total, unit: 'chars' }));
  }
  return conclusions;
}

/** stats.dialogue.ratio：逐场对白占比（round 6 位）。 */
export function dialogueRatioExecutor(payload: SnapshotPayload): Conclusion[] {
  const conclusions: Conclusion[] = [];
  for (const [heading, blocks] of splitByScene(manuscriptBlocks(payload))) {
    conclusions.push(
      conclusion(String(heading.scene_id), sceneBlockIds(blocks), {
        value: pyRound(dialogueRatio(blocks), 6),
        unit: 'ratio',
      }),
    );
  }
  return conclusions;
}

/** stats.scenes.count：逐场一条「该场存在」结论。 */
export function scenesExecutor(payload: SnapshotPayload): Conclusion[] {
  const conclusions: Conclusion[] = [];
  for (const [heading] of splitByScene(manuscriptBlocks(payload))) {
    conclusions.push(conclusion(String(heading.scene_id), [String(heading.id)], { value: 1, unit: 'scenes' }));
  }
  return conclusions;
}

/** stats.characters.appearances：逐场逐角色出现次数（label=归一名，码点序）。 */
export function charactersExecutor(payload: SnapshotPayload): Conclusion[] {
  const conclusions: Conclusion[] = [];
  for (const [heading, blocks] of splitByScene(manuscriptBlocks(payload))) {
    const sceneCharacters = characterAppearances(blocks);
    for (const name of Object.keys(sceneCharacters).sort(compareCodePoints)) {
      const evidence = blocks
        .filter(
          (b) =>
            b.type === 'character' &&
            normalizeCharacterName(blockText(b)) === name,
        )
        .filter((b) => typeof b.id === 'string')
        .map((b) => b.id as string);
      conclusions.push(
        conclusion(String(heading.scene_id), evidence, {
          value: sceneCharacters[name] ?? 0,
          unit: 'count',
          label: name,
        }),
      );
    }
  }
  return conclusions;
}

/** stats.action.density：逐场动作块字数（场级口径；聚合层再除场数）。 */
export function actionDensityExecutor(payload: SnapshotPayload): Conclusion[] {
  const conclusions: Conclusion[] = [];
  for (const [heading, blocks] of splitByScene(manuscriptBlocks(payload))) {
    const actionChars = blocks
      .filter((b) => b.type === 'action')
      .reduce((sum, b) => sum + charCount(blockText(b)), 0);
    conclusions.push(
      conclusion(String(heading.scene_id), sceneBlockIds(blocks), { value: actionChars, unit: 'chars' }),
    );
  }
  return conclusions;
}
