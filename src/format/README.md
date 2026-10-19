# format/ —— 排版核心（从 Narracore 私有仓复制，来源链第三段）

本目录是 [Narracore](https://narracore.cn) 剧本排版引擎的开源副本。

**来源链**：Narracore 主仓库 → 私有仓 narracore-mcp（vendored 副本）→ 本公开仓。
复制纪律沿用 narracore-mcp（原样复制、只允许改 import；与上游 diff 必须逐字可解释）。

## 复制记录（第三段）

复制自私有仓 narracore-mcp commit **2b31dd8**（2026-10-19）。上游来源（第二段，详见
私有仓 `src/format/README.md`）：

| 本仓库文件 | 私有仓来源（narracore-mcp） | 主仓库最终来源（frontend/web/src/features/manuscript-editor/ 下） | 改动 |
| --- | --- | --- | --- |
| `src/format/parser.ts` | `src/format/parser.ts` | `smart-paste/parser.ts`（主仓 fb572385 / HEAD 04257491） | 无（逐字一致） |
| `src/format/parenthetical-text.ts` | 同名 | `screenplay/parenthetical-text.ts`（主仓 e2bd9174） | 无 |
| `src/format/layout-rules.ts` | 同名 | `layout/layout-rules.ts`（主仓 e2bd9174） | 无 |
| `src/format/scene-heading-parse.ts` | 同名 | `screenplay/scene-heading-parse.ts`（主仓 9c781b16） | 无 |
| `src/format/types.ts` / `confidence.ts` / `pre-normalize.ts` / `to-plain-text.ts` / `fountain.ts` | 同名 | narracore-mcp 自写（非主仓复制件） | 无 |
| `test/format/*.test.ts` + `__snapshots__/` | `test/format/` | parser/layout-rules 测试为主仓复制件；其余为 narracore-mcp 自写 | 无 |

> 本公开仓未随迁：`test/format/regression-0919.test.ts`（断言 PDF 渲染链路，
> 开源包不含 PDF 能力——PDF 成品是 narracore.app hosted 服务的专属差异点）。

## 同步纪律

- 上游（主仓库 → narracore-mcp）排版规则变更时：人工同步到本目录 → 快照测试
  （`test/format/layout-rules.test.ts` 的 `__snapshots__`）必须逐字通过——这是
  「与 narracore.cn 网站排版一致」的机器证明。
- 若上游改了 `DIALOGUE_MAX_CHARS` / 句末标点正则，`confidence.ts` 与
  `pre-normalize.ts`（自持副本）一并核对。
- 若主仓库落地 `shared/editor-spec` 包（ADR-0051 §六），本目录改为消费该包。
