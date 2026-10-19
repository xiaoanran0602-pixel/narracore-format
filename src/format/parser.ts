// TASK-0093：剧本文本粘贴解析器（纯函数，无副作用）。
//
// 输入粘贴的纯文本，输出逐行分类的块草稿，供预览对话框让用户逐行修正后
// 再入库。规则来源＝剧本惯例 + 首位用户转录《不可控核聚变》的实测经验
// （0089 问题合集单 P6 调研）：
//   - 场景标题：`N 内/外 …`、`第 N 场 …`、`场 N …`、`INT./EXT. …`、`内景/外景 …`
//   - 转场：切至/淡出/黑场/CUT TO/FADE OUT 等独立行
//   - 镜头：特写/近景/远景/跟拍 等独立行（或「镜头：」前缀）
//   - 注释：整行被【】包裹
//   - 括注：整行被（）或 () 包裹
//   - 角色→对白：短行（无句末标点）后跟对白行；对白延续到空行或下一结构
//   - 兜底：动作
// TASK-0243 A 组：三语格式扩展（0921 发版前跑测 P1-1）——
//   - 日文放送剧：`〇〜` 场景头、`第N場`；`名前「セリフ」` 单行内联对白
//     （未闭合时跨行吸收到 `」` 收尾行——放送剧窄列折行，日文无空格直接拼接）
//   - 中文台词稿：`人名：台词` / `NAME: 台词` 冒号式单行对白（冒号前后容忍空格）
//   - 名字判据见 isInlineSpeaker；叙述句（`…」と言った`）与含句读的名字不认，
//     落动作交预览修正层——保守原则与既有规则一致：不猜错类型。
// 保守原则：识别不准的行落「动作」并在预览里由用户改——不猜错类型，
// 因为预览本身就是修正层；但绝不把明显的场号/角色行错归动作以外的高语义类型。
// 「47 号仓库」「2024 年冬」这类数字开头的地点/时间行不是场号（场号要求
// 数字后紧跟 内/外/内外/INT/EXT 或「场」字），有专项单测钉住。

import type { ScreenplayBlockType } from './types';
// TASK-0105：括注渲染层自供左右括号（widget + ::after），识别为括注的行
// 必须剥离原文自带的首尾包裹括号，否则页面出现「（（…））」双壳。
import { stripParentheticalShell } from './parenthetical-text';

export interface ParsedRow {
  type: ScreenplayBlockType;
  text: string;
  /** 对白块的说话人推断（来自前面的角色行，仅预览展示用） */
  speaker?: string;
}

/** 结构特征命中数——粘贴拦截用它判断"值得问一句" */
export function countStructuralHits(text: string): number {
  let hits = 0;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (
      SCENE_RE.test(line) ||
      TRANSITION_RE.test(line) ||
      SHOT_RE.test(line) ||
      NOTE_RE.test(line)
    ) {
      hits += 1;
      continue;
    }
    // TASK-0243：内联对白行（日式/冒号式）也是结构特征——中文台词稿整篇
    // 可能只有这一种特征，不认就不弹预览、直接裸粘落动作。
    if (matchInlineDialogue(line) !== undefined) hits += 1;
  }
  return hits;
}

const SCENE_RE =
  /^(?:〇|第\s*[0-9０-９]+\s*[場场]|\d+\s*场|场\s*\d+|\d+(?=\s*(?:内|外|内外|日|夜|晨|黄昏))|INT\.|EXT\.|内景|外景|内外景|(?:内|外|内外)(?=\s\S))/;
const TRANSITION_RE =
  /^(?:切至|切到|硬切|淡出|淡入|渐隐|渐显|黑场|白场|定帧|CUT TO[:\s]|FADE OUT[:\s]|FADE IN[:\s]|DISSOLVE TO[:\s]?)/i;
const SHOT_RE =
  /^(?:镜头[:：]\s*)?(?:特写|大特写|近景|中景|远景|全景|俯拍|仰拍|跟拍|摇镜|推镜|拉镜|长镜|空镜)/;
const NOTE_RE = /^【/;
const PAREN_RE = /^[（(].+[)）]$/;
const SENTENCE_END_RE = /[。！？…；：”」』]$/;
/** 对白行长度上限：超过视为叙述（动作）——按人工转录 674 块实测扫描定参
 * （T 扫描实测：T=30 为总体吻合率峰值 0.810，此时对白召回 0.84 / 金动作
 * 误判 0.16；残余歧义由预览修正层承担）。 */
