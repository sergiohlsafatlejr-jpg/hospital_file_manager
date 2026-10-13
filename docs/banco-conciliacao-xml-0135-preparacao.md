# Banco: preparação da conciliação persistida e XML — 0135

**Situação: base técnica em preparação. Não pronta para merge/publicação.**

Autorização de Sergio em 13/10/2026: preparar a entrega em PR separada, sem aplicar migração ou carregar dados. A reserva 0135 está registrada na Issue #34. A PR de nomes de itens é independente e não exige esta migração.

## Decisões de dados

- Origem: somente snapshot Hop HUP publicado e validado, não staging enquanto recebe INSERT.
- Faturado: uma cópia imutável dos itens de origem, identificados por lote e origem; não inclui colunas de pago ou glosa.
- Demonstração: somente eventos de arquivos importados/processados, com unidade/convênio/prestador validados.
- Médico direto N: não compõe faturado hospitalar nem pagamento hospitalar.
- Pagamento consolidado por TUSS/data: pode corresponder à soma de lançamentos por setor. O vínculo aponta para o grupo e guarda membros, com pago/glosa **uma única vez**, sem inventar rateio por setor.
- Diferentes contas, competências, tipos, terceiros, data ausente, quantidade divergente, múltiplos eventos ou valores não informados bloqueiam a confirmação.
- Candidatos não viram vínculos automaticamente. Confirmação exige revisão explícita e nova validação no servidor dentro de transação.

## Tabelas novas — somente planejamento DDL

| Tabela | Responsabilidade |
|---|---|
| banco_faturado_lotes | Unidade, convênio, competência e identidade da publicação |
| banco_faturado_itens | Fatos de faturado imutáveis com nomes, TUSS/data/tipo/setor e quantidade |
| banco_conciliacao_vinculos | Um retorno por grupo confirmado, valores e auditoria de quem confirmou |
| banco_conciliacao_membros | Composição por item/setor, sem copiar valor pago do grupo para cada membro |
| banco_xml_lotes | Histórico de XML validado por unidade/convênio/prestador/lote/protocolo |

0135 é aditiva: cinco CREATE TABLE e índices. Nenhuma tabela legada, staging ou demonstrativo é alterada; nenhum INSERT de negócio é gerado. As tabelas previstas **ainda não existem em produção por esta entrega**.

## Contratos puros implementados

- `bancoConciliacaoContrato.ts`: revisão explícita, mesmo convênio/unidade, origem HUP, receber S, provas de data, prestador autorizado, lote/protocolo, valores DECIMAL exatos e código de glosa numérico quando houver glosa.
- `bancoConsolidacaoSetores.ts`: prévia de soma por guia/TUSS/data, preservação dos setores, prova de quantidade e valor informado, sem duplicar pagamento e sem rateio.
- `bancoConfirmacaoGrupo.ts`: grupo completo, membros e evento exclusivos, identidade determinística de membros, composição preservada e diferença exata.

**Estes contratos não são endpoints e não escrevem no banco.** O chamador futuro deve carregar o universo completo, validar de-para, travar a fonte/publicação, os membros e o evento, persistir atomicamente e checar conflito de commit.

## Fluxo XML planejado

Manter a navegação e tabela original da Conciliação Cruzada. A aba hoje chamada XML Retorno gera **DEMONSTRATIVO_ANALISE_CONTA TISS 3.03.01**, conforme o exemplo de Sergio; não é a transação RECURSO_GLOSA.

Preparar lote por convênio, separado também por prestador, lote e protocolo. Exibir antes da exportação a quantidade de protocolos/XMLs. Futuramente permitir baixar todos em ZIP, sem enviar ao convênio automaticamente.

O gerador legado não será conectado diretamente ao Banco: ele contém inferências de datas/códigos/totais, consultas por guia sem identidade de grupo suficiente e gravações de marcações legadas. Banco deverá usar payload confirmado, sem inventar alta, data, código de prestador, CNES, número de guia/protocolo ou glosa.

Antes de permitir download, validar contra XSD oficial da ANS da versão/transação escolhida. Não há XSD provisionado nesta branch e não foi gerado XML real. Para a transação específica RECURSO_GLOSA do IPASGO, usar perfil próprio TISS 3.02 com regras de código numérico, justificativa até 150 caracteres e identificadores numéricos; não aplicar esse perfil automaticamente a um demonstrativo 3.03.01.

O armazenamento deve ser privado, com acesso autenticado por usuário/unidade. Não usar URL pública de S3 para XML com dados hospitalares. Histórico deve apontar para o objeto privado validado e os vínculos efetivamente exportados. Nenhum upload ou publicação de XML real ocorreu.

## Validações desta base

- 42 testes sintéticos de contratos, isolamento, duplicidade, precisão, membros multissetor, escala, revisão e SQL aditivo aprovados.
- `db:generate` e `db:check` aprovados; SQL da migração regenerada foi lido integralmente.
- Sem acesso a banco nos testes e sem DDL/DML em produção.
- Build aprovado; TypeScript mantém os 172 diagnósticos históricos da main, sem novos locais/códigos na base validada. Nenhuma rota nova foi registrada.

## Ainda falta para entrega funcional

- Serviço transacional de captura imutável do snapshot publicado, sem somar capturas históricas da mesma competência.
- Serviço de confirmação com guardas TiDB e unicidade entre membros/eventos; auditoria/reversão versionada sem sobrescrever vínculos.
- Consultas persistidas com permissões de leitura e escrita específicas, sem expor fingerprints técnicos.
- Integração de salvar/revisar no visual original, indicadores reais de pendência e lote XML.
- Gerador puro sem fallback artificial, XSD da ANS provisionado/validado, storage privado, histórico e ZIP.
- Ensaio de homologação com dados sintéticos, revisão humana e aceite funcional.
- Autorização nova de Sergio para aplicar somente a migração específica e eventual carga, com preflight, backup e janela exclusivos.

**Não executar `db:migrate` geral, não publicar esta branch e não habilitar geração XML Banco nesta etapa.**
