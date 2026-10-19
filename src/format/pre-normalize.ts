// 文本模式前置归一层（P7-9 极限验收，PLAN §0.6.5）：
// 复制纪律禁止改 parser.ts，本模块在解析器**之前**把常见转录形态改写成
// 解析器已声明的惯例格式（纯文本变换，不做语义猜测）：
//   1. 「角色 (扩写)」行 → 角色行 + 括注行（真实剧本《不可控核聚变》实测
//      41 处：cue 行超 12 字被漏识别 → 连锁把整段对白判成动作）
//   2. PDF 转录残留：换页符 \f 与独立成行的页码「N.」（实测 38 处）
//   3. 角色行语境下的超长对白行（>30 字，无换行粘贴）→ 按句末标点软折行
//      到 ≤30 字（DIALOGUE_MAX_CHARS 的自持副本，同步纪律见 format/README）
//   4. 病理长墙（≤2 个换行且 >300 字）→ 按句切分；结构守卫仍会诚实上报
//      UNRESOLVED_STRUCTURE（结构语义不猜）
// 变换发生时上报 info 级诊断 SOURCE_NORMALIZED（透明、可审计）。

export interface PreNormalizeResult {
  text: string;
  /** 变换计数（全 0 = 原文未动） */
  changes: {
    cueSplits: number;
    pageArtifactsStripped: number;
    dialogueLinesWrapped: number;
    wallSentenceSplit: boolean;
  };
}

/** 与 parser.ts isCharacterCue 同一门（同步纪律见 format/README）：≤12 长、
 *  非句末标点、非括注/批注行，全大写拉丁或 2-6 汉字。
 *  0919 审查 B7：旧 CUE_NAME_RE 无 12 字长上限、句末标点集与 parser 不一致，
 *  两处口径漂移会让本层与解析器对「谁是角色行」判断不同。 */
