# Atendimentos: filtros visuais por valor

## Entrega

Na tela `/atendimentos`, os antigos blocos de distribuição por quantidade são substituídos por cinco painéis clicáveis:

- **Contas por mês de entrada** — mês da entrada, distinto da competência da conta.
- **Etapas da conta** — valor somado por etapa.
- **Contas por convênio** — valor somado por plano/convênio.
- **Contas por setor** — setor da etapa; na ausência, setor de entrada.
- **Permanência da conta** — faixas de dias desde entrega ou etapa, incluindo sem referência.

Cada barra usa o **valor da conta** como medida principal. A quantidade aparece somente como informação secundária. Valores negativos são identificados e não descartados.

## Comportamento

1. Clicar em uma barra aplica o filtro à tabela de pacientes na mesma aba.
2. Os filtros de dimensões diferentes se combinam.
3. Clicar novamente, usar o botão de remoção ou “Limpar Todos” desfaz o filtro.
4. Ao filtrar, a paginação retorna à primeira página e a seleção de pacientes é limpa.
5. Ao trocar o estabelecimento, filtros, página e seleção são reiniciados.
6. Os painéis acompanham o mesmo recorte final da tabela, incluindo situação, busca, categoria e unidade.
7. A tela reconsulta ao abrir e ao voltar à janela. O botão Atualizar permanece disponível. Não há novo agendamento, sincronização de staging ou job de backend.

A tabela por paciente, as abas Atendimentos/Histórico, o botão Voltar e os fluxos existentes permanecem. A situação padrão de pendentes/sem título e as regras atuais de particulares **não são alteradas nesta entrega**. Portanto, escolher “Todas as contas” pode incluir contas finalizadas conforme o comportamento já existente. Unidades sem valor informado não recebem valores estimados.

## Dados e segurança

- Fonte: `atendimentos_unificados`, sem nova cópia ou tabela de apresentação.
- Cinco consultas agregadas somente leitura, solicitadas por `paineisValor: true`; consumidores antigos não solicitam essas consultas por padrão.
- Agrupamentos e filtros reutilizam expressões fixas, com parâmetros SQL.
- Permissão específica `reportProcedure("atendimentos")` e vínculo por estabelecimento preservados.
- Precisão SQL uniforme `DECIMAL(18,2)` para total e painéis; conversão dos painéis valida centavos e faixa segura antes de serializar.
- **Sem migração, INSERT, UPDATE, DELETE, carga ou alteração de valores armazenados.**

## Evidências de validação — 08/10/2026

- **19 testes direcionados**, incluindo agrupamento, valores negativos, precisão, interface e autorização.
- Build, `db:check` e `git diff --check` aprovados.
- TypeScript global mantém **172 erros legados**, sem novos diagnósticos nos arquivos alterados; o check global não está aprovado.
- Conferência somente leitura do Hemolabor: soma de quantidades e valores dos cinco painéis coincide com a base e com cinco recortes filtrados.
- Teste de navegador em montagem isolada **exclusivamente sintética, sem banco**: clique e remoção nos cinco painéis, combinação de filtros, limpar todos, seleção e troca de unidade corretos; tabela de pacientes preservada.
- Revisão técnica estática independente sem achados P0/P1 bloqueantes; não substitui a revisão humana exigida pelo protocolo.

## Liberação

A implementação segue em branch própria e Pull Request. Não fazer push direto em `main`. A ausência de Danilo e Paulo não dispensa automaticamente revisão: Sergio precisa autorizar uma exceção pontual para esta PR caso queira o merge sem outro revisor.

Esta entrega não incorpora a PR #59 (atualização automática do BI a cada minuto) nem a PR #55 (parser CSV Tasy). Sua publicação deve ser tratada separadamente. O teste sintético não representa validação visual do backend de produção após deploy.
