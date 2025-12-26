# Task log — Implement `object:list` + `object:import` (java-free) via `/app/ide/ide.nl`

Data: 2025-12-20

## Objetivo
Reimplementar `object:list` e `object:import` no fork java-free sem depender do JAR, usando o servlet `ide.nl`.

## Wire format (spec via constant pool)
- Endpoint: `POST /app/ide/ide.nl`
- `object:list`:
  - Multipart fields:
    - `action=FetchCustomObjectList`
    - `object_type=<type>` (pode repetir para múltiplos tipos)
    - `scriptid_contains=<substring>` (opcional)
  - Response: XML com lista de objetos (ex.: `<customObjects><customObject type="..." scriptId="..." appId="..."/></customObjects>`).
  - Semântica `appid` no CLI: se omitido, listar apenas objetos sem `appId`; se informado, filtrar por match exato.
- `object:import`:
  - Multipart fields:
    - `action=FetchCustomObjectXml`
    - `custom_objects=<xml>`
  - Wire format `custom_objects` (XML):
    - `<customObjects><customObject type="..." scriptId="..." appId="..."/></customObjects>`
  - Response: ZIP contendo `status.xml` + arquivos `.xml` dos objetos.
  - `status.xml` (formato esperado): `<status><result><key>...</key><type>SUCCESS|ERROR</type><message>...</message></result>...</status>`.

## Implementação
- `packages/node-cli/src/services/netsuite/NetSuiteCustomObjectsService.js`
  - `listObjects`: monta multipart, chama `ide.nl`, parseia XML e aplica filtro de `appid` localmente; retry 1x se body vazio + `set-cookie`.
  - `importObjects`: monta `custom_objects`, baixa ZIP e extrai em `destinationfolder` (defesa contra path traversal), parseia `status.xml`.
- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`
  - Implementa SDK commands `listobjects` e `importobjects`.
  - `importobjects`: valida `destinationfolder` sob `Objects/`, suporta `-type ALL` resolvendo tipos via `listObjects`.
  - Best-effort: em ACP, quando importar objetos `customscript*` e sem `-excludefiles`, tenta detectar paths de FileCabinet no XML importado e chama `ImportFiles` para baixar SuiteScripts referenciados.

## Testes
- `packages/node-cli/__test__/services/NetSuiteCustomObjectsService.test.js`
- `packages/node-cli/__test__/services/NetSuiteObjectCommands.test.js`
- `cd packages/node-cli && npm test`

## Validação (real)
- Ainda não validado contra sandbox NetSuite nesta sessão.
- Requer token OAuth2 com scopes incluindo `restlets` (ex.: `"rest_webservices restlets"`) para acessar `ide.nl`.
