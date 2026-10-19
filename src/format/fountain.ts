// Fountain 双向转换（P7-6，本仓库新写——主仓库无实现）。
// 子集口径（确定性、无启发式歧义）：
// - 场景头：INT/EXT/EST/I/E 前缀行；中文「第N场/场N」由 CJK 回落路径的
//   现有解析器承担
// - 角色行：ASCII 全大写短行（≤40）且后随非空行；@ 强制；尾缀 (V.O.) 等扩展
//   剥离为 delivery
// - 括注：对话串内以 ( 开头的行；对白：角色行后的非空行
// - 转场：全大写且以 TO: 结尾，或 > 前缀强制
// - 动作：默认；. 前缀强制
// - 注释：[[…]] → note 块；boneyard /*…*/ 整段剔除（计数上报）
// - 章节头 #/##、标题页 Key:、居中 >text< 不属八块模型 → 保留性跳过并计 warning

import { parseScreenplayText } from './parser';
import { preNormalizeScreenplayText } from './pre-normalize';
import type { DocumentBlock } from './types';

export interface FountainParseResult {
  blocks: Array<{ type: string; text: string; speaker?: string; delivery?: string }>;
  warnings: string[];
}

const SCENE_HEADING_RE = /^(INT|EXT|EST|INT\.?\/EXT\.?|I\/E)[\s./]/i;
const TRANSITION_RE = /^[A-Z0-9 ,.'()-]*TO:$/;
const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

function isAsciiOnly(text: string): boolean {
  return /^[\x20-\x7e]*$/.test(text);
}

/** CJK 占比 ≥ 0.3 → 走中文解析器回落（Fountain 规则面向拉丁剧本）。 */
export function looksChinese(text: string): boolean {
  const chars = Array.from(text);
  if (chars.length === 0) return false;
  const cjk = chars.filter((ch) => CJK_RE.test(ch)).length;
  return cjk / chars.length >= 0.3;
}

/** 剔除 boneyard（/*…*\/ 整段），返回剩余文本与剔除段数。 */
function stripBoneyard(text: string): { text: string; count: number } {
  let count = 0;
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, () => {
    count += 1;
    return '';
  });
  return { text: stripped, count };
}

/** TASK-0243 同步·往返保形（P12，自持文件）。to_fountain 把 character+dialogue
 *  对序列化为「名\n台词」两行段，两种形态回解析会与直析块序列分叉 → 指纹漂移
 *  （同一剧本二次扣费）：
 *  ① 「过内联名门、不过严格 cue 门」的名字（7-12 汉字、含假名、全角数字、
 *     单字名）——直析按冒号/日式拆块，回解析过不了 isCharacterCue 的 2-6
 *     汉字门 → 整段落动作；
 *  ② 台词 >30 字的单行段（跨行吸收合并的日文长对白、blocks 模式长对白）——
 *     回解析被 pre-normalize rule-3 折行 → 一块对白变两块。
 *  修法：回解析前把这两种两行段以全角冒号接回原文形态（colon-inline 无长度
 *  上限，pre-normalize 的内联守卫保证不折行）。门函数与 parser
 *  isCharacterCue / isInlineSpeaker 同步（自持副本纪律，见 format/README）。 */
