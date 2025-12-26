# Task log — Diagnósticos e performance percebida

Data: 2025-12-19

## Pedido
“É lento e não indica onde/por quê quebrou” — melhorar logs, erros e feedback durante execução.

## Entregas
- Flags globais:
  - `--debug` → habilita stack trace e diagnósticos extras quando há falhas internas.
  - `--verbose` → loga timing de execução por comando.
- Melhor contexto em erros lançados (prefixo com `[command]`).
- Em `--debug/--verbose`, erros de `ActionResult` também recebem prefixo com o comando (output handler base).
- Logger do console agora imprime de forma síncrona (sem depender de Promise), para não perder erros em encerramento rápido do Node.

## Arquivos tocados
- `packages/node-cli/src/CLI.js`
- `packages/node-cli/src/core/CommandActionExecutor.js`
- `packages/node-cli/src/services/DiagnosticsService.js`

## Validação
- `cd packages/node-cli && npm test`

## Próximos passos
- Adicionar “trace file” opcional para dumps completos (com redaction) em vez de só truncar em memória.
- Expandir logs de progresso para operações longas (deploy/validate) quando o protocolo Node existir.
