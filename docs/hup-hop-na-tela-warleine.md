# HUP/Hop na tela Faturado x Recebido — Sistema Warleine

A URL `/faturado-recebido-warleine` reutiliza a apresentação Warleine. Para o Hospital Urológico, o lote Hop validado poderá ocupar **exclusivamente a origem Warleine da própria unidade**, sem se somar a XML, demonstrativos, lançamentos externos ou ao relatório oficial `/faturado-recebido-unificado`.

## Fluxo inicial (não automático)

1. O Apache Hop entrega a staging física `stagion_faturado_recebido_urologico`, sem criar, truncar ou alterar a tabela durante a publicação. Confirmar fora do Portal o término do lote completo.
2. O script `scripts/publicar-hop-faturado-warleine.mts` é **somente prévia por padrão**. Ele valida as 43 colunas físicas, rejeita linhas de outra unidade, reutiliza o parser XLSX Warleine, preserva ocorrências repetidas e confere que a unidade ainda não possui lote, fatos ou snapshot Warleine.
3. Antes de permitir `--apply`, guardar por canal privado o banco-alvo, a contagem e o SHA-256 do snapshot da prévia. Exigir revisão da PR e confirmação de Hop parado. O script reconfere o manifesto antes e durante a transação, e antes do commit por outra conexão; bloqueia divergências. Os hashes e os registros não são impressos em issues/PRs.
4. Uma aplicação aprovada insere fatos em lotes pequenos **numa única transação**, cria um lote com a origem Hop HUP e ativa o ponteiro por competência, somente para a unidade HUP. Não apaga nem modifica fatos de outras unidades. Reenvio/segundo lote pela mesma rotina é proibido; atualizações posteriores exigem mecanismo de substituição por snapshot fechado e outra revisão.
5. Conferir em nova conexão quantidade de fatos ativos HUP, competências, fonte e KPIs por competência; comparar também o filtro real da tela. Em caso de divergência, **não executar novamente** sem investigação.

## Semântica e lacunas

- `mesprod` significa **competência de produção**, não mês de pagamento. O layout Hop atual não possui `data_receb`; pagamento informado (`vl_total_recebido`) será mostrado na competência de produção, sem afirmar data de recebimento.
- `vl_total_recebido` é a medida exibida como **Recebido**, sem somá-la a `vl_recebido`, acréscimo ou recuperada. As demais medidas são colunas distintas.
- O parser existente converte os nomes duplicados do arquivo em `descricao_1` e `codrecur_1`. Os seis campos ausentes do layout físico Hop permanecem vazios; não derivar pagador ou pagamento.
- A staging física atual não contém identificador estável de linha nem confirmação persistente de lote fechado. Esta PR permite **somente primeira publicação completa manual**, com fingerprint e revisão, não sincronização automática ou alterações parciais. A posterior automação deverá ter manifesto de lote fechado e isolamento de concorrência.
- A staging física difere da definição Drizzle histórica em metadados/índices; esta PR **não altera schema nem executa migração**. Não rodar `pnpm db:migrate` geral.
