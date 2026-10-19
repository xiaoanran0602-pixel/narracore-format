[English](README.md) | [Español](README.es.md) | [Français](README.fr.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | 繁體中文

<p align="center"><img src="assets/hero.svg" alt="Narracore Format — 免費、本機運行的 AI 代理劇本排版" width="840"></p>

# Narracore Format

**免費、本機運行、無限制的 AI 代理劇本排版。** 一個開源 MCP 伺服器（同時是
[DSH](https://github.com/deepseek-ai/deepseek-harness) 外掛程式），把粗糙或鬆散的劇本文字轉成專業結構的劇本塊與排版純文字——**中文、英文或混排皆可（含日文放送劇格式與中文冒號式台詞稿）。排版引擎自動選軌：中文 33 字 × 38 行字格，或英文 61 × 55 字格**，與 [narracore.cn](https://narracore.cn?utm_source=github-plugin) 同一套固定打字機字格。

- **永久免費**——在你的電腦上運行，無帳號、無金鑰、無配額、不連網
- **確定性**——純規則引擎，內部無 LLM；同輸入永遠得到逐位元組相同的輸出
- **為代理而生**——機器可讀診斷、逐字證據錨定的場景評分、跨工具的類型化塊鏈式契約

這是 [Narracore](https://narracore.cn?utm_source=github-plugin) 工具家族的開源核心——長篇共創工作台。需要**可列印 PDF 匯出**或完整的故事連續性工具？見下方[生態](#生態)。

## 範例

粗糙文字進，排好的劇本出。以下兩例皆為引擎真實輸出。

<details open>
<summary><b>中文（CJK 33×38 字格軌）</b></summary>

輸入——鬆散文字，一行一個元素：

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

輸出——`format_screenplay` 的 `plain_text`（場景頭、動作、角色、括注、對白、右對齊轉場，全部落在固定字格上）：

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
<summary><b>English（Latin 61×55 軌）</b></summary>

輸入：

```text
INT. PROJECTION BOOTH - NIGHT

The projector beam cuts through the dark.

CHANG
(quietly)
If the reel still exists,
it proves that night was real.

CUT TO BLACK.
```

輸出：

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

同一個呼叫還會返回類型化 `blocks`（場景／動作／角色／括注／對白／轉場／鏡頭／註記）、頁面統計與機器可讀診斷——把這些塊原樣傳給本包的任何其他工具即可繼續分析或轉換。

## 安裝

### DSH（DeepSeek Harness）——主渠道

```sh
dsh plugin add narracore-format
```

就這樣。你的代理會獲得 `mcp__narracore__*` 命名空間下的五個工具。

### 任何 MCP 用戶端（Claude Code、Cursor……）

本包是標準 stdio MCP 伺服器，任何 MCP 用戶端都能直接運行：

```jsonc
// Claude Code: claude mcp add narracore-format -- npx -y narracore-format@latest
// Cursor / 通用 MCP 配置：
{
  "mcpServers": {
    "narracore-format": { "command": "npx", "args": ["-y", "narracore-format@latest"] }
  }
}
```

需要 Node ≥ 22。

## 工具（5 個）

| 工具 | 功能 |
| --- | --- |
| `format_screenplay` | 把劇本文字（或類型化塊）解析成 8 種語義塊、排版純文字、頁面統計與診斷。`output="validate_only"` 只檢查結構不排版。 |
| `analyze_screenplay` | 確定性統計：含結構化場景頭（場號／地點／時段／內外景）的場景清單、逐場字數、對白占比、動作密度、角色戲份表。 |
| `diagnose_scenes` | 逐場「可拍性」診斷：由代理逐場引用證據，工具逐字核驗並用精確算術算出 0–100 分（嚴重度加權覆蓋率，絕不偽造分數）。 |
| `convert_fountain` | Narracore 類型化塊與 [Fountain](https://fountain.io)（劇本純文字交換格式）雙向轉換。 |
| `about_narracore` | 生態總覽——Narracore 還有什麼。 |

**鏈式契約：**要對同一份劇本使用另一個工具，請把收到的 `blocks` 原樣傳回（`input_format="blocks"`），不要傳排版後的純文字——塊是確定性解析，文字會被重新解析。

## 生態

- **[narracore.cn](https://narracore.cn?utm_source=github-plugin)**——本工具家族的出處：完整長篇共創工作台，同款排版之外，還有本地排版器做不到的故事視窗連續性工具。
- **[narracore.app](https://narracore.app?utm_source=github-plugin)**——基於同一管線的託管 MCP 服務，額外提供嵌入字體的**可列印 PDF 匯出**（封面、頁眉、簽名下載連結）。想要免安裝的 PDF 管線，可在那裡購買 N 次排版服務。

## 引擎來源

`src/format/` 的排版引擎與 narracore.cn 使用同一份單一事實源，逐字移植自 Narracore
程式碼庫（來源雜湊見 [`src/format/README.md`](src/format/README.md)），且**快照測試逐位元組鎖定**——快照全綠即本包與 narracore.cn 網站排版逐字一致的機器證明。分析層（`src/analysis/`）是 Narracore 分析器的 TS 移植，由原始實作產生的金樣例測試鎖定。

## 開發

```sh
npm install
npm test        # 162 個測試：快照、金樣例、工具層、stdio 端到端、零計費守衛
npm run build   # esbuild 單檔打包 → dist/index.js
npm start       # 運行 stdio 伺服器
```

守衛測試：本包必須保持零計費／零授權／零支付程式碼——`src/` 出現此類引用時
`test/tools/guard.test.ts` 會直接失敗。

## 授權

[MIT](LICENSE)。排版引擎 © Narracore；來源說明見上文。
