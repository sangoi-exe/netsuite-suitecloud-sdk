# Task log — Engenharia reversa (início)

Data: 2025-12-19

## Objetivo
Começar a mapear o protocolo do SuiteCloud SDK (SDF) a partir do JAR oficial **sem decompilar** e sem trazer Java/JAR para dentro do fork.

## Entregas
- Ferramentas em `.sangoi/.tools/` para inspecionar JAR externo:
  - `node .sangoi/.tools/jar-inspect.mjs`
  - `node .sangoi/.tools/jar-class-strings.mjs`
  - `node .sangoi/.tools/jar-list-paths.mjs`
- Documento de research com endpoints e fluxo provável:
  - `.sangoi/research/sdf-protocol.md`

## Principais achados (até agora)
- OAuth2 token endpoint: `/services/rest/auth/oauth2/v1/token`
- OAuth2 authorize endpoint: `/app/login/oauth2/authorize.nl`
- Introspect endpoint: `/services/rest/auth/oauth2/v1/introspect`
- Datacenter urls: `/rest/datacenterurls?account=%s` (campos: `restDomain`, `systemDomain`, `webservicesDomain`)
- Upload handler: `/app/suiteapp/devframework/fileupload/filecabinetupload.nl` (Bearer token)
- Deploy/preview/validate handlers: `/app/suiteapp/devframework/ideinstallhandler.nl`, `/idepreviewhandler.nl`, `/idevalidationhandler.nl`

## Próximos passos
- Extrair e mapear nomes de campos/payload (multipart) para deploy/preview/server validation.
- Capturar request/response sanitizados (sandbox) para fechar a spec e começar `SdfClient` Node.
