[English](README.md) | [Español](README.es.md) | [Français](README.fr.md) | [日本語](README.ja.md) | 한국어 | [繁體中文](README.zh-Hant.md)

<p align="center"><img src="assets/hero.svg" alt="Narracore Format — AI 에이전트를 위한 무료·로컬 시나리오 조판" width="840"></p>

# Narracore Format

**AI 에이전트를 위한 무료·로컬·무제한 시나리오 조판.** 대략적이거나 느슨하게 쓴 시나리오
텍스트를 전문적으로 구조화된 시나리오 블록과 조판된 일반 텍스트로 바꾸는 오픈소스 MCP
서버(이자 [DSH](https://github.com/deepseek-ai/deepseek-harness) 플러그인)입니다 — **중국어,
영어 또는 혼용 지원(일본 방송극 형식과 중국어 콜론식 대사 대본 포함). 조판 엔진이 트랙을
자동 선택합니다: CJK 33자 × 38행 그리드 또는 라틴 61 × 55 그리드**, [narracore.cn](https://narracore.cn?utm_source=github-plugin)과
동일한 고정 타자기 글자 격자입니다.

- **영구 무료** — 내 컴퓨터에서 실행. 계정·키·할당량·네트워크 호출 없음
- **결정적** — 순수 규칙 기반 엔진, 내부에 LLM 없음. 같은 입력은 항상 바이트 단위로 같은 출력
- **에이전트 중심** — 기계 판독 가능한 진단, 증거를 한 글자도 틀리지 않게 검증하는 장면 채점, 도구 간 타입 블록 연쇄 계약

[Narracore](https://narracore.cn?utm_source=github-plugin) 툴킷의 오픈소스 코어입니다 —
장편 공동 창작 워크벤치요. **인쇄용 PDF 내보내기**나 완전한 이야기 연속성 도구가 필요하면
아래 [생태계](#생태계)를 보세요.

## 예시

거친 텍스트가 들어가면 — 조판된 시나리오가 나옵니다. 두 예시 모두 엔진의 실제 출력입니다.

<details open>
<summary><b>중국어 (CJK 33×38 트랙)</b></summary>

입력 — 한 줄에 한 요소씩 느슨한 텍스트:

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

출력 — `format_screenplay`의 `plain_text` (장면 표제·지문·등장인물·괄호 지시·대사·오른쪽 정렬
전환 — 모두 고정 격자 위에):

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
<summary><b>English (라틴 61×55 그리드)</b></summary>

입력:

```text
INT. PROJECTION BOOTH - NIGHT

The projector beam cuts through the dark.

CHANG
(quietly)
If the reel still exists,
it proves that night was real.

CUT TO BLACK.
```

출력:

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

같은 호출은 타입 블록(장면/지문/등장인물/괄호 지시/대사/전환/숏/노트), 페이지 통계, 기계
판독 가능한 진단도 함께 반환합니다 — 이 블록을 그대로 이 패키지의 다른 도구에 넘기면
분석·변환을 이어갈 수 있습니다.

## 설치

### DSH (DeepSeek Harness) — 주 채널

```sh
dsh plugin add narracore-format
```

끝입니다. 에이전트에 `mcp__narracore__*` 네임스페이스의 다섯 도구가 생깁니다.

### 모든 MCP 클라이언트 (Claude Code, Cursor, …)

이 패키지는 표준 stdio MCP 서버이므로 어떤 MCP 클라이언트에서도 바로 실행할 수 있습니다:

```jsonc
// Claude Code: claude mcp add narracore-format -- npx -y narracore-format@latest
// Cursor / 일반 MCP 설정:
{
  "mcpServers": {
    "narracore-format": { "command": "npx", "args": ["-y", "narracore-format@latest"] }
  }
}
```

Node ≥ 22 필요.

## 도구 (5개)

| 도구 | 기능 |
| --- | --- |
| `format_screenplay` | 시나리오 텍스트(또는 타입 블록)를 8종 의미 블록·조판 텍스트·페이지 통계·진단으로 변환. `output="validate_only"`는 조판 없이 구조만 검사. |
| `analyze_screenplay` | 결정적 통계: 구조화된 장면 표제(장 번호·장소·시간대·INT/EXT)가 붙은 장면 목록, 장면별 글자 수·대사 비율·동작 밀도, 등장인물 분담표. |
| `diagnose_scenes` | 장면별 '촬영 가능성' 진단: 에이전트가 증거를 인용하면 도구가 그것을 한 글자도 틀리지 않게 검증해 0–100점을 정확히 계산(심각도 가중 커버리지 — 점수를 날조하지 않음). |
| `convert_fountain` | Narracore 타입 블록과 [Fountain](https://fountain.io)(텍스트 기반 시나리오 교환 형식)의 양방향 변환. |
| `about_narracore` | 생태계 개요 — Narracore가 제공하는 다른 기능들. |

**연쇄 계약:** 같은 시나리오에 다른 도구를 쓸 때는 조판된 텍스트가 아니라 받은 `blocks`를
그대로 되돌려 주세요(`input_format="blocks"`) — 블록은 결정적으로 파싱되고, 텍스트는 다시
파싱됩니다.

## 생태계

- **[narracore.cn](https://narracore.cn?utm_source=github-plugin)** — 이 툴킷의 본가: 같은
  조판에 이어, 로컬 포매터로는 불가능한 이야기 창 연속성 도구까지 갖춘 완전한 장편 공동
  창작 워크벤치.
- **[narracore.app](https://narracore.app?utm_source=github-plugin)** — 같은 파이프라인 위에
  세워진 호스티드 MCP 서비스. 폰트 임베드 **인쇄용 PDF 내보내기**(표지·페이지 머리글·서명된
  다운로드 링크)를 추가로 제공합니다. 설치 없이 PDF 파이프라인이 필요하면 이곳에서 조판
  서비스 N회를 구매할 수 있습니다.

## 엔진 출처

`src/format/`의 조판 엔진은 narracore.cn이 쓰는 것과 동일한 단일 진실 공급원입니다.
Narracore 코드베이스에서 한 글자도 바꾸지 않고 이식되었고(출처 해시는 [`src/format/README.md`](src/format/README.md)),
**스냅샷 테스트가 바이트 단위로 고정**합니다 — 스냅샷이 전부 통과하면 이 패키지가 narracore.cn
웹앱과 글자 하나까지 같은 조판을 한다는 기계적 증명입니다. 분석 계층(`src/analysis/`)은
Narracore 분석기의 TS 이식판으로, 원래 구현에서 생성된 골든 샘플로 잠겨 있습니다.

## 개발

```sh
npm install
npm test        # 162개 테스트: 스냅샷, 골든 샘플, 도구 계층, stdio e2e, 과금 없음 가드
npm run build   # esbuild 단일 파일 번들 → dist/index.js
npm start       # stdio 서버 실행
```

가드 테스트: 이 패키지는 과금·라이선스·결제 코드를 절대 포함해서는 안 됩니다 — `src/`에
그런 참조가 나타나면 `test/tools/guard.test.ts`가 실패합니다.

## 라이선스

[MIT](LICENSE). 조판 엔진 © Narracore. 출처는 위 참고.
