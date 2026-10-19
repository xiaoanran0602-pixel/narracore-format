// 移植自主仓库 backend/core/src/modules/analysis/render_guard.py（9c781b16）。
// 只匹配 dict 键（递归遍历嵌套 dict / list），字符串值从不扫描——正文里的
// "svg" / "node" 等普通词不报。键按 camelCase 边界切词后整词比对。

/** 图表库指令 / 图形片段 / 图结构 / 坐标几何 / 样式：整词命中即拒。 */
export const RENDERING_KEY_TOKENS = new Set([
  'echarts', 'option', 'series', // 图表库指令
  'svg', 'css', 'style', 'viewbox', // 图形片段
  'nodes', 'edges', // 图结构
  'x', 'y', 'z', 'width', 'height', // 坐标与几何
  'color', 'fill', 'stroke', // 样式
]);

/** 该 dict 键是否携带渲染指令词（整词、大小写不敏感；非 string 键跳过）。 */
export function isRenderingKey(key: unknown): boolean {
  if (typeof key !== 'string') return false;
  // Python _CAMEL_BOUNDARY (?<=[a-z0-9])(?=[A-Z]) 的插入式改写等价实现
  const spaced = key.replace(/([a-z0-9])(?=[A-Z])/g, '$1_');
  const lowered = spaced.toLowerCase();
  for (const match of lowered.matchAll(/[a-z0-9]+/g)) {
    if (RENDERING_KEY_TOKENS.has(match[0])) return true;
  }
  return false;
}

/** 递归返回全部渲染键的点分路径；空数组 = 干净。命中子树根路径即止。 */
export function findRenderingKeys(value: unknown, path = ''): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      hits.push(...findRenderingKeys(item, `${path}[${index}]`));
    });
    return hits;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const child = path ? `${path}.${key}` : key;
      if (isRenderingKey(key)) {
        hits.push(child);
        continue;
      }
      hits.push(...findRenderingKeys(item, child));
    }
  }
  return hits;
}
