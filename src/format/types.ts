// 本地最小类型声明（策划 §6.2）——替代主仓库由 OpenAPI 生成的 client-sdk。
// parser.ts / layout-rules.ts 只消费 ScreenplayBlockType 与 DocumentBlock 的
// type / text 字段。id 与 scene_id 为可选字段：主仓库 layout-rules.test.ts
// 的测试数据携带它们，保留可让断言零改动迁移。

export type ScreenplayBlockType =
  | 'scene_heading'
  | 'action'
  | 'character'
  | 'parenthetical'
  | 'dialogue'
  | 'transition'
  | 'shot'
  | 'note';

export interface DocumentBlock {
  type: ScreenplayBlockType;
  text: string;
  id?: string;
  scene_id?: string | null;
}
