# Índice de pacientes por convênio — correção pontual da 0105

**Estado:** preparado para revisão; **não executado**. Produção está sem o índice `idx_pacientes_convenio`, embora `drizzle/schema.ts` e `drizzle/0105_perpetual_ultimates.sql` já o declarem. Os demais índices de `pacientes` não começam pela coluna `convenio_id`. Esta proposta não altera schema, migração antiga, journal nem permissões.

## Por que não criar uma nova migração Drizzle?

O schema e snapshot atuais já conhecem esse índice; `pnpm db:generate` pode gerar nenhuma instrução de correção física ou um SQL não relacionado. Não editar 0105 integrada, não reexecutar 0105 inteira (suas tabelas já existem) e não executar `pnpm db:migrate` enquanto 0105–0130 permanecerem candidatos por divergência de histórico. O script [`reparo-indice-pacientes-convenio-0105.sql`](./reparo-indice-pacientes-convenio-0105.sql) reproduz **apenas** o `CREATE INDEX` da 0105 original, intercalado com leituras do catálogo/journal.

## Pré-condições antes da FASE 1

1. Registrar `MIGRAÇÃO RESERVADA` na tarefa Collab de coordenação com responsável, branch, PR e janela exclusiva; nenhuma outra migração em paralelo.
2. Revisão por Danilo ou Paulo; verificar definição real em `information_schema` imediatamente antes da execução. Se índice equivalente já existir ou coluna mudar, **parar** e reavaliar.
3. Backup aplicável com restauração ensaiada em ambiente isolado; não expor backup, segredo, nomes de pacientes ou arquivos de dados na PR. Observar impacto de online DDL no banco.
4. Sergio ou delegado formal executa somente o comando central após ensaio; registrar executor, data e resultado. O SQL tem SELECTs de pré/pós-checagem, mas **não automatiza as condições**: o executor deve verificar os resultados e interromper se divergirem.
5. Pós-checagem exige exatamente o índice não único na coluna `convenio_id`; contagem e último marco Drizzle inalterados. Isso repara o índice físico, **não reconcilia o histórico**; o plano da 0130 permanece separado.

## Permissões históricas relacionadas

Sergio decidiu preservar os acessos específicos em 02/10/2026: **não** repetir os UPDATEs de 0110/0114, pois acesso geral BI ou Faturado/Recebido não deve conceder automaticamente cada relatório. 0111, 0121 e 0123 cumprem as pós-condições observáveis atuais e não precisam de DML de reparo.
