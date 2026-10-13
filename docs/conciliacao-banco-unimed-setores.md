# Conciliação Banco Unimed — item consolidado por data

## Entrega funcional

Na consulta Banco da Conciliação Cruzada, o convênio canônico cujo nome começa com a palavra `Unimed` passa a reunir os itens de setores diferentes da mesma conta, guia prestador, guia operadora, TUSS, data, tipo e modalidade. O recorte já restringe unidade e competência e exige de-para manual inequívoco.

A apresentação permanece na página e tabela originais. A coluna Setor permite expandir a composição, com quantidade e faturado por setor. O pagamento/glosa do demonstrativo aparece uma única vez no grupo, sem rateio. Os nomes dos itens continuam preservados.

**Não usa staging em carga, recebido Hop, XML faturado ou espelhos. Não grava conciliações, não faz DDL e não depende da aplicação da 0135.**

## Correspondência e diferença são coisas distintas

- A consolidação resolve a ambiguidade produzida exclusivamente por setores separados.
- Grupo multissetor só aceita candidato único se a data coincidir e a quantidade positiva do retorno for exatamente a soma do grupo.
- Diferença financeira não transforma o candidato em ambíguo: com pago/glosa conhecidos, mostra faturado − pago − glosa, em Decimal exato.
- Diferença não vira glosa inferida, nem candidato vira vínculo confirmado.
- Sem prova de data/quantidade, retorno repetido ou múltiplo, contas/tipos/modalidades distintos e conflito de convênio continuam bloqueados.
- `null` é não informado. Zero explícito continua zero. Médico direto N permanece fora da pendência hospitalar, e não é somado a S.
- Outros convênios conservam o agrupamento anterior por setor.

## Auditoria das tratativas da conciliação atual

O serviço legado `faturamentoUnificadoService.ts` já agrupa Warleine sem setor na carga (`118–176`). Entretanto, usa máximos de identificadores de guia, e no pós-match agrega por guia/código sem data, escolhe correspondência por quantidade/valor e rateia o pagamento (`1787–1905`). A nova consulta preserva os identificadores completos e a data, sem rateio.

| Tratativa atual | Aplicação ao Banco |
|---|---|
| Mesma guia/TUSS/data | Reaproveitada com identificadores literais e datas civis, sem retirar zeros |
| Itens separados por setor | Implementada nesta entrega com composição e quantidade total provada |
| Diferença financeira | Já calculada com Decimal, sem converter diferença em glosa |
| Tolerância padrão 1% (`973–987`, `1648–1699`) | Não ativada silenciosamente. Preparar classificação parametrizada e auditável no fluxo persistido, separada da correspondência |
| Terceiros | S/N explícito já preservado; não copiar heurística de prestador ausente ou zerar faturado |
| Código divergente | Requer de-para/vínculo manual validado por unidade/convênio; não usar paciente/carteira como fallback |
| Acréscimos e vinculação manual | Planejar revisão/decisão auditável no fluxo persistido; não criar/absorver lançamentos na consulta |
| Eventos repetidos e pagamentos em vários arquivos | Preservar eventos e sinalizar ambiguidade; não copiar deduplicação por guia/código/valor sem data |
| Glosa | Só valor informado; não copiar código artificial 9999 ou glosa total inferida por ausência de pagamento |
| Reset, atualização de status e XML | Não reutilizar comandos legados que apagam/reescrevem resultados; dependem da entrega persistida e validação específica |

A migração 0135 da PR #75 continua somente versionada, não aplicada. Seus contratos e tabelas ainda não representam serviços funcionais de confirmação/exportação.

## Evidência real somente leitura — 13/10/2026

A simulação compara a main publicada com esta branch, usando a mesma competência e todos os meses de pagamento disponíveis. Os totais de faturado, pago e glosa de origem, o número de itens/eventos e o total de guias foram idênticos antes/depois.

| Competência | Itens da fonte | Grupos antes → depois | Grupos candidatos antes → depois | Grupos ambíguos antes → depois |
|---|---:|---:|---:|---:|
| 07/2026 | 1.743 | 1.680 → 1.577 | 40 → 45 | 10 → 0 |
| 08/2026 | 1.284 | 1.235 → 1.163 | 607 → 672 | 132 → 2 |

**São candidatos de leitura, não conciliações gravadas.** O denominador de grupos muda com a consolidação; não apresentar estes números como percentual de pagamentos conciliados. Nenhuma associação foi persistida. Dois grupos de agosto continuam ambíguos; não afirmar que toda ambiguidade foi eliminada.

## Validação

- 129 regressões aprovadas: comparador, 19 testes novos de consolidação/serviço, guias, permissões, apresentação, privacidade e contexto.
- Build, `db:check` e `git diff --check` aprovados.
- TypeScript: mesmos 172 diagnósticos históricos, sem novos locais/códigos.
- Ensaio visual com a página real, dados fictícios, desktop/mobile e rede externa bloqueada: composição expandida, nomes mantidos e nenhuma mutação.
- Ensaio real por agregados: duas competências, totais e contagens originais preservados.
- Auditoria independente sem bloqueante concreto no escopo; incluídas as regressões recomendadas de guias/TUSS/data, escalas decimais, quantidade negativa/vazia e nomes canônicos. Merge ainda exige revisão humana ou exceção específica de Sergio.

## Liberação

Entrega independente das PRs #74/#75: ambas já publicadas no checkpoint `e33aa0f9` com main `4b68f3c`. Esta melhoria não está nesse checkpoint. Deve entrar por PR própria e revisão/aceite antes de merge/publicação. Sem aplicar migração, popular dados, resetar ou confirmar vínculos.
