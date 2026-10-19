[English](README.md) | [Español](README.es.md) | Français | [日本語](README.ja.md) | [한국어](README.ko.md) | [繁體中文](README.zh-Hant.md)

<p align="center"><img src="assets/hero.svg" alt="Narracore Format — mise en forme de scénarios gratuite et locale pour agents IA" width="840"></p>

# Narracore Format

**Mise en forme de scénarios gratuite, locale et illimitée pour agents IA.** Un serveur MCP
open source (et plugin [DSH](https://github.com/deepseek-ai/deepseek-harness)) qui transforme
du texte de scénario brut ou peu formaté en blocs de scénario à structure professionnelle et
en texte brut composé — **chinois, anglais ou mixte — y compris le format de drama radiophonique
japonais et les scripts chinois à dialogues séparés par deux-points. Le moteur de composition
choisit automatiquement la voie : une grille CJK de 33 caractères × 38 lignes ou une grille
latine de 61 × 55**, la même grille fixe de machine à écrire que
[narracore.cn](https://narracore.cn?utm_source=github-plugin).

- **Gratuit pour toujours** — s'exécute sur votre machine, sans compte, sans clé, sans quota, sans appel réseau
- **Déterministe** — moteur purement à règles, aucun LLM à l'intérieur ; la même entrée produit toujours la même sortie, octet par octet
- **Pensé pour les agents** — diagnostics lisibles par la machine, scoring de scène ancré sur des preuves verbatim, contrat d'enchaînement par blocs typés entre outils

C'est le cœur ouvert du kit d'outils [Narracore](https://narracore.cn?utm_source=github-plugin)
— l'atelier de co-écriture de textes longs. Vous cherchez l'**export PDF prêt à imprimer** ou
les outils complets de continuité narrative ? Voir [l'écosystème](#écosystème) ci-dessous.

## Exemple

Du texte brut entre — un scénario composé sort. Les deux exemples sont des sorties réelles du moteur.

<details open>
<summary><b>Chinois (voie CJK 33×38)</b></summary>

Entrée — texte peu formaté, un élément par ligne :

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

Sortie — `plain_text` de `format_screenplay` (en-tête de scène, action, personnage,
parenthèse, dialogue et transition alignée à droite — le tout sur la grille fixe) :

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
<summary><b>English (grille latine 61×55)</b></summary>

Entrée :

```text
INT. PROJECTION BOOTH - NIGHT

The projector beam cuts through the dark.

CHANG
(quietly)
If the reel still exists,
it proves that night was real.

CUT TO BLACK.
```

Sortie :

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

Le même appel renvoie aussi des `blocks` typés (scène / action / personnage / parenthèse /
dialogue / transition / plan / note), des statistiques de pages et des diagnostics lisibles
par la machine — repassez ces blocs tels quels à n'importe quel autre outil du paquet pour
l'analyse ou la conversion.

## Installation

### DSH (DeepSeek Harness) — canal principal

```sh
dsh plugin add narracore-format
```

C'est tout. Votre agent reçoit cinq outils sous l'espace de noms `mcp__narracore__*`.

### N'importe quel client MCP (Claude Code, Cursor, …)

Le paquet est un serveur MCP stdio standard, donc tout client MCP peut l'exécuter
directement :

```jsonc
// Claude Code : claude mcp add narracore-format -- npx -y narracore-format@latest
// Cursor / configuration MCP générique :
{
  "mcpServers": {
    "narracore-format": { "command": "npx", "args": ["-y", "narracore-format@latest"] }
  }
}
```

Nécessite Node ≥ 22.

## Outils (5)

| Outil | Ce qu'il fait |
| --- | --- |
| `format_screenplay` | Analyse du texte de scénario (ou de blocs typés) en 8 types de blocs sémantiques, texte brut composé, statistiques de pages et diagnostics. `output="validate_only"` vérifie la structure sans composer. |
| `analyze_screenplay` | Statistiques déterministes : liste de scènes avec en-têtes structurés (numéro / lieu / moment de la journée / INT-EXT), mots par scène, ratio de dialogue, densité d'action, tableau de répartition des personnages. |
| `diagnose_scenes` | Diagnostic de « filmabilité » par scène : l'agent cite des preuves, l'outil les vérifie verbatim et calcule des scores exacts de 0 à 100 (couverture pondérée par sévérité — jamais de note inventée). |
| `convert_fountain` | Conversion entre blocs typés Narracore et [Fountain](https://fountain.io), le format d'échange de scénarios en texte brut. |
| `about_narracore` | Panorama de l'écosystème — ce que Narracore offre d'autre. |

**Contrat d'enchaînement :** pour utiliser un autre outil sur le même scénario, renvoyez les
`blocks` reçus (`input_format="blocks"`), pas le texte brut composé — les blocs s'analysent de
manière déterministe ; le texte est ré-analysé.

## Écosystème

- **[narracore.cn](https://narracore.cn?utm_source=github-plugin)** — l'atelier complet de
  co-écriture de textes longs dont ce kit est issu : écriture de scénarios et d'histoires avec
  la même composition, plus des outils de continuité par fenêtres narratives qui vont au-delà
  d'un formateur local.
- **[narracore.app](https://narracore.app?utm_source=github-plugin)** — le service MCP hébergé
  construit sur le même pipeline, qui ajoute l'**export PDF prêt à imprimer** avec polices
  intégrées (page de titre, en-têtes courants, liens de téléchargement signés). Si vous voulez
  le pipeline PDF sans rien installer, vous pouvez y acheter N usages du service de composition.

## Provenance du moteur

Le moteur de composition de `src/format/` est la même source unique de vérité que narracore.cn,
porté verbatim depuis le code de Narracore (empreintes de provenance dans
[`src/format/README.md`](src/format/README.md)), et **les tests d'instantané le figent octet
par octet** — des instantanés au vert sont la preuve mécanique que ce paquet compose le texte
à l'identique de l'application web narracore.cn. La couche d'analyse (`src/analysis/`) est un
port TS de l'analyseur Narracore, verrouillé par des échantillons dorés générés depuis
l'implémentation d'origine.

## Développement

```sh
npm install
npm test        # 162 tests : instantanés, échantillons dorés, couche outils, e2e stdio, garde sans facturation
npm run build   # paquet esbuild en un seul fichier → dist/index.js
npm start       # lancer le serveur stdio
```

Test garde : le paquet doit rester exempt de tout code de facturation / licence / paiement —
`test/tools/guard.test.ts` échoue si de telles références apparaissent dans `src/`.

## Licence

[MIT](LICENSE). Le moteur de composition est © Narracore ; voir les notes de provenance ci-dessus.
