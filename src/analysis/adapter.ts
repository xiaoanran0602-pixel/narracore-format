// MCP 块 → 主仓库快照载荷适配层（P7-4，MCP 自有代码，非移植件）。
// 渲染块序列（与内容指纹同一来源）→ {items:[{item_type:'manuscript', blocks}]}：
// 块 id = b1..bn（顺序），scene_heading 分配合成 scene_id = s1..sn。
// 金样例 fixtures 的载荷即此形状（synthetic id），映射由 analyze 工具测试覆盖。

import type { DocumentBlock } from '../format/types';
import type { PayloadBlock, SnapshotPayload } from './scene-material';

export interface AdaptedPayload {
  payload: SnapshotPayload;
  /** 场景标题（按出现顺序）：合成 scene_id + 原文 */
  sceneHeadings: Array<{ sceneId: string; text: string }>;
}

export function documentBlocksToPayload(blocks: readonly DocumentBlock[]): AdaptedPayload {
  const sceneHeadings: AdaptedPayload['sceneHeadings'] = [];
  let sceneIndex = 0;
  const payloadBlocks: PayloadBlock[] = blocks.map((block, i) => {
    if (block.type === 'scene_heading') {
      sceneIndex += 1;
      const sceneId = `s${sceneIndex}`;
      sceneHeadings.push({ sceneId, text: block.text });
      return { id: `b${i + 1}`, type: block.type, text: block.text, scene_id: sceneId };
    }
    return { id: `b${i + 1}`, type: block.type, text: block.text };
  });
  return {
    payload: { items: [{ item_type: 'manuscript', blocks: payloadBlocks }] },
    sceneHeadings,
  };
}
