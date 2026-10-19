# analysis/ —— 主仓库分析模块的 TS 移植（金样例纪律）

移植时主仓库 commit：**9c781b162ab26d2010fc3ca8f2430bac4e80cb6a**（2026-09-16）

主仓库这些模块是 Python（backend/core/src/modules/analysis/），移植目标是 TS——
**移植不是复制**，不适用 format/ 的「只改 import」纪律，改用金样例纪律：
行为由主仓库 Python 实际输出锁定。

| 本仓库文件 | 主仓库来源 | 内容 |
| --- | --- | --- |
| `scene-contract.ts` | `scene_contract.py` | SCENE_SCHEMA_VERSION / PROBLEM_TYPES 6 类 / SEVERITIES / SCENE_ANALYSIS_SCHEMA（原样） |
| `render-guard.ts` | `render_guard.py` | 渲染键守卫（整词匹配、camelCase 切词、递归路径） |
| `scene-material.ts` | `scene_material.py` | SceneBlock / sceneBlocks / renderSceneMaterial / sceneContentFingerprint / mapEvidence（含 Python isspace 语义的空白归一） |
| `scoring.ts` | `scoring.py` 前半 | 五项确定性统计 + normalizeCharacterName + charCount（码点计）+ pyRound |
| `scene-score.ts` | `scoring.py` 后半 | ai-2.0 计分：BigInt 精确分数（对应 fractions.Fraction）/ computeSceneScore / penaltyPoints / 证据定位 / ruleBaseline / scoreAiFindings |
| `executors.ts` | `executors.py` | splitByScene + 五个统计执行器（函数体逐字移植，仅去掉 Connection / run_id / project_id 装配层参数） |
| `adapter.ts` | （narracore-mcp 自有） | MCP 渲染块 → 快照载荷适配层 |

## 金样例

- 期望值文件：`test/analysis/fixtures/golden.json`（输入与期望同文件，测试自含）。
- 对照测试：`test/analysis/golden.test.ts`（30 例：三份载荷 × 五执行器、
  sceneBlocks/素材渲染/指纹、mapEvidence 14 种路径、计分纯函数 7 例、
  render_guard、scoreAiFindings 17 种模型输出含去重顺序无关）。

## 与私有仓 narracore-mcp 版本的差异登记

- 复制自 narracore-mcp commit **2b31dd8**（2026-10-19）。
- `scene-score.ts` 一处等价改写：`Frac.fromDecimalString` 内正则匹配从
  `re.exec(s)` 改为 `s.match(re)`（无 /g 标志的正则两者结果逐字段一致）——
  行为由金样例测试锁定，测试全绿即等价性证明。
- 移植的保真要点（码点 vs UTF-16、Python isspace、精确分数、pyRound 半偶、
  已知不可弥合差异）见私有仓 `src/analysis/README.md`，此处不重复；两仓
  同步时以该文件为核对清单。

## 同步纪律（对应 src/format/README 的复制件纪律）

- 主仓库 `analysis/` 任一源文件变更时：重新生成 golden.json → 人工核对 diff
  并按需同步 TS 移植（narracore-mcp 与本公开仓两处）→ 金样例测试必须全绿。
- 版本常量（ANALYZER_VERSION / AI_SCORING_VERSION / EVIDENCE_MAP_VERSION /
  RULE_BASELINE_VERSION / SCENE_SCHEMA_VERSION）与主仓库一一对应，测试锁定；
  主仓库升版本而本仓库未跟随时金样例测试即红。
