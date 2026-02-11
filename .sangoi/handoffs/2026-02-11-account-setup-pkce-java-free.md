# Handoff — `account:setup` PKCE java-free + token lifecycle

## Objetivo
Concluir a frente java-free com suporte real ao `suitecloud account:setup` (browser OAuth/PKCE) e garantir refresh de credenciais PKCE durante execução de comandos que exigem token válido.

## O que mudou
- Novo serviço PKCE:
  - `packages/node-cli/src/services/auth/NetSuitePkceAuthService.js`
  - Implementa authorize URL + browser launch + callback local + token exchange + refresh token grant.
- Executor Node:
  - `packages/node-cli/src/core/sdkexecutor/NodeSdkExecutor.js`
  - Adiciona SDK command `authenticate`.
  - `refreshauthorization` e `_ensureValidAccessToken` agora suportam auth `type: PKCE`.
- Store de credenciais:
  - `packages/node-cli/src/services/auth/AuthStoreService.js`
  - `refreshToken` agora recebe o mesmo tratamento de segredo que `accessToken` (strip/encrypt/decrypt).

## Testes adicionados/ajustados
- `packages/node-cli/__test__/services/NetSuitePkceAuthService.test.js`
- `packages/node-cli/__test__/services/NetSuiteAuthCommands.test.js`
- `packages/node-cli/__test__/services/NetSuiteFileCabinetCommands.test.js`
- `packages/node-cli/__test__/services/AuthStoreService.test.js`
- `packages/node-cli/__test__/commands/project/adddependencies/AddDependenciesAction.test.js`

## Como usar
- Setup interativo (browser):
```bash
suitecloud account:setup
```

- Setup CI (M2M) permanece:
```bash
suitecloud account:setup:ci --account <ACCOUNT_ID> --authid <AUTH_ID> --clientid <CLIENT_ID> --certificateid <CERTIFICATE_ID> --privatekeypath <PATH_TO_PRIVATE_KEY_PEM> --scope "rest_webservices restlets"
```

## Validação executada
```bash
cd packages/node-cli
npm test -- AddDependenciesCommand.test.js NetSuiteObjectCommands.test.js NetSuiteFileCabinetCommands.test.js
npm test -- NetSuitePkceAuthService.test.js NetSuiteAuthCommands.test.js NetSuiteFileCabinetCommands.test.js AuthStoreService.test.js
npm test -- AddDependenciesAction.test.js NetSuitePkceAuthService.test.js NetSuiteAuthCommands.test.js NetSuiteFileCabinetCommands.test.js NetSuiteObjectCommands.test.js AddDependenciesCommand.test.js NetSuiteCiAuthService.test.js AuthStoreService.test.js
```

## Fixes pós-review
- `project:adddependencies` não força mais `-all` em modo seletivo (`--feature`/`--file`/`--object`).
- Precedência de `client_id` no `account:setup` alinhada ao README: explícito → env vars → `suitecloud-sdk-settings.json` → default por domínio.
- `_ensureValidAccessToken` agora recusa tipos de auth não suportados mesmo com token não expirado.

## Limitações conhecidas
- `account:setup` depende de browser local + callback loopback (`127.0.0.1:52300-52315`).
- Se credenciais PKCE persistidas estiverem criptografadas e sem passkey disponível, o CLI falha explicitamente e exige correção do ambiente/reautenticação.
- `tokeninfo` continua best-effort (não bloqueia fluxo quando indisponível).

## Próximos passos sugeridos
1. Rodar smoke manual em ambiente real (`account:setup` + `file:list`/`object:list`) para validar UX e permissões OAuth no tenant alvo.
2. Se necessário, externalizar mensagens de erro OAuth para `messages.json`/translations para total paridade textual com upstream.
