// 结构化输入归一化（PLAN §7.6 第 2 步）：调用方（agent）直接提交类型化块，
// 服务端确定性校验与渲染——**不做二次猜测分类**（speaker 派生人物行除外，
// 派生是显式契约行为）。内容保真：不执行批注、不增删改写，原文保留。

import type { DocumentBlock, ScreenplayBlockType } from '../format/types';
import type { Diagnostic, ValidationStatus } from './diagnostics';

export interface BlockInput {
  id?: string;
  type: ScreenplayBlockType;
  text?: string;
  /** dialogue：说话人（渲染时派生人物行；上一块人物行同名则不重复派发） */
  speaker?: string;
  /** dialogue：表演提示（渲染为前置括注块） */
  delivery?: string;
  /** scene_heading 复合字段（与 text 二选一；缺失字段允许未知，不强迫补写） */
  scene_number?: string;
  location?: string;
  time_of_day?: string;
}

export interface NormalizedBlocks {
  /** 渲染用块序列（含派生的人物行 / 括注行） */
  blocks: DocumentBlock[];
  /** 回显给调用方的输出块（保留输入 id 与完整字段） */
  echoed: Array<{
    id?: string;
    type: ScreenplayBlockType;
    text: string;
    speaker?: string;
    delivery?: string;
  }>;
  /** 每个回显块对应的渲染块下标（P12 page_starts 对齐用；对白块指向其
   *  本体渲染块，派生人物/括注行不单列——回显与渲染非 1:1 时的编址桥） */
  renderIndexOfEchoed: number[];
  diagnostics: Diagnostic[];
  status: ValidationStatus;
  chars: number;
  /** 调用方提交的块数（不含派生元素） */
  inputCount: number;
}

/** 修订意图关键词（【】或（）内出现即视为编辑批注，非正文） */
const REVISION_INTENT_RE =
  /(删|去掉|移除|替换|改成|改为|换成|此处|补写|补充|新增|待定|建议|备注|TODO|FIXME)/;

function balanced(text: string): boolean {
  const pairs: Array<[string, string]> = [
    ['（', '）'],
    ['(', ')'],
    ['【', '】'],
    ['[', ']'],
  ];
  for (const [open, close] of pairs) {
    let depth = 0;
    for (const ch of text) {
      if (ch === open) depth += 1;
      else if (ch === close) depth -= 1;
      if (depth < 0) return false;
    }
    if (depth !== 0) return false;
  }
  return true;
}

