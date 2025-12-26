# Task log — Plano “obliterar Java” (SDK Node)

Data: 2025-12-19

Update (fim do dia): Java/JAR já foram removidos do fork; o CLI está sendo reimplementado em Node por fases.

## Pedido
Criar um plano detalhado para reescrever o SuiteCloud SDK/CLI de forma **100% Node**, removendo Java/JAR de todos os caminhos possíveis e “shippar” como SDK alternativo.

## Contexto observado no repo
- (Histórico) `packages/node-cli` era wrapper Node; o core de operações estava no JAR via `SdkExecutor` (`java -jar ...`).
- (Atual) Java/JAR removidos; comandos ainda não implementados no engine Node retornam erro explícito.

## Decisões de planejamento
- Não tratar como “MVP”; ainda assim a execução será por **fases** para garantir convergência e testes.
- Abordagem “engine”: separar CLI (UI/handlers) do core (engine), permitindo:
  - um harness externo do JAR oficial apenas como referência temporária (paridade).
  - `NodeEngine` como alvo final.
- Especificação (“spec-first”) em `.sangoi/research/` para evitar “copiar” Oracle (portfólio/risco legal).

## Entregável deste passo
- Documento de plano em `.sangoi/planning/obliterate-java.md`.
