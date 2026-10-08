# Stagings IAD compatíveis com o Hop — migração 0134

## Escopo

Pedido de Sergio em 08/10/2026: preparar as tabelas IAD com os mesmos campos das stagings físicas do Urológico.

| Tabela | Estrutura proposta | Situação antes da aplicação |
| --- | --- | --- |
| `stagion_atendimentos_parados_iad` | 13 colunas do Hop, idênticas em nome/tipo/nulabilidade à staging física Urológico | Existe no formato normalizado antigo, 33 colunas; vazia no preflight |
| `stagion_atendimentos_parados_iad_normalizada` | Preserva integralmente a estrutura anterior e seus índices por renomeação | Não existe antes da 0134 |
| `stagion_faturado_recebido_iad` | 43 colunas financeiras brutas, idênticas em nome/tipo/nulabilidade ao Urológico após 0133 | Não existe antes da 0134 |

**Não apagar nem modificar as colunas da tabela antiga.** A 0134 usa `RENAME TABLE` para preservar a staging normalizada, depois cria as duas tabelas brutas. O serviço normalizado continua apontando para a tabela preservada; ele não tenta interpretar o layout Hop. Nenhum atendimento ou fato financeiro é copiado, inserido, atualizado ou desativado por esta migração.

## Contrato Hop

- Atendimento mantém `numatend` como chave de negócio; `datatend`/`datasai` são `DATETIME` civil.
- Financeiro usa `DECIMAL(15,2)` nos totais e `DECIMAL(15,4)` em quantidade/valor unitário; os demais tipos são copiados do layout físico HUP verificado.
- Coluna da unidade: `Estabelecimentos_id` no atendimento e `estabelecimentos_id` no financeiro. **Preencher com o ID do cadastro IAD**, nunca copiar o conteúdo HUP. Não há valor padrão de unidade nem conta cadastrada automaticamente.
- As tabelas brutas não impõem unicidade por atendimento ou conta. Isso mantém o mesmo layout HUP e evita perda de itens financeiros repetidos. A publicação futura deverá validar as chaves, o lote e o isolamento; somente INSERT na staging não prova fim de lote.
- Sem metadados extras (`id`, `lote_ref`, `capturado_em`) ou índices no pouso bruto, para cumprir o layout físico pedido. A divergência anterior entre o schema HUP declarado e seu formato físico não é corrigida nesta entrega.
- Hop deve gravar por **colunas nomeadas**, sem recriar tabelas do Portal. Não configurar DDL/TRUNCATE automático.
- Publicadores HUP atuais **não** devem ser executados contra IAD. A promoção IAD e o sinal de lote completo são entregas separadas.

## Arquivos versionados

Schema atualizado, SQL `0134_curly_saracen.sql`, snapshot e journal gerados pelo `db:generate`, testes estruturais e documentação. O SQL gerado inicialmente sugeriu DROP de colunas da tabela antiga; ele foi revisado antes de qualquer aplicação e substituído por rename + duas criações, mantendo o mesmo estado final do snapshot.

## Implantação futura — não executada nesta entrega

1. Revisão do PR por outra pessoa, ou exceção específica de Sergio; reserva exclusiva na Issue #34.
2. Delegação específica de Sergio para execução em produção. Exceções das migrações 0131–0133 não se estendem à 0134.
3. Backup aplicável, homologação e preflight: identidade privada do alvo, 95 marcadores existentes/0133 íntegra, ausência de 0134; staging IAD original com as 33 colunas esperadas, sem escritores; nomes de preservação/financeiro ausentes; tabela antiga ainda vazia conforme preflight atual ou revisão explícita caso tenha sido preenchida.
4. Parar escritores do Hop e do integrador normalizado IAD na janela, coordenar código do serviço que usa o novo nome. Não reativar outros jobs por inferência.
5. Executar **somente** os três DDLs versionados da 0134 em ordem. Não rodar `pnpm db:migrate` geral com o histórico antigo divergente.
6. Após rename, conferir a estrutura, índices e contagem da tabela preservada. Se houver falha em uma criação, interromper; nunca repetir rename ou apagar a preservada automaticamente. Examinar o estado físico antes de continuar.
7. Validar as novas tabelas por nome, tipo, nulabilidade e quantidade de colunas; confirmar que HUP e destino unificado não foram alterados.
8. Registrar o marcador 0134 somente após conferência física integral, com hash do SQL versionado e `when` do journal gerado; uma única inserção condicionada, seguida de nova conexão para pós-checagem.
9. Registrar executor, revisão, horário e agregados na Issue #34; liberar reserva depois da validação.

## Validação de desenvolvimento

Os testes conferem as 13/43 colunas, precisão decimal, identidade do schema/DDL/snapshot, preservação integral do formato normalizado IAD e ausência de alterações em outras unidades. `db:check` verifica o histórico local; não prova sozinho compatibilidade física de produção.
