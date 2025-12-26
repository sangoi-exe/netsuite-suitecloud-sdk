# Task log — Implement `object:update` (java-free) via `ide.nl` + `includeinstances`

Data: 2025-12-26

## Objetivo
- Completar o trio de comandos de objetos sem Java: `object:list`, `object:import` e **`object:update`**.
- Suportar `object:update -includeinstances` para custom records (via endpoint dedicado).
- Deixar o repo “limpo”: corrigir gaps do `NodeSdkExecutor`, fechar testes e atualizar docs/.sangoi.

## Descobertas (jar reconnaissance)
- O update de objetos reutiliza `POST /app/ide/ide.nl` com `action=FetchCustomObjectXml` e **`mode=UPDATE`** (strings no JAR em `FetchCustomObjectXmlDelegate`).
- O update de custom record **com instâncias** usa endpoint separado:
  - `POST /app/ide/fetchcustomrecordwithinstancesxml.nl`
  - request `application/x-www-form-urlencoded` com `scriptid=...` (+ `appid` opcional)
  - response é ZIP (extração no projeto)
- Há string `package_root` no JAR para list/fetch de objetos; no fork, passamos um valor inferido a partir do `manifest.xml` quando o `-project` existe (`/SuiteScripts` ou `/SuiteApps/<appId>`).

## Implementação
- `packages/node-cli/src/services/netsuite/NetSuiteCustomObjectsService.js`
  - Corrige fluxo de empty-body (retry 1x com `set-cookie`; erro claro depois).
  - Suporta `package_root`.
  - Implementa:
    - `updateObjects` (FetchCustomObjectXml + `mode=UPDATE`, extração segura para o projeto).
    - `updateCustomRecordWithInstances` (fetchcustomrecordwithinstancesxml.nl, valida ZIP, extração segura).
  - Extração de ZIP em update preserva subpastas existentes em `Objects/` quando o ZIP vem apenas com filenames (mapeia `scriptId -> path` via scan recursivo).
- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`
  - Completa `listobjects` / `importobjects` (antes estavam no switch mas sem implementação).
  - Implementa `update` e `updatecustomrecordwithinstances` consumindo o `NetSuiteCustomObjectsService`.
  - Em `importobjects`, valida que `destinationfolder` fica dentro de `Objects/`.

## Testes
- Atualizado e ampliado:
  - `packages/node-cli/__test__/services/NetSuiteObjectCommands.test.js` (inclui cenários para `update` e `updatecustomrecordwithinstances`).
- Rodado:
```bash
cd packages/node-cli
npm test
```

## Riscos / limitações
- Sem teste real em sandbox neste patch (você vai testar).
- `package_root` é inferido por strings do JAR + `manifest.xml`; se o servidor exigir outro formato, pode precisar ajuste.
- Importação de “referenced SuiteScript files” em `object:import` ainda não é implementada (o comando já aceita `-excludefiles`, mas o fork atualmente só baixa os XMLs de objetos).