const DIALOGUE_MAX_CHARS = 30;
// 角色行启发：短、无句末标点、不含逗号长句、非全括注
function isCharacterCue(line: string): boolean {
  if (line.length > 12) return false;
  if (SENTENCE_END_RE.test(line)) return false;
  if (PAREN_RE.test(line) || NOTE_RE.test(line)) return false;
  // 全大写拉丁（英文剧本惯例）
  if (/^[A-Z][A-Z\s.'-]{1,23}$/.test(line)) return true;
  // 中文人名形态：2-6 个汉字（可含·与少量拉丁）
  if (/^[\u4e00-\u9fa5][\u4e00-\u9fa5·]{1,5}$/.test(line)) return true;
  return false;
}

/** 内联对白名字判据（TASK-0243，isCharacterCue 的放宽版：名字只是行前缀，
 * 长度可到 12 CJK / 24 拉丁，且日文名允许假名、全角数字与 `の声`/`Ｍ` 标记）。
 * 拒收形态：含句读（、。，.——叙述行常见）、纯假名串以助词收尾（`彼は「…」`）。 */
const JA_SPEAKER_CHARS_RE = /^[\u4e00-\u9fa5\u3041-\u309f\u30a0-\u30ff０-９Ａ-Ｚ・（）]{1,12}$/;
const JA_KANA_ONLY_RE = /^[\u3041-\u309f\u30a0-\u30ff]+$/;
const JA_PARTICLE_TAIL_RE = /[はがをにでとへも]$/;
const LATIN_ALL_CAPS_RE = /^[A-Z][A-Z\s.'-]{0,23}$/;
const SPEAKER_PUNCT_RE = /[、。，．,]/;
// 日式内联：名前「セリフ」（名前 ≤12 字）；台词稿内联：NAME：台词（名前 ≤24 字，冒号取第一个）
const JA_INLINE_RE = /^(.{1,12})「(.*)$/;
const COLON_INLINE_RE = /^(.{1,24}?)[：:]\s*(.+)$/;

function isInlineSpeaker(name: string): boolean {
  if (!name) return false;
  if (SPEAKER_PUNCT_RE.test(name)) return false;
  // 全大写拉丁（台词稿 `DR. CHANG:`）
  if (LATIN_ALL_CAPS_RE.test(name.trim())) return true;
  // CJK 名形态：汉字/假名/全角数字/・（）全角拉丁（含单字名「张：」）
  if (JA_SPEAKER_CHARS_RE.test(name)) {
    if (JA_KANA_ONLY_RE.test(name) && JA_PARTICLE_TAIL_RE.test(name)) return false;
    return true;
  }
  return false;
}

export interface InlineDialogue {
  name: string;
  /** 台词文本（日式已剥引号壳；冒号式为冒号后整段） */
  text: string;
  /** 日式未闭合（放送剧窄列折行）——主循环需跨行吸收到 `」` 收尾行 */
  open: boolean;
}

/** 单行内联对白判定（日式 `名前「セリフ」` / 台词稿 `NAME：台词`）。
 * 述句防护：`」` 在行中间（`…」と言った。`）不认。 */
function matchInlineDialogue(line: string): InlineDialogue | undefined {
  const ja = line.match(JA_INLINE_RE);
  if (ja && isInlineSpeaker(ja[1]!)) {
    const rest = ja[2]!;
    if (rest.endsWith('」')) {
      return { name: ja[1]!, text: rest.slice(0, -1), open: false };
    }
    if (!rest.includes('」')) {
      return { name: ja[1]!, text: rest, open: true };
    }
    return undefined;
  }
  const colon = line.match(COLON_INLINE_RE);
  if (colon) {
    const name = colon[1]!.trim();
    if (isInlineSpeaker(name)) return { name, text: colon[2]!, open: false };
  }
  return undefined;
}

export function parseScreenplayText(input: string): ParsedRow[] {
  const rows: ParsedRow[] = [];
  // 空行是块分隔符：角色-对白的延续以空行收口（经典剧本排版）
  const runs = input.split(/\r\n|\r|\n/).reduce<string[][]>((acc, raw) => {
    const line = raw.trim();
    if (!line) {
      acc.push([]);
      return acc;
    }
    if (acc.length === 0) acc.push([]);
    acc[acc.length - 1].push(line);
    return acc;
  }, []);

  for (const run of runs) {
    if (run.length === 0) continue;
    let speaker: string | undefined;
    let i = 0;
    while (i < run.length) {
      const line = run[i];
      if (SCENE_RE.test(line)) {
        speaker = undefined;
        rows.push({ type: 'scene_heading', text: line });
      } else if (TRANSITION_RE.test(line)) {
        speaker = undefined;
        rows.push({ type: 'transition', text: line });
      } else if (SHOT_RE.test(line)) {
        speaker = undefined;
        rows.push({ type: 'shot', text: line });
      } else if (NOTE_RE.test(line)) {
        speaker = undefined;
        rows.push({ type: 'note', text: line });
      } else if (PAREN_RE.test(line)) {
        // 独立括注行：有前文角色语境归括注，否则也可能是动作里的注释性括号。
        // TASK-0105：写入文本去壳——括号由渲染层补，文档模型存纯净文本。
        rows.push({ type: 'parenthetical', text: stripParentheticalShell(line) });
      } else if (matchInlineDialogue(line) !== undefined) {
        // TASK-0243：单行内联对白（日式/台词稿冒号式）——一行给出说话人+台词，
        // 拆为 character + dialogue 两块。日式未闭合时跨行吸收到 `」` 收尾行
        // （吸收遇场头/转场/镜头/注释等结构行终止，该行交回主循环处理）。
        const inline = matchInlineDialogue(line)!;
        speaker = inline.name;
        rows.push({ type: 'character', text: inline.name });
        // 内联式自带完整语义（说话人+台词），与两行式的「后续行延续对白」
        // 语境不同——放送剧/台词稿每句都带名前，其后的短行是叙述不是续白。
        speaker = undefined;
        if (!inline.open) {
          rows.push({ type: 'dialogue', text: inline.text, speaker: inline.name });
        } else {
          let content = inline.text;
          let j = i + 1;
          // 审查 F-P2-1：收尾判据是「行内出现 `」`」，不是仅行尾裸 `」`——
          // `」。`（台词带句读收尾）是放送剧常见形态，只查行尾会连壳吞掉
          // 后续叙述。壳后纯标点并入对白（它是台词句尾）；有实义文字则把
          // 剩余文本放回 run[j] 交回主循环按普通行处理。
          const PUNCT_TAIL_RE = /^[。、．，．！？…〜～]*$/;
          while (j < run.length) {
            const next = run[j]!;
            if (
              SCENE_RE.test(next) ||
              TRANSITION_RE.test(next) ||
              SHOT_RE.test(next) ||
              NOTE_RE.test(next)
            ) {
              break;
            }
            const closeIdx = next.indexOf('」');
            if (closeIdx >= 0) {
              content += next.slice(0, closeIdx);
              const rest = next.slice(closeIdx + 1);
              if (PUNCT_TAIL_RE.test(rest)) {
                content += rest;
                j += 1;
              } else {
                run[j] = rest.trim();
              }
              break;
            }
            content += next;
            j += 1;
          }
          rows.push({ type: 'dialogue', text: content, speaker: inline.name });
          i = j;
          continue;
        }
      } else if (
        isCharacterCue(line) &&
        i + 1 < run.length &&
        // 角色行必须后随对白（或括注+对白），孤立短行落动作。
        // 后随行若是内联对白（自带说话人，如 `人名：台词`），
        // 当前短行是署名/噪音而非角色（TASK-0243）。
        matchInlineDialogue(run[i + 1]!) === undefined &&
        (i + 2 < run.length || !PAREN_RE.test(run[i + 1]!))
      ) {
        speaker = line;
        rows.push({ type: 'character', text: line });
      } else if (speaker !== undefined && line.length <= DIALOGUE_MAX_CHARS && !NOTE_RE.test(line)) {
        rows.push({ type: 'dialogue', text: line, speaker });
      } else {
        // 对白终止（TASK-0093 实测校准）：无空行分隔时，长行（叙述性动作）
        // 结束对白延续，后续行回到动作；新角色行会重新开启对白语境。
        speaker = undefined;
        rows.push({ type: 'action', text: line });
      }
      i += 1;
    }
  }
  return rows;
}
