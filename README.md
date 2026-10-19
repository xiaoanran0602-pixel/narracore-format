<p align="center"><img src="assets/hero.svg" alt="Narracore Format — free, local screenplay formatting for AI agents" width="840"></p>

# Narracore Format

**Free, local, unlimited screenplay formatting for AI agents.** An open-source MCP server
(and [DSH](https://github.com/deepseek-ai/deepseek-harness) plugin) that turns raw or loosely
formatted screenplay text into professionally structured screenplay blocks and typeset plain
text — **Chinese, English, or mixed — including Japanese broadcast-drama format and Chinese
colon-style dialogue scripts. The layout engine picks the right track automatically: a
33-char × 38-line CJK grid or a 61 × 55 Latin grid**, the same fixed typewriter character
grid as [narracore.cn](https://narracore.cn?utm_source=github-plugin).

- **Free forever** — runs on your machine, no account, no key, no quota, no network calls
- **Deterministic** — pure rule-based engine, no LLM inside; same input always yields the
  same output, byte for byte
- **Agent-native** — machine-readable diagnostics, evidence-anchored scene scoring,
  typed-blocks chaining contract across tools

Part of the [Narracore](https://narracore.cn?utm_source=github-plugin) toolkit — the
long-form co-writing workbench. Looking for print-ready **PDF export** or the full
story-continuity tooling? See [the ecosystem](#ecosystem) below.

## Example

Rough text in — typeset screenplay out. Both directions below are real engine output.

<details open>
<summary><b>中文（CJK 33×38 字格轨）</b></summary>

Input — loosely formatted text, one element per line:

```text
第 1 场 内 老式放映厅 - 夜

放映机的光柱切开黑暗，尘埃在光里悬浮。
常家青坐在最后一排，手里攥着一张褪色的电影票。

常家青
（低声）
如果胶片还在，就能证明那晚的一切。

检票员从阴影里走出来，把手电筒照在票面上。

检票员
这张票，二十年前就该作废了。

常家青站起身。光柱突然熄灭。

切至黑暗
```

Output — `plain_text` from `format_screenplay` (scene heading, action, character,
parenthetical, dialogue, right-aligned transition — all on the fixed grid):

```text

第 1 场 内 老式放映厅 - 夜


放映机的光柱切开黑暗，尘埃在光里悬浮。


常家青坐在最后一排，手里攥着一张褪色的电影票。


                       常家青
                    （低声）
          如果胶片还在，就能证明那晚的一切。


检票员从阴影里走出来，把手电筒照在票面上。


                       检票员
          这张票，二十年前就该作废了。


常家青站起身。光柱突然熄灭。


                                                          切至黑暗
```

</details>

<details>
<summary><b>English (Latin 61×55 grid)</b></summary>

Input:

```text
INT. PROJECTION BOOTH - NIGHT

The projector beam cuts through the dark.

CHANG
(quietly)
If the reel still exists,
it proves that night was real.

CUT TO BLACK.
```

Output:

```text

INT. PROJECTION BOOTH - NIGHT


The projector beam cuts through the dark.


                   CHANG
             (quietly)
         If the reel still exists,

         it proves that night was real.


                                                CUT TO BLACK.
```

</details>

The same call also returns typed `blocks` (scene / action / character / parenthetical /
dialogue / transition / shot / note), page stats, and machine-readable diagnostics — feed
those blocks back to any other tool in this package for analysis or conversion.

## Install

### DSH (DeepSeek Harness) — primary channel

```sh
dsh plugin add narracore-format
```

That's it. Your agent gets five tools under the `mcp__narracore__*` namespace.

### Any MCP client (Claude Code, Cursor, …)

The package is a standard stdio MCP server, so any MCP client can run it directly:

```jsonc
// Claude Code: claude mcp add narracore-format -- npx -y narracore-format@latest
// Cursor / generic MCP config:
{
  "mcpServers": {
    "narracore-format": { "command": "npx", "args": ["-y", "narracore-format@latest"] }
  }
}
```

Requires Node ≥ 22.

## Tools (5)

| Tool | What it does |
| --- | --- |
| `format_screenplay` | Parse screenplay text (or typed blocks) into 8 semantic block types, typeset plain text, page stats, and diagnostics. `output="validate_only"` checks structure without formatting. |
| `analyze_screenplay` | Deterministic statistics: scene list with structured headings (number / location / time of day / INT-EXT), per-scene word count, dialogue ratio, action density, character share table. |
| `diagnose_scenes` | Scene-level "shootability" diagnosis: the agent cites evidence per scene, the tool validates it verbatim and computes exact 0–100 scores (severity-weighted coverage, BigInt arithmetic — never fakes a score). |
| `convert_fountain` | Convert between Narracore typed blocks and [Fountain](https://fountain.io), the plain-text screenplay interchange format. |
| `about_narracore` | Ecosystem overview — what else Narracore offers. |

**Chaining contract:** to run another tool on the same screenplay, pass back the `blocks`
you received (`input_format="blocks"`), not the formatted plain text — blocks parse
deterministically; text re-parses.

## Ecosystem

- **[narracore.cn](https://narracore.cn?utm_source=github-plugin)** — the full long-form
  co-writing workbench this toolkit comes from: screenplay and story writing with the same
  typesetting, plus story-window continuity tooling that goes beyond a local formatter.
- **[narracore.app](https://narracore.app?utm_source=github-plugin)** — the hosted MCP
  service built on the same pipeline, adding a print-ready **PDF export** with embedded
  fonts (cover page, running headers, signed download links). You can buy N uses of the
  formatting service there if you want the PDF pipeline without installing anything.

## Engine provenance

The layout engine in `src/format/` is the same single source of truth used by narracore.cn.
It is ported verbatim from the Narracore codebase (provenance hashes in
[`src/format/README.md`](src/format/README.md)), and **snapshot tests pin it byte-for-byte** —
green snapshot tests are the machine proof that this package lays out text identically to
the narracore.cn web app. The analysis layer (`src/analysis/`) is a TS port of the Narracore
analyzer, locked by golden tests generated from the original implementation.

## Development

```sh
npm install
npm test        # 162 tests: snapshots, golden samples, tool layer, stdio e2e, billing-free guard
npm run build   # esbuild single-file bundle → dist/index.js
npm start       # run the stdio server
```

Guard test: the package must stay free of any billing / license / payment code —
`test/tools/guard.test.ts` fails if such references appear in `src/`.

## License

[MIT](LICENSE). The layout engine is © Narracore; see the provenance notes above.
