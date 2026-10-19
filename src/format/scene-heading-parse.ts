// 场景标题文本 → 结构化解析（TASK-0041 R2，对齐基线写剧本界面.png 场景行）。
// 文本仍是唯一事实（序列化不变量 AC-2 不动）；本模块只把自由文本解析成
// 「场号 / 地点 / 时段 / 内外」供 NodeView 渲染成结构化外观。
// 输入例：「场 1 咖啡馆 日 内」「第一场 夜 内 城市天台」「INT. CAFE - DAY」。

export interface ParsedSceneHeading {
  /** 场号标签（如「场 1」「第一场」「SCENE 1」；无则 null） */
  sceneLabel: string | null;
  /** 地点（剩余主体文本；无则 null） */
  location: string | null;
  /** 时段：日 / 夜 / 晨 / 昏（中英文；无则 null） */
  timeOfDay: string | null;
  /** 内外：内 / 外（INT/EXT；无则 null） */
  interior: string | null;
}

const TIME_OF_DAY = new Set(['日', '夜', '晨', '昏', '傍晚', '清晨', '黎明', '黄昏']);
const INTERIOR_ZH = new Set(['内', '外']);
const TIME_EN: Record<string, string> = {
  DAY: '日', NIGHT: '夜', MORNING: '晨', DUSK: '昏', DAWN: '晨', EVENING: '昏',
};

/** 解析中文场景标题：「场 1 咖啡馆 日 内」/「第一场 夜 内 城市天台」 */
function parseChinese(text: string): ParsedSceneHeading | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  let sceneLabel: string | null = null;
  let timeOfDay: string | null = null;
  let interior: string | null = null;
  const locationParts: string[] = [];

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i] as string;
    // 场号：「场 1」「第一场」「第1场」——可能在同一 token（场1）或跨两个 token（场 1）
    if (sceneLabel === null) {
      const m = tok.match(/^第?([0-9一二三四五六七八九十百千]+)场$/);
      if (m) {
        sceneLabel = tok;
        continue;
      }
      if (tok === '场' && i + 1 < tokens.length && /^[0-9]+$/.test(tokens[i + 1] as string)) {
        sceneLabel = `场 ${tokens[i + 1]}`;
        i += 1;
        continue;
      }
      if (tok === '场' || tok === '第') {
        // 「场」单独但后面不是数字 → 当地点一部分
      }
    }
    // 内外
    if (interior === null && INTERIOR_ZH.has(tok)) {
      interior = tok;
      continue;
    }
    // 时段
    if (timeOfDay === null && TIME_OF_DAY.has(tok)) {
      timeOfDay = tok;
      continue;
    }
    locationParts.push(tok);
  }

  const location = locationParts.join(' ').trim() || null;
  // 至少要有场号或地点才算解析成功（避免把普通动作行误判为场景）
  if (sceneLabel === null && location === null) return null;
  return { sceneLabel, location, timeOfDay, interior };
}

/** 解析英文场景标题：「INT. CAFE - DAY」/「EXT. ROOFTOP - NIGHT」 */
function parseEnglish(text: string): ParsedSceneHeading | null {
  const m = text.match(/^\s*(INT|EXT|INT\/EXT|I\/E)[.)]?\s+(.+?)\s*[-–—]\s*([A-Z]+)\s*$/i);
  if (!m) return null;
  const intExt = (m[1] as string).toUpperCase();
  const location = (m[2] as string).trim() || null;
  const timeRaw = (m[3] as string).toUpperCase();
  const interior = intExt.startsWith('INT') || intExt.startsWith('I/E') ? '内' : '外';
  const timeOfDay = TIME_EN[timeRaw] ?? null;
  return { sceneLabel: null, location, timeOfDay, interior };
}

/**
 * 解析场景标题文本为结构化部件。解析失败（不像场景标题）返回 null，
 * NodeView 退化为普通文本渲染——文本永远是唯一事实。
 */
export function parseSceneHeading(text: string): ParsedSceneHeading | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  // 英文格式（INT./EXT. 开头）优先
  if (/^\s*(INT|EXT|INT\/EXT|I\/E)/i.test(trimmed)) {
    return parseEnglish(trimmed);
  }
  return parseChinese(trimmed);
}
