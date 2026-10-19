// 守卫测试：公开包内不得出现任何计费/授权/支付痕迹（开源 = 纯免费本地包）。
//
// 反向检验（AGENTS 纪律「删守卫后测试会失败」）：在 src/ 下任一文件里加一行
// `import { lookupKey } from '../quota/keys'` 或写一个 `checkoutUrl` 字符串，
// 本测试即红——2026-10-19 施工时已实证（故意引入 'paypal' 字符串跑红后撤除）。

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_ROOT = join(import.meta.dirname, '..', '..', 'src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** 计费/授权/支付痕迹词（出现即红）。free/local 等中性词不在列；
 * balance 用词边界——引擎固有词 balanced / UNBALANCED_DELIMITER 不误伤。 */
const FORBIDDEN =
  /paypal|license[_ -]?key|quota|checkout|billing|wallet|top-?up|NRC-[A-Z0-9]{4}|\bbalance\b/i;

describe('守卫：开源包零计费/零授权/零支付代码', () => {
  it('src/**.ts 不含计费/授权/支付痕迹', () => {
    const files = walk(SRC_ROOT);
    expect(files.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (FORBIDDEN.test(text)) offenders.push(file);
    }
    expect(offenders, `计费痕迹泄漏：${offenders.join(', ')}`).toEqual([]);
  });

  it('package.json 依赖面只有 SDK 与 zod（不引入数据库/HTTP 框架）', async () => {
    const pkg = JSON.parse(readFileSync(join(SRC_ROOT, '..', 'package.json'), 'utf8'));
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@modelcontextprotocol/sdk',
      'zod',
    ]);
  });
});
