// 移植自主仓库 backend/core/src/modules/analysis/scene_contract.py（9c781b16）。
// 行为由 test/analysis/fixtures/golden.json 金样例锁定（生成：tools/golden-gen.py）。
// Schema 与枚举键是代码不是内容：模型不能发明到达持久层的类型串。

/** 模型输出契约版本（scene.cinematic.v1）。 */
export const SCENE_SCHEMA_VERSION = 'scene.cinematic.v1';

/** 「不可拍」问题类型（键，不是散文；criteria 文案在提示词内容版本里）。 */
export const PROBLEM_TYPES = [
  'abstract_psychology',
  'literary_summary',
  'unfilmable_information',
  'unclear_space',
  'weak_visible_action',
  'unplayable_direction',
] as const;

export type ProblemType = (typeof PROBLEM_TYPES)[number];

/** 严重度是语义分级，不是分数（数字仍由程序产出）。 */
export const SEVERITIES = ['low', 'medium', 'high'] as const;

export type Severity = (typeof SEVERITIES)[number];

/**
 * 交给客户端 AI 的严格 JSON Schema（原样移植）。`blocks` 是素材的块**序号**
 * （1 起，渲染素材里的位置），不是 UUID：模型引用它看到的位置，程序把
 * 序号映射回真实块 id。
 */
export const SCENE_ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'problems'],
  properties: {
    summary: { type: 'string', maxLength: 400 },
    problems: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'severity', 'evidence', 'blocks', 'suggestion'],
        properties: {
          type: { type: 'string', enum: [...PROBLEM_TYPES] },
          severity: { type: 'string', enum: [...SEVERITIES] },
          evidence: { type: 'string', maxLength: 400 },
          blocks: { type: 'array', maxItems: 8, items: { type: 'integer' } },
          suggestion: { type: 'string', maxLength: 400 },
        },
      },
    },
  },
} as const;