export function normalizeBlocks(input: BlockInput[]): NormalizedBlocks {
  const blocks: DocumentBlock[] = [];
  const echoed: NormalizedBlocks['echoed'] = [];
  const renderIndexOfEchoed: number[] = [];
  const diagnostics: Diagnostic[] = [];
  const seenIds = new Map<string, number>();
  let chars = 0;
  let inputCount = 0;
  let lastDerivedSpeaker: string | undefined;

  for (const b of input) {
    inputCount += 1;
    const text = (b.text ?? '').trim();
    const at = b.id ? { block_id: b.id } : {};

    // 块 id 唯一性（移植主仓库 blocks.py parse_blocks 规则）：id 是调用方
    // 编址与证据锚点的依据，重复即语义损坏 → error，渲染拒绝。
    if (b.id !== undefined) {
      const firstIndex = seenIds.get(b.id);
      if (firstIndex !== undefined) {
        diagnostics.push({
          code: 'DUPLICATE_BLOCK_ID',
          severity: 'error',
          field: 'id',
          block_id: b.id,
          message: `Block id "${b.id}" is used more than once (first seen at input index ${firstIndex}).`,
          suggested_action:
            'Give every block a unique id — ids anchor diagnostics and analysis evidence.',
        });
      } else {
        seenIds.set(b.id, inputCount - 1);
      }
    }

    if (b.type === 'scene_heading') {
      const heading =
        b.text !== undefined && b.text.trim().length > 0
          ? b.text.trim()
          : [b.scene_number, b.location, b.time_of_day].filter(Boolean).join(' ').trim();
      if (heading.length === 0) {
        diagnostics.push({
          ...at,
          code: 'EMPTY_TEXT',
          severity: 'error',
          field: 'text',
          message: 'scene_heading block has neither text nor composite fields (location/time_of_day).',
          suggested_action: 'Provide text, or at least location + time_of_day.',
        });
        continue;
      }
      blocks.push({ type: 'scene_heading', text: heading });
      renderIndexOfEchoed.push(blocks.length - 1);
      echoed.push({ ...(b.id ? { id: b.id } : {}), type: 'scene_heading', text: heading });
      chars += heading.length;
      lastDerivedSpeaker = undefined;
      continue;
    }

    if (text.length === 0) {
      diagnostics.push({
        ...at,
        code: 'EMPTY_TEXT',
        severity: 'error',
        field: 'text',
        message: `${b.type} block has empty text.`,
        suggested_action: 'Remove the block or provide its text.',
      });
      continue;
    }

    if (b.type === 'dialogue') {
      if (!b.speaker || b.speaker.trim().length === 0) {
        diagnostics.push({
          ...at,
          code: 'MISSING_SPEAKER',
          severity: 'error',
          field: 'speaker',
          message: 'Dialogue block has no speaker.',
          suggested_action:
            'Add the speaker field; if the speaker is uncertain, ask the user rather than guessing.',
        });
      } else {
        const speaker = b.speaker.trim();
        // 契约派生：说话人人物行（上一派生同名则不重复）
        if (lastDerivedSpeaker !== speaker) {
          blocks.push({ type: 'character', text: speaker });
          lastDerivedSpeaker = speaker;
        }
        if (b.delivery && b.delivery.trim().length > 0) {
          blocks.push({ type: 'parenthetical', text: b.delivery.trim() });
        }
      }
    } else {
      // character 块承接说话人（P7 链式调用约定）：显式人物行之后的同说话人
      // dialogue 不再重复派生人物行；括注不打断对话串（与解析器的人物→括注→
      // 对白序列一致），其余块结束对话串——保证内容指纹稳定。
      if (b.type === 'character') {
        lastDerivedSpeaker = text;
      } else if (b.type !== 'parenthetical') {
        lastDerivedSpeaker = undefined;
      }
    }

    // 方括号内容分类（0916 二轮反馈：区分编辑修订意图与普通方括号标记）：
    // - 【…】/（…）内含修订关键词 → REVISION_NOTE_PRESENT（warning，不执行、原文保留）
    // - 其它【…】（时序标记、格式注记等）→ BRACKETED_ANNOTATION（info，不影响校验状态）
    if (b.type !== 'note') {
      const bracketed = text.match(/[【（(]([^】）)]*)[】）)]/g) ?? [];
      const revisionHit = bracketed.find((chunk) => REVISION_INTENT_RE.test(chunk));
      if (revisionHit !== undefined) {
        diagnostics.push({
          ...at,
          code: 'REVISION_NOTE_PRESENT',
          severity: 'warning',
          message: 'Block text contains an edit/revision instruction in brackets.',
          suggested_action:
            'Revision instructions are never executed; original text is preserved as-is. Ask the user whether to apply or strip the revision before formatting.',
        });
      } else if (/[【].*[】]/.test(text)) {
        diagnostics.push({
          ...at,
          code: 'BRACKETED_ANNOTATION',
          severity: 'info',
          message: 'Block text contains 【…】 bracketed content (kept verbatim).',
          suggested_action:
            'Rendered as-is. If this was meant as a note block, submit type="note".',
        });
      }
    }
    if (!balanced(text)) {
      diagnostics.push({
        ...at,
        code: 'UNBALANCED_DELIMITER',
        severity: 'warning',
        field: 'text',
        message: 'Unbalanced brackets/parentheses in block text.',
        suggested_action: 'Fix the delimiters, or keep as-is knowingly — text is rendered verbatim.',
      });
    }

    blocks.push({ type: b.type, text });
    renderIndexOfEchoed.push(blocks.length - 1);
    echoed.push({
      ...(b.id ? { id: b.id } : {}),
      type: b.type,
      text,
      ...(b.speaker ? { speaker: b.speaker.trim() } : {}),
      ...(b.type === 'dialogue' && b.delivery?.trim() ? { delivery: b.delivery.trim() } : {}),
    });
    chars += text.length;
  }

  const status: ValidationStatus = diagnostics.some((d) => d.severity === 'error')
    ? 'invalid'
    : diagnostics.some((d) => d.severity === 'warning')
      ? 'needs_review'
      : 'ok';

  return { blocks, echoed, renderIndexOfEchoed, diagnostics, status, chars, inputCount };
}
