# Task log — `project:validate` local (Node)

Data: 2025-12-19

## Objetivo
Fazer `suitecloud project:validate` entregar feedback útil (onde/por quê) sem depender de Java/JAR e sem “passar verde” no CI quando há erros.

## Mudanças
- Engine Node implementa o SDK command `validate` retornando `data={warnings,errors}` compatível com `ValidateOutputHandler`.
- `deploy.xml` agora é lido com extração de `<path>` + line number (aproximado) para apontar onde o problema está.
- `project:validate` não exige `project.json`/auth quando rodando validação local.
- Exit code: `project:validate` agora sai com código != 0 quando `data.errors.length > 0` (mesmo com output estruturado).

## Arquivos principais
- `packages/node-cli/src/services/ProjectValidationService.js`
- `packages/node-cli/src/services/DeployXmlService.js`
- `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`
- `packages/node-cli/src/core/CommandRegistrationService.js`
- `packages/node-cli/src/commands/project/validate/ValidateAction.js`
- `packages/node-cli/src/metadata/SdkCommandsMetadataPatch.json`

## Testes
- `packages/node-cli/__test__/services/ProjectValidationService.test.js`
- `cd packages/node-cli && npm test`

