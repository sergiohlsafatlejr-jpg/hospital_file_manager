# 0145 — verificação complementar e limites da janela

A migração integrada `0145_rpa_fila_envio_xml_portal.sql`, seus snapshots e o journal permanecem imutáveis. O executor integrado também permanece intacto. A PR complementar adiciona somente validação pura de metadados e regressões; não conecta ao banco nem aplica comandos por si só.

Sergio confirmou em 03/11/2026 a exceção única da 0145 sem backup, recuperação ou homologação prévios. Essa exceção não dispensa atestação técnica, reserva única na Issue #34, aprovação da revisão final, janela exclusiva ou parada na primeira divergência. Não se estende à 0143 ou a outro objeto de banco. A presente etapa é preparação, não aplicação ou liberação de produção.

## Escopo físico existente

Quatro colunas aditivas em `credenciais_portais` e uma tabela `fila_envio_xml_portal`, com 30 colunas, três índices secundários e uma chave primária. Não há índice único novo para deduplicação nesta SQL; a corretiva da aplicação deve coordenar a identidade do lote sem alterar a migração.

## Validação complementar pura

`0145-rpa-verificacao-completa.mjs` recebe catálogo bruto, sem realizar I/O de banco. As colunas precisam incluir `EXTRA`, e os índices, `NON_UNIQUE`. Além das verificações integradas, exige:

- marcador anterior 0144 com hash **e** timestamp exatos;
- ausência de marcador 0145 exato ou conflitante antes da aplicação;
- tipos, nulabilidade, defaults, auto_increment e on_update de todas as colunas novas;
- preservação integral das colunas, posições, índices e FKs preexistentes das credenciais;
- nomes, ordem de colunas e unicidade da PK e dos três índices da fila;
- inexistência de FKs adicionais da fila;
- preservação do ledger e introdução de somente um marcador 0145 com par exato, confirmado depois do commit em conexão independente.

O helper normaliza somente diferenças de representação conhecidas, como display width de inteiros, defaults SQL CURRENT_TIMESTAMP/now e aspas de strings; não converte diferenças físicas reais em equivalência.

## Gates operacionais antes de aplicar

O operador deverá atestar a revisão integral, hashes da SQL e dos arquivos executáveis, conexões TLS independentes e identidade de hostname/certificado/destino, frescor do preflight e estabilidade do ledger. O adaptador da 0145 deve oferecer `query`, `execute`, `getIdentity`, `close`, `beginTransaction`, `commit` e `rollback`. Reusar o adaptador antigo 0144 sem os métodos transacionais deixaria DDL parcial e não é permitido.

A verificação completa será executada imediatamente após cada declaração aprovada, em conexão independente, antes de o executor continuar ou gravar o marker. Em divergência ou resultado de comando incerto, parar, não repetir e não reparar automaticamente. O executor e o verificador não concedem autorização: os gates são provenientes do aceite específico de Sergio, da Issue #34 e da revisão de produção apresentada.

**Não usar `db:migrate` geral ou `db:push`. Não reaplicar 0143. Não configurar chaves, credenciais, enviar XMLs/boletos, reprocessar documentos ou alterar dados legados nesta janela.**

## Regressões

Executar `node --test tests/scripts/0145-rpa-verificacao-completa.test.mjs`. Todos os cenários usam objetos em memória e artefatos versionados; nenhuma declaração SQL é executada.