const PARSER_SENTENCE_END_RE = /[。！？…；：”」』]$/;
function isCueLike(line: string): boolean {
  if (line.length > 12) return false;
  if (PARSER_SENTENCE_END_RE.test(line)) return false;
  if (/^[（(]/.test(line) || /^【/.test(line)) return false;
  if (/^[A-Z][A-Z\s.'-]{1,23}$/.test(line)) return true;
  if (/^[\u4e00-\u9fa5][\u4e00-\u9fa5·]{1,5}$/.test(line)) return true;
  return false;
}
/** 「角色 (扩写)」整行：名字是 cue 形态 + 末尾一对括号 */
const CUE_EXT_RE =
  /^([\u4e00-\u9fa5][\u4e00-\u9fa5·]{1,5}|[A-Z][A-Z\s.'-]{1,23})\s*[（(]([^()（）]*)[）)]\s*$/;
/** 与 parser.ts DIALOGUE_MAX_CHARS 同值的自持副本（同步纪律） */
const DIALOGUE_MAX_CHARS = 30;
const SENTENCE_END = /[。！？；…]/;
/** 行内是否含 CJK 字符：rule 3 软折行只对含 CJK 的行启用（0919 审查 B7）。 */
const HAS_CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

/** 内联对白行的保守近似判据（P12 三语同步，对应 parser TASK-0243）：
 *  `人名：台词`（前缀 ≤24 字无句读/空白）或 `名前「セリフ」`（前缀 ≤12 字）。
 *  这类行 rule 3 不折行——parser 原生接受任意长度的内联对白；冒号式没有
 *  「open 跨行吸收」语义，折行会把超长台词的尾巴切成动作块。 */
const INLINE_COLON_RE = /^[^、。，．,\s：:「」【（()]{1,24}[：:]/;
const INLINE_JA_RE = /^[^、。，．,\s「」【（()]{1,12}「/;
function looksInlineDialogue(line: string): boolean {
  return INLINE_JA_RE.test(line) || INLINE_COLON_RE.test(line);
}

function nextNonBlankExists(lines: string[], from: number): boolean {
  for (let j = from + 1; j < lines.length; j += 1) {
    if (lines[j]!.trim() !== '') return true;
    return false; // 只看紧邻的下一个非空行（空行即断）
  }
  return false;
}

/** 超长对白软折行：优先句末标点断点，其次窗口内空格断点（不切断英文单词），
 *  最后按字硬切，保证每行 ≤30 字。 */
function wrapDialogueLine(line: string): string[] {
  const chars = Array.from(line);
  if (chars.length <= DIALOGUE_MAX_CHARS) return [line];
  const out: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length > 0) {
      out.push(buffer.join(''));
      buffer = [];
    }
  };
  for (const ch of chars) {
    buffer.push(ch);
    if (SENTENCE_END.test(ch) && buffer.length >= 8) {
      // 句末断点：行已具合理长度才断，避免「了。」这类碎行
      flush();
    } else if (buffer.length === DIALOGUE_MAX_CHARS) {
      // 硬切前先看窗口内最后一个空格（0919 审查 B7）：混排行的英文单词不在
      // 词中间切断；找不到合理空格才按字切（保真优先，不删字）
      const spaceIdx = buffer.lastIndexOf(' ');
      if (spaceIdx >= 8) {
        out.push(buffer.slice(0, spaceIdx).join(''));
        buffer = buffer.slice(spaceIdx + 1);
      } else {
        flush();
      }
    }
  }
  flush();
  return out;
}

export function preNormalizeScreenplayText(input: string): PreNormalizeResult {
  const changes = {
    cueSplits: 0,
    pageArtifactsStripped: 0,
    dialogueLinesWrapped: 0,
    wallSentenceSplit: false,
  };

  // 4. 病理长墙：按句切分（结构守卫随后仍会告警，不冒充识别）
  let text = input;
  const newlineCount = (text.match(/\n/g) ?? []).length;
  const charCount = Array.from(text).length;
  if (newlineCount <= 2 && charCount > 300) {
    text = text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/([。！？；…])/g, '$1\n');
    changes.wallSentenceSplit = true;
  }

  // 2. PDF 换页符 → 换行
  const lines = text.replace(/\f/g, '\n').split(/\r\n|\r|\n/);
  const out: string[] = [];

  let inDialogueContext = false; // 上一有效行是角色行或其对白串
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]!;
    const line = raw.trim();

    if (line === '') {
      inDialogueContext = false; // 空行收口对白串
      out.push(raw);
      continue;
    }

    // 2. 独立页码「N.」
    if (/^\d{1,3}\.$/.test(line)) {
      changes.pageArtifactsStripped += 1;
      continue;
    }

    // 1. 「角色 (扩写)」→ 角色行 + 括注行（须后随对白才拆）
    const cueExt = line.match(CUE_EXT_RE);
    if (cueExt !== null && nextNonBlankExists(lines, i)) {
      const [, name, ext] = cueExt;
      out.push(name!);
      out.push(`(${ext!.trim()})`);
      changes.cueSplits += 1;
      inDialogueContext = true; // 括注行后进对白语境
      continue;
    }

    // 3. 对白语境下的超长行软折行（角色行自身不会超 30；叙述长行不在此列，
    //    因为动作语境下 inDialogueContext=false）。
    //    0919 审查 B7：只对含 CJK 的行启用——英文无句末标点可断，按 30 码点硬切
    //    会切断单词，且切出的短行满足解析器对白门，把紧随角色的动作行整段改判
    //    成对白。英文/纯拉丁长行保持原样交给解析器（>30 判动作，符合其校准）。
    if (
      inDialogueContext &&
      HAS_CJK_RE.test(line) &&
      !isCueLike(line) &&
      !looksInlineDialogue(line) &&
      Array.from(line).length > DIALOGUE_MAX_CHARS
    ) {
      const wrapped = wrapDialogueLine(line);
      if (wrapped.length > 1) changes.dialogueLinesWrapped += 1;
      out.push(...wrapped);
      continue;
    }

    if (isCueLike(line) && nextNonBlankExists(lines, i)) {
      inDialogueContext = true;
    } else if (!/^[（(]/.test(line)) {
      // 括注行不改变语境；其余非角色行在对白串内若是短行，语境延续由解析器
      // 自行判定，这里仅维护「上一行是否角色行」的近似语境
      if (!inDialogueContext || Array.from(line).length > DIALOGUE_MAX_CHARS) {
        inDialogueContext = false;
      }
    }
    out.push(raw);
  }

  return { text: out.join('\n'), changes };
}
