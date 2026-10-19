[English](README.md) | Español | [Français](README.fr.md) | [日本語](README.ja.md) | [한국어](README.ko.md) | [繁體中文](README.zh-Hant.md)

<p align="center"><img src="assets/hero.svg" alt="Narracore Format — formato de guion gratuito y local para agentes de IA" width="840"></p>

# Narracore Format

**Formato de guion gratuito, local e ilimitado para agentes de IA.** Un servidor MCP de
código abierto (y plugin de [DSH](https://github.com/deepseek-ai/deepseek-harness)) que
convierte texto de guion rudimentario o poco formateado en bloques de guion con estructura
profesional y texto plano compuesto — **chino, inglés o mixto — incluyendo el formato de
radioteatro japonés y los guiones chinos de diálogo con dos puntos. El motor de composición
elige automáticamente la pista: una retícula CJK de 33 caracteres × 38 líneas o una retícula
latina de 61 × 55**, la misma retícula fija de máquina de escribir que
[narracore.cn](https://narracore.cn?utm_source=github-plugin).

- **Gratis para siempre** — se ejecuta en tu máquina, sin cuenta, sin clave, sin cuota, sin llamadas de red
- **Determinista** — motor de reglas puro, sin LLM dentro; la misma entrada produce siempre la misma salida, byte a byte
- **Pensado para agentes** — diagnósticos legibles por máquina, puntuación de escenas anclada en evidencia textual, contrato de encadenamiento por bloques tipados entre herramientas

Es el núcleo abierto del kit de herramientas [Narracore](https://narracore.cn?utm_source=github-plugin)
— el taller de cowriting de obras largas. ¿Buscas **exportación a PDF listo para imprimir** o
las herramientas completas de continuidad narrativa? Mira [el ecosistema](#ecosistema) más abajo.

## Ejemplo

Entra texto rudimentario — sale un guion compuesto. Ambos ejemplos son salida real del motor.

<details open>
<summary><b>Chino (pista CJK 33×38)</b></summary>

Entrada — texto poco formateado, un elemento por línea:

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

Salida — `plain_text` de `format_screenplay` (encabezado de escena, acción, personaje,
acotación, diálogo y transición alineada a la derecha — todo sobre la retícula fija):

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
<summary><b>English (retícula latina 61×55)</b></summary>

Entrada:

```text
INT. PROJECTION BOOTH - NIGHT

The projector beam cuts through the dark.

CHANG
(quietly)
If the reel still exists,
it proves that night was real.

CUT TO BLACK.
```

Salida:

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

La misma llamada también devuelve `blocks` tipados (escena / acción / personaje / acotación /
diálogo / transición / plano / nota), estadísticas de página y diagnósticos legibles por
máquina — pasa esos bloques tal cual a cualquier otra herramienta del paquete para analizar o
convertir.

## Instalación

### DSH (DeepSeek Harness) — canal principal

```sh
dsh plugin add narracore-format
```

Eso es todo. Tu agente recibe cinco herramientas bajo el espacio de nombres `mcp__narracore__*`.

### Cualquier cliente MCP (Claude Code, Cursor, …)

El paquete es un servidor MCP stdio estándar, así que cualquier cliente MCP puede ejecutarlo
directamente:

```jsonc
// Claude Code: claude mcp add narracore-format -- npx -y narracore-format@latest
// Cursor / configuración MCP genérica:
{
  "mcpServers": {
    "narracore-format": { "command": "npx", "args": ["-y", "narracore-format@latest"] }
  }
}
```

Requiere Node ≥ 22.

## Herramientas (5)

| Herramienta | Qué hace |
| --- | --- |
| `format_screenplay` | Convierte texto de guion (o bloques tipados) en 8 tipos de bloque semántico, texto plano compuesto, estadísticas de página y diagnósticos. `output="validate_only"` comprueba la estructura sin componer. |
| `analyze_screenplay` | Estadísticas deterministas: lista de escenas con encabezados estructurados (número / lugar / momento del día / INT-EXT), palabras por escena, proporción de diálogo, densidad de acción y tabla de reparto de personajes. |
| `diagnose_scenes` | Diagnóstico de «filmabilidad» por escena: el agente cita evidencia y la herramienta la verifica literalmente, calculando puntuaciones exactas 0–100 (cobertura ponderada por severidad — nunca inventa una nota). |
| `convert_fountain` | Convierte entre bloques tipados de Narracore y [Fountain](https://fountain.io), el formato de intercambio de guiones en texto plano. |
| `about_narracore` | Panorama del ecosistema — qué más ofrece Narracore. |

**Contrato de encadenamiento:** para usar otra herramienta sobre el mismo guion, devuelve los
`blocks` que recibiste (`input_format="blocks"`), no el texto plano compuesto — los bloques se
analizan de forma determinista; el texto se re-analiza.

## Ecosistema

- **[narracore.cn](https://narracore.cn?utm_source=github-plugin)** — el taller completo de
  cowriting de obras largas del que procede este kit: escritura de guiones e historias con la
  misma composición, más herramientas de continuidad por ventanas narrativas que van más allá
  de un formateador local.
- **[narracore.app](https://narracore.app?utm_source=github-plugin)** — el servicio MCP
  alojado construido sobre la misma canalización, que añade **exportación a PDF listo para
  imprimir** con fuentes incrustadas (portada, encabezados, enlaces de descarga firmados). Si
  quieres la canalización de PDF sin instalar nada, allí puedes comprar N usos del servicio de
  composición.

## Procedencia del motor

El motor de composición de `src/format/` es la misma fuente única de verdad que usa
narracore.cn, portado verbatim del código de Narracore (hashes de procedencia en
[`src/format/README.md`](src/format/README.md)), y **las pruebas de instantánea lo fijan byte
a byte** — instantáneas en verde son la prueba mecánica de que este paquete compone el texto
idénticamente a la aplicación web de narracore.cn. La capa de análisis (`src/analysis/`) es un
port TS del analizador de Narracore, fijado por muestras doradas generadas desde la
implementación original.

## Desarrollo

```sh
npm install
npm test        # 162 pruebas: instantáneas, muestras doradas, capa de herramientas, e2e stdio, guarda sin facturación
npm run build   # paquete de un solo archivo con esbuild → dist/index.js
npm start       # ejecutar el servidor stdio
```

Prueba guarda: el paquete debe permanecer libre de cualquier código de facturación / licencia
/ pago — `test/tools/guard.test.ts` falla si aparecen esas referencias en `src/`.

## Licencia

[MIT](LICENSE). El motor de composición es © Narracore; véanse las notas de procedencia arriba.