const STRICT_CUE_HANZI_RE = /^[\u4e00-\u9fa5][\u4e00-\u9fa5·]{1,5}$/;
const STRICT_CUE_LATIN_RE = /^[A-Z][A-Z\s.'-]{1,23}$/;
const INLINE_NAME_RE = /^[\u4e00-\u9fa5\u3041-\u309f\u30a0-\u30ff０-９Ａ-Ｚ・（）]{1,12}$/;
const DIALOGUE_MAX_CHARS = 30; // 与 parser.ts 同值的自持副本（同步纪律）
/** 段内第二行若是结构行则不接（to_fountain 不会产出该形态，防用户手写误伤）。 */
const STRUCTURAL_START_RE =
  /^(?:〇|第\s*[0-9０-９]+\s*[場场]|\d+\s*场|场\s*\d+|INT\.|EXT\.|内景|外景|切至|特写|【|[（(])/;

function isDivergentCueName(line: string): boolean {
  if (line.length === 0 || line.length > 12) return false;
  if (STRICT_CUE_HANZI_RE.test(line) || STRICT_CUE_LATIN_RE.test(line)) return false;
  return INLINE_NAME_RE.test(line);
}

function rejoinColonInline(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => {
      const lines = para
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '');
      // 只接「名 + 一行」的两行段：多行段含折行对白串，接了反而吞并延续行
      if (
        lines.length === 2 &&
        !STRUCTURAL_START_RE.test(lines[1]!) &&
        (isDivergentCueName(lines[0]!) ||
          ((STRICT_CUE_HANZI_RE.test(lines[0]!) || STRICT_CUE_LATIN_RE.test(lines[0]!)) &&
            Array.from(lines[1]!).length > DIALOGUE_MAX_CHARS))
      ) {
        return `${lines[0]}：${lines[1]}`;
      }
      return para;
    })
    .join('\n\n');
}

/** Fountain 文本 → MCP 类型化块。中文内容回落 parseScreenplayText 并回填 speaker。 */
export function fountainToBlocks(input: string): FountainParseResult {
  const warnings: string[] = [];
  const { text: withoutBoneyard, count } = stripBoneyard(input.replace(/\r\n?/g, '\n'));
  if (count > 0) warnings.push(`${count} boneyard section(s) (/* … */) removed.`);

  if (looksChinese(withoutBoneyard)) {
    // 中文回落：解包 [[note]] 行 → 冒号往返保形 → 前置归一 + 现有文本解析器
    // （复制件）+ 对白回填说话人；[[…]] 解包保证 to_fountain 导出的 note
    // 往返指纹一致
    const unwrapped = withoutBoneyard.replace(/^(\s*)\[\[(.+)\]\](\s*)$/gm, '$1$2$3');
    const normalized = preNormalizeScreenplayText(rejoinColonInline(unwrapped));
    const rows = parseScreenplayText(normalized.text);
    let lastSpeaker: string | undefined;
    const blocks = rows.map((row) => {
      if (row.type === 'character') {
        lastSpeaker = row.text.trim();
      } else if (row.type !== 'dialogue' && row.type !== 'parenthetical') {
        lastSpeaker = undefined;
      }
      return row.type === 'dialogue' && lastSpeaker !== undefined
        ? { type: row.type, text: row.text, speaker: lastSpeaker }
        : { type: row.type, text: row.text };
    });
    warnings.push('Content is mostly Chinese — parsed with the Chinese screenplay parser (Fountain rules target Latin scripts).');
    return { blocks, warnings };
  }

  const blocks: FountainParseResult['blocks'] = [];
  const lines = withoutBoneyard.split('\n');
  let i = 0;
  let titlePageDone = false;

  while (i < lines.length) {
    const raw = lines[i]!;
    const line = raw.trim();
    if (line === '') {
      i += 1;
      continue;
    }

    // 标题页（首个内容块之前的 Key: 或 Key: value 行）：跳过
    if (!titlePageDone && blocks.length === 0 && /^[A-Za-z][A-Za-z ]*:(\s|$)/.test(line)) {
      warnings.push(`Title page key "${line.split(':')[0]}:" skipped (not part of the 8-block model).`);
      i += 1;
      continue;
    }
    titlePageDone = true;

    // 章节头
    if (/^#{1,3}\s/.test(line)) {
      warnings.push(`Section header "${line.slice(0, 24)}" skipped (not part of the 8-block model).`);
      i += 1;
      continue;
    }

    // 注释 [[…]]
    if (line.startsWith('[[')) {
      blocks.push({ type: 'note', text: line.replace(/^\[\[/, '').replace(/\]\]$/, '').trim() });
      i += 1;
      continue;
    }

    // 场景头
    if (SCENE_HEADING_RE.test(line)) {
      blocks.push({ type: 'scene_heading', text: line.toUpperCase() });
      i += 1;
      continue;
    }

    // 转场：> 强制 或 全大写 …TO:
    if (line.startsWith('>') && !line.endsWith('<')) {
      blocks.push({ type: 'transition', text: line.slice(1).trim().toUpperCase() });
      i += 1;
      continue;
    }
    if (TRANSITION_RE.test(line) && line === line.toUpperCase()) {
      blocks.push({ type: 'transition', text: line });
      i += 1;
      continue;
    }

    // 居中 >text<
    if (line.startsWith('>') && line.endsWith('<')) {
      blocks.push({ type: 'action', text: line.slice(1, -1).trim() });
      i += 1;
      continue;
    }

    // 角色行：@ 强制，或全大写短行（排除括注/动作前缀）且后随非空行
    const forcedCue = line.startsWith('@') ? line.slice(1).trim() : null;
    const upperCue =
      line === line.toUpperCase() &&
      /[A-Z]/.test(line) &&
      !line.startsWith('(') &&
      !line.startsWith('.')
        ? line
        : null;
    const cue = forcedCue ?? upperCue;
    const hasNextLine = i + 1 < lines.length && lines[i + 1]!.trim() !== '';
    if (cue !== null && cue.length > 0 && cue.length <= 40 && hasNextLine) {
      let speaker = cue;
      let delivery: string | undefined;
      const ext = speaker.match(/\(([^)]*)\)\s*$/);
      if (ext) {
        speaker = speaker.slice(0, ext.index).trim();
        delivery = ext[1]?.trim();
      }
      i += 1;
      const runStart = blocks.length; // character 将插到对话串之首
      while (i < lines.length && lines[i]!.trim() !== '') {
        const dLine = lines[i]!.trim();
        if (dLine.startsWith('(') && dLine.endsWith(')')) {
          // 剥外层括号：与 delivery 派生的括注块同形（渲染层原样输出）
          blocks.push({ type: 'parenthetical', text: dLine.slice(1, -1).trim() || dLine });
        } else {
          blocks.push({
            type: 'dialogue',
            text: dLine,
            ...(delivery ? { delivery } : {}),
            speaker,
          });
          delivery = undefined; // 扩展只挂在首句前
        }
        i += 1;
      }
      blocks.splice(runStart, 0, { type: 'character', text: speaker });
      continue;
    }

    // 强制动作
    if (line.startsWith('.') && !line.startsWith('..')) {
      blocks.push({ type: 'action', text: line.slice(1).trim() });
      i += 1;
      continue;
    }

    blocks.push({ type: 'action', text: line });
    i += 1;
  }

  return { blocks, warnings };
}

