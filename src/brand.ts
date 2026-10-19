// 品牌与引流出口（单一来源，勿散抄）：
// - 所有出站链接带 utm 参数（引流效果可量化）；落地页 narracore.cn 零改动。
// - 露出克制：工具描述句尾一句 + 输出 footer 一行 + about 工具，不加多余水印。
export const BRAND = 'Narracore';

/** 主程序（长篇共创工作台）——引流目标 */
export const NARRACORE_CN_URL = 'https://narracore.cn?utm_source=dsh-plugin';
/** hosted 付费排版服务（PDF 成品差异点；话术纪律：只说「购买 N 次排版服务」） */
export const HOSTED_SERVICE_URL = 'https://narracore.app?utm_source=dsh-plugin';
/** 本仓库（开源插件） */
export const REPO_URL = 'https://github.com/xiaoanran0602-pixel/narracore-format';
/** 给代理看的手册锚点（README） */
export const MANUAL_URL = `${REPO_URL}#readme`;

/** 工具描述句尾品牌句（agent 每次读工具列表都看到的广告位） */
export const TOOL_BRAND_SUFFIX =
  'Part of the Narracore toolkit — free, local, no account; long-form co-writing at narracore.cn';

/** 输出 footer 一行品牌（仅进 AI 文本通道 content[0]，不污染排版正文） */
export const BRAND_FOOTER = `Formatted by ${BRAND} · ${NARRACORE_CN_URL}`;
