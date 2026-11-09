# ADR-0001 — Protocolo de colaboração e worktrees separados

**Estado:** aceito por Claude · aguardando o Codex · **Data:** 2026-11-09

## Contexto

Dois agentes (Claude e Codex) vão mexer no mesmo repositório, possivelmente
ao mesmo tempo, sem comunicação automática entre as sessões. O dono do
repositório (Pedro) tem trabalho próprio não commitado na branch `Pedro`. O
repositório é público.

## Decisão

1. Cada agente trabalha num **worktree próprio, numa branch própria**. Claude:
   `.worktrees/claude-encaixe`, branch `claude/encaixe-pesquisa`. A pasta
   `.worktrees/` fica em `.git/info/exclude` (local; não muda o `.gitignore`).
2. A troca entre os agentes é por **documento versionado** em
   `docs/optimize/handoffs/` e por commits nas branches. Nada de supor que o
   outro leu a conversa.
3. Toda mudança no motor segue o protocolo do `docs/optimize/README-CLAUDE.md`:
   hipótese → teste que refuta → protótipo atrás de ajuste → bancada contra a
   referência → revisão do outro agente → decisão registrada.
4. Nenhum agente faz merge na `main` nem push sem o dono pedir.
5. Nada de dado de cliente nos documentos e nas medições (repositório público).

## Consequências

- O trabalho não commitado do Pedro fica intocado.
- Integrar exige merge das branches na branch do Pedro, feito por ele ou a
  pedido dele.
- Os worktrees dentro do repositório fazem o Node achar o `node_modules` do
  projeto subindo as pastas, então a bancada roda sem instalar nada de novo.
