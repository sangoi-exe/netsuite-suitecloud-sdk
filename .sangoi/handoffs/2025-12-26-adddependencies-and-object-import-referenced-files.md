# Handoff — `project:adddependencies` + referenced SuiteScript files (java-free)

## Objetivo
Completar o engine Node para o último SDK command faltante (`adddependencies`) e melhorar `object:import` para baixar SuiteScripts referenciados em projetos ACP quando importar `customscript*`.

## O que mudou
- `packages/node-cli/src/services/ProjectAddDependenciesService.js` (novo)
  - Implementa `adddependencies` localmente, atualizando `manifest.xml` para projetos SuiteApp.
- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`
  - Adiciona suporte ao SDK command `adddependencies`.
  - `importobjects`: quando ACP + `customscript*` e sem `-excludefiles`, detecta paths de FileCabinet no XML importado e chama `ImportFiles`, populando `referencedFileImportResult`.
- Testes:
  - `packages/node-cli/__test__/services/AddDependenciesCommand.test.js`
  - `packages/node-cli/__test__/services/NetSuiteObjectCommands.test.js`

## Como usar
```bash
suitecloud project:adddependencies
```

Para desabilitar import de arquivos referenciados em `object:import`:
```bash
suitecloud object:import -excludefiles ...
```

## Como validar
```bash
cd packages/node-cli
npm test
```

## Riscos / limitações conhecidas
- `adddependencies` no fork implementa o modo `-all` de forma conservadora (features comuns + object deps por `appid` a partir de XMLs em `Objects/`).
- Import de referenced SuiteScripts em `object:import` é best-effort; erros de import são retornados como `failedImports` (e logados como warnings).

## Próximos passos sugeridos
1. Expandir `adddependencies` para cobrir mais categorias (files/folders/platform extensions/bundles) conforme aparecerem casos reais.
2. Refinar heurísticas de features (ou extrair mapeamento formal) para reduzir falsos positivos/negativos.
