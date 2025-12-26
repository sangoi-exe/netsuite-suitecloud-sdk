# Task log — Bootstrap do engine Node (início da remoção do Java)

Data: 2025-12-19

## Objetivo
Começar a desmontar a dependência de Java/JAR criando uma abstração de execução e implementando pelo menos um comando core (`project:package`) 100% em Node, com testes.

## Mudanças principais
- Executor java-free:
  - `packages/node-cli/src/SdkExecutor.js` agora usa apenas a engine Node (Java/JAR removidos do fork).

- `project:package` sem Java:
  - `packages/node-cli/src/services/DeployXmlService.js` (parse + normalização de `deploy.xml`)
  - `packages/node-cli/src/services/ProjectPackagingService.js` (expansão de globs + zip via Node)
  - `NodeSdkExecutor` implementa o comando `package` retornando `SdkOperationResult` compatível.

- Fix importante: `NodeTranslationService` deixou de depender de `FileUtils` para evitar ciclo `require()` que quebrava imports de comandos (`packages/node-cli/src/services/NodeTranslationService.js`).

## Validação
- `cd packages/node-cli && npm test`

## Notas / próximos passos
- Expandir `NodeSdkExecutor` para `deploy/validate` (SdfClient).
- Refinar compatibilidade de mensagens/códigos conforme necessário (mantendo logs seguros).
