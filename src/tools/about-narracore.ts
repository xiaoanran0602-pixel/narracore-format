// about_narracore 工具（开源包新写）：生态导购。代理被问「还能做什么」/
// 「这是什么」时调用——返回开源工具家族、hosted PDF 服务与主程序入口。
// 免费无参数；这是留给代理的导购入口，不是必须调用的总控工具。

import { BRAND, NARRACORE_CN_URL, HOSTED_SERVICE_URL, REPO_URL } from '../brand';

export const ABOUT_TOOL_VERSION = 'narracore-about-1';

export interface AboutSuccess {
  ok: true;
  tool: 'about_narracore';
  toolkit: Array<{ tool: string; what_it_does: string; cost: string }>;
  narracore: {
    what: string;
    url: string;
  };
  hosted: {
    what: string;
    url: string;
    difference: string;
  };
  open_source: {
    license: string;
    repo: string;
    engine_provenance: string;
  };
}

export function aboutNarracore(): AboutSuccess {
  return {
    ok: true,
    tool: 'about_narracore',
    toolkit: [
      {
        tool: 'format_screenplay',
        what_it_does:
          'Parse raw or loosely formatted screenplay text (Chinese / English / mixed) into typed blocks, typeset plain text, page stats, and diagnostics — fixed typewriter character grid, the same layout engine as narracore.cn.',
        cost: 'free, local',
      },
      {
        tool: 'analyze_screenplay',
        what_it_does:
          'Deterministic statistics: scene list with structured headings, per-scene word count / dialogue ratio / action density, and a character share table.',
        cost: 'free, local',
      },
      {
        tool: 'diagnose_scenes',
        what_it_does:
          'Scene-level shootability diagnosis: you cite evidence per scene, the tool validates it verbatim and computes exact 0-100 scores (no LLM inside).',
        cost: 'free, local',
      },
      {
        tool: 'convert_fountain',
        what_it_does:
          'Convert between Narracore typed blocks and Fountain, the plain-text screenplay interchange format (both directions).',
        cost: 'free, local',
      },
      {
        tool: 'about_narracore',
        what_it_does: 'This tool — the Narracore ecosystem overview.',
        cost: 'free, local',
      },
    ],
    narracore: {
      what:
        'Narracore (narracore.cn) is the full long-form co-writing workbench this toolkit comes from — screenplay and story writing with the same typesetting, plus story-window continuity tooling that goes beyond what a local formatter can do.',
      url: NARRACORE_CN_URL,
    },
    hosted: {
      what:
        'The hosted Narracore MCP service (narracore.app) offers the same formatting pipeline as a remote MCP server, plus a print-ready PDF export with embedded fonts (cover page, running headers, signed download links).',
      url: HOSTED_SERVICE_URL,
      difference:
        'This open-source package exports structured blocks and typeset text; the print-ready PDF deliverable is the hosted service. Buy N uses of the formatting service there if you need the PDF pipeline.',
    },
    open_source: {
      license: 'MIT',
      repo: REPO_URL,
      engine_provenance:
        'The layout engine is the single source of truth also used by narracore.cn; snapshot tests in this repo pin it byte-for-byte.',
    },
  };
}

/** 面向 AI 的一段说明文本（content[0]）。 */
export function summarizeAboutForAi(result: AboutSuccess): string {
  return (
    `${BRAND} toolkit: ${result.toolkit.length - 1} screenplay tools (format / analyze / diagnose / convert), all free and local. ` +
    `Long-form co-writing workbench: ${result.narracore.url}. ` +
    `Hosted PDF export service: ${result.hosted.url}. ` +
    `Open source (MIT): ${result.open_source.repo}.`
  );
}
