# Corretiva curta do BI de Glosas e extração da logo

## Autorização e revisão-base

Sergio autorizou em 11/11/2026, às 14:18 BRT, preparar a Opção A sobre a revisão exata **`2542651068b42c36249669c181d419089ed93e13`**, preservando integralmente a paleta automática da logo e o layout Power BI. Branch própria: `fix/bi-glosas-rodape-teclado-logo`.

O aceite atual permite implementar, testar e apresentar PR/SHA. Não é aceite humano da futura revisão nem autoriza automaticamente merge, sincronização do WebDev, checkpoint ou Publish. O ambiente WebDev foi preservado na release anterior durante o desenvolvimento.

## Quatro pontos do escopo

1. **Participação do rodapé:** corrigir a falsa cobertura de 100% nos rankings parciais, mantendo o denominador apropriado, zeros reais e precisão decimal. O exemplo sintético de 40% + 20% deve representar cobertura de 60%, não 100%.
2. **Escopo dos totais:** identificar/distinguir seleção, linhas exibidas e total do escopo, preservando os contratos de cross-filter e a limitação de rankings. Não substituir total global por soma de TOP N nem somar matrizes de granularidades diferentes.
3. **Navegação por teclado:** restaurar foco, Tab/Enter/Espaço e estados acessíveis nas linhas/cabeçalhos interativos, preservando o visual e o comportamento de clique.
4. **Concorrência de extração da logo:** vincular operações ao draft/escopo atual, invalidar resultados antigos de extração/redimensionamento e evitar que salvar/remover/cancelar/reabrir ou novas preferências consumam/apliquem conteúdo fora da versão atual. Preservar a extração e geração automática de paleta.

Nenhum filtro ou módulo novo faz parte desta corretiva. Devem ser mantidos os filtros por estabelecimento e demais filtros existentes, o tooltip/código descritivo de motivo e os contratos de exportação existentes.

## Controles e limites

- **Zero DDL e zero novas migrações. A 0146 já está aplicada e liberada; não reaplicar.**
- `drizzle/`, ledger técnico, SQL0146, snapshots/journal e executores0145/0146 permanecem imutáveis.
- Não acessar, alterar ou reproduzir configurações reais, dados hospitalares, pacientes, PDFs/XMLs ou valores individuais.
- Não alterar segredos, permissões, ERP, SMTP, Banco Inter, RPA ou conectores/TLS hospitalares.
- Não incorporar a entrega de contratos `e8dd998` nem a PR #176/Urológico. A branch é derivada de `2542651`; main posterior não deve ser publicada incidentalmente.
- As provas são sintéticas, em ambiente com `DATABASE_URL=''`, chaves fictícias e bloqueio de rede externa, sem backend ou banco do Portal.
- Não usar `db:migrate` geral, `db:push` ou executor0146 em modo apply. `db:check` somente com URL sintética.
- TypeScript deve ser comparado à baseline de **157 diagnósticos legados** de `2542651`, exigindo zero diagnósticos novos; não declarar o comando global limpo quando falha.

A hipótese isolada de contaminação entre hospitais não foi demonstrada no fluxo real: consumidores remontam por hospital/fonte. Isso não dispensa descarte de tarefas antigas nem regressões de escopo.

Permanecem fora do escopo a mudança de compatibilidade visual de CSS em configurações antigas, contraste de algumas paletas, novas validações de tamanho/URL de imagens e o comportamento herdado de exportação de dados anteriores durante troca de filtro. Esses limites devem ser apresentados, sem atribuir a esta corretiva garantias que seus testes não comprovam.

## Validação final

**Bateria consolidada aprovada em 11/11/2026:** 2.570 testes Vitest em 106 arquivos; 165 testes Node do legado0145 e 109 do procedimento0146 offline; build, `db:check`, diff e imutabilidade aprovados. TypeScript global permanece com os mesmos 157 diagnósticos legados, zero novos. A fonte testada foi fixada por hashes e será comparada ao commit da PR; a validação não equivale à aplicação de banco ou publicação.

As regressões novas incluem 15 testes da matriz (SSR do componente/JSX da página reais e eventos ReactDOM em host sintético) e 38 testes de concorrência de logo (componente/helper reais e promessas controladas fora de ordem). Foram verificados ranking parcial, zeros, centavos, chaves repetidas legítimas, total explícito de seleção, contraste de escopos oficial/Warleine, Tab/Shift+Tab, Enter/Espaço, ordenação/aria, cancelamento, remoção, salvar/loading, reset, preferências novas, reabertura e desmontagem. O host simula ações padrão de teclado; não é prova de navegador/DOM Radix visual.

O rodapé identifica “Total da seleção” quando recebe resumo explícito, sem substituir pelo TOP N; os demais usam “Subtotal das linhas”. Motivos/procedimentos recebem o denominador da seleção usado pela API. Quando o ranking oficial exclui sua própria dimensão, a participação pode exceder 100% sobre esse denominador; a descrição de escopo explicita isso, sem normalização enganosa. Percentuais autoritativos das linhas e zeros são preservados; cálculos/somas usam `decimal.js` já existente, com arredondamento na apresentação.

Cancelamento de logo é lógico: invalida proprietário/generation/signal e descarta conclusões anteriores, sem interromper fisicamente `Image`/`FileReader` ou desfazer mutação já enviada. Salvar não consome o draft anterior durante processamento; mutação enviada bloqueia edição/fechamento. O algoritmo `biLogoColorExtractor.ts`, a configuração compartilhada, todo `server/` e os artefatos de banco permaneceram intactos.

Prévia privada, quando apresentada, usa dados inteiramente fictícios e não é homologação de produção. Testes de apresentação não comprovam mudança de valores no banco, upload real, uso de credenciais ou publicação.
