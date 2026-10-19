// 括注文本规范化（TASK-0105）：剥离首尾成对的包裹括号。
//
// 背景（2026-09-01 走查实证）：括注块的左/右括号由渲染层供给——
// parenthetical-decoration.ts 的 widget 挂左括号「（」、editor-theme.css
// 的 ::after 补右括号「）」，且明确约束「括号不进文档模型、不进保存载荷」。
// 但用户提供的原文常常已自带包裹括号（智能粘贴 `（老干部读稿）`、手工把
// 带括号文本切到括注块），不剥离就会渲染成 `（（…））` 双壳。
//
// 规则（保守）：仅当文本**首字符与尾字符是一对匹配的包裹括号**且剥壳后
// 仍剩内容时才剥——只剥一层。句中括号（`前（中）后`）、不成对首尾
// （`（abc`）、空壳（`（）` 剥完为空）一律不动。中文全角与半角各自匹配，
// 不做交叉（`（abc)` 不剥，保留用户原文的可还原性）。

const SHELL_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['（', '）'],
  ['(', ')'],
];

/** 剥离首尾一层成对包裹括号；不匹配或剥后为空时原样返回。 */
export function stripParentheticalShell(text: string): string {
  if (text.length < 2) return text;
  const first = text[0];
  const last = text[text.length - 1];
  for (const [open, close] of SHELL_PAIRS) {
    if (first === open && last === close) {
      const inner = text.slice(1, -1);
      return inner.length > 0 ? inner : text;
    }
  }
  return text;
}

/** 判断文本是否首尾被一层成对包裹括号包住（供测试与调用方预判）。 */
export function hasParentheticalShell(text: string): boolean {
  return text.length >= 2 && stripParentheticalShell(text) !== text;
}