/** MCP 渲染块 → Fountain 文本（拉丁部分按惯例大写，CJK 原样）。 */
export function blocksToFountain(blocks: readonly DocumentBlock[]): string {
  const paragraphs: string[] = [];
  let dialogueRun: string[] = [];

  const flushDialogue = () => {
    if (dialogueRun.length > 0) {
      paragraphs.push(dialogueRun.join('\n'));
      dialogueRun = [];
    }
  };

  for (const block of blocks) {
    const text = block.text.trim();
    if (text === '') continue;
    switch (block.type) {
      case 'scene_heading':
        flushDialogue();
        paragraphs.push(isAsciiOnly(text) ? text.toUpperCase() : text);
        break;
      case 'character':
        flushDialogue();
        dialogueRun.push(isAsciiOnly(text) ? text.toUpperCase() : text);
        break;
      case 'parenthetical':
        dialogueRun.push(text.startsWith('(') ? text : `(${text})`);
        break;
      case 'dialogue':
        dialogueRun.push(text);
        break;
      case 'transition':
        flushDialogue();
        paragraphs.push(isAsciiOnly(text) ? text.toUpperCase() : text);
        break;
      case 'shot':
        flushDialogue();
        paragraphs.push(isAsciiOnly(text) ? text.toUpperCase() : text);
        break;
      case 'note':
        flushDialogue();
        paragraphs.push(`[[${text}]]`);
        break;
      case 'action':
      default:
        flushDialogue();
        paragraphs.push(text);
        break;
    }
  }
  flushDialogue();
  return `${paragraphs.join('\n\n')}\n`;
}
