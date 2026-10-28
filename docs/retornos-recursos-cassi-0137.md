# Retornos de recursos — piloto CASSI e migração 0137

Entrega da Issue #108, branch `feat/retornos-recursos-cassi`. Depende da primeira etapa da PR #107, já mesclada. Esta segunda etapa não está liberada para produção por essa autorização anterior.

## Funcionamento

A opção **Retornos de Recursos** recebe respostas de recursos de glosa, não demonstrativos comuns nem XMLs de faturamento. O primeiro formato suportado é o exemplo CASSI/TISS 4.01.00, transação `RESPOSTA_RECURSO_GLOSA`, com um recibo por XML. Outros formatos são rejeitados; não há promessa de suporte genérico a todas as operadoras.

O usuário seleciona estabelecimento e convênio CASSI, faz a prévia e confirma a importação. O servidor confere autorização, registro ANS e código de prestador ativo no cadastro do hospital/convênio. A origem é **externa** quando o hospital já apresentou o recurso no sistema da operadora; importar essa resposta não reenvia o recurso nem fabrica um lote do Portal. A origem **Portal** só admite vínculo a lote existente e compatível no mesmo escopo.

As sugestões comparam guia, item, data, código de glosa e sequencial quando disponível. Nome, descrição e valor não desempatam candidatos. A tabela de origem não informa todos os campos TISS; o código de tabela não é presumido como validado. Candidatos ambíguos, divergentes ou ausentes permanecem para revisão. Cada aprovação exige seleção explícita e justificativa, usando os dados atuais da fonte.

O XML recebido é preservado. As datas do recurso original e do documento de resposta ficam separadas; nenhuma delas é interpretada como pagamento. Divergências entre o cabeçalho e a soma dos itens são visíveis e exigem confirmação específica antes da aprovação.

## Valores e histórico

**Recursado** é o pedido no XML; **acatado** é a decisão da operadora. **Recebido informado** é a soma dos lançamentos de recebimento menos seus estornos, jamais o valor pago originalmente no demonstrativo. O saldo acatado é calculado sobre os vínculos aprovados, descontando os recebimentos líquidos. A diferença entre recursado e acatado não é uma conta automaticamente recebível.

Pagamentos parciais exigem data, referência e observação/evidência informada pelo usuário. São limitados ao saldo aprovado, com chave idempotente e bloqueio transacional para impedir duas parcelas concorrentes excedendo o saldo. Estornos são eventos compensatórios, sem apagar o recebimento original. Isso é um controle manual rastreável: ainda não há importação automática de comprovantes bancários ou identificação automática de pagamentos do recurso.

O demonstrativo original, o faturamento e os lotes externos não são atualizados pela aprovação da resposta. Alteração ou remoção da fonte deve impedir novos lançamentos baseados em um vínculo que deixou de ser válido. A rebusca recalcula sugestões não aprovadas e preserva o histórico aprovado; não escolhe automaticamente uma nova linha para substituir uma aprovação.

## Anexos e relatórios

XMLs e PDFs de protocolo são cifrados com AES-256-GCM antes de ir para o armazenamento. A leitura passa por autenticação e escopo hospital/convênio, com tamanho limitado. O cliente não recebe chave de armazenamento, URL pública do original nem hashes internos. As duas chaves dedicadas precisam ser configuradas e preservadas em gerenciador de segredos antes da ativação: `RETORNOS_RECURSOS_FILE_KEY` (32 bytes em hexadecimal ou Base64) para os arquivos e `RETORNOS_RECURSOS_CONFIRMATION_SECRET` (pelo menos 32 bytes) para assinar a confirmação da prévia. Não usar a chave de sessão da plataforma como substituta nem registrar segredos no GitHub.

O PDF desta entrega é um **protocolo/comprovante do recurso**; não implementa ainda o cadastro e a análise do contrato hospitalar.

O Excel organiza resumo por lote, linhas da resposta e eventos financeiros. Distingue recursado, acatado e recebido; datas e justificativas vêm das fontes identificadas. Dados não presentes no XML não são inventados. Textos são protegidos contra execução de fórmulas na planilha.

## Estrutura nova

A migração gerada `drizzle/0137_retornos_recursos_cassi.sql` cria somente:

| Tabela | Finalidade |
|---|---|
| `recursos_retornos_importacoes` | Cabeçalho, identidade documental e referências de anexos |
| `recursos_retornos_linhas` | Itens imutáveis da resposta e sugestões de vínculo |
| `recursos_retornos_revisoes` | Aprovações, rebuscas, conflitos e anexos auditáveis |
| `recursos_retornos_pagamentos` | Recebimentos e estornos em ledger append-only |

Os 16 comandos gerados são quatro `CREATE TABLE`, cinco FKs `RESTRICT` entre as tabelas novas e sete índices. Não há `DROP`, `TRUNCATE`, carga, alteração de tabela hospitalar existente ou ativação de horário. O schema TypeScript, snapshot e journal acompanham a mesma revisão. A reserva foi registrada na Issue #34; a 0135 Banco/XML continua fora do escopo.

## Procedimento de implantação — ainda sujeito a revisão e autorização

1. Revisar a PR e o SQL exatos. Confirmar que a única reserva ativa é esta e que a main não recebeu outra migração.
2. Validar os testes sintéticos, o ensaio SQL local, o build, a ausência de novos erros de tipos e o `db:check`. MariaDB local não equivale a uma restauração ou réplica completa do TiDB de produção.
3. Preparar backup aplicável e procedimento de recuperação; confirmar suporte do TiDB às FKs e compatibilidade física dos quatro nomes novos. Se qualquer tabela já existir, parar e comparar a estrutura — nunca adotar, apagar ou recriar silenciosamente.
4. Sergio ou delegado formal autoriza **a aplicação restrita da 0137** com revisão/registro exatos. O pedido de desenvolvimento ou a autorização da PR #107 não substituem essa liberação.
5. Aplicar somente os comandos dessa migração, pelo executor restrito revisado. **Não executar `pnpm db:migrate` geral**, que pode selecionar migrações antigas e a 0135. Não simular transação para DDL nem registrar o journal antes de comprovar todas as tabelas, índices e FKs. Em falha parcial, parar e recuperar pelo estado físico; não repetir cegamente os comandos.
6. Conferir em conexão independente as quatro estruturas vazias e a entrada única de histórico com os dados do journal gerado. Registrar o resultado sanitizado na Issue #34.
7. Configurar `RETORNOS_RECURSOS_FILE_KEY` e `RETORNOS_RECURSOS_CONFIRMATION_SECRET` pelo canal seguro e publicar o código integrado. Checkpoint não é deploy; comprovar os arquivos/rotas publicados.
8. Testar com dados sintéticos e verificar a interface e permissões. A primeira importação do XML CASSI real, a revisão de vínculos e qualquer lançamento financeiro continuam dependendo da seleção do lote e autorização específica. Não lançar pagamentos por inferência.

Se o código estiver disponível antes da migração ou da chave, a tela deve mostrar configuração pendente e bloquear a confirmação, não fazer ajustes no banco automaticamente.

## Validação

Validação concluída em 26/10/2026:

- 93 testes sintéticos de parser, vínculo, armazenamento, contratos, interface e permissões aprovados. Os oito testes SQL permanecem desabilitados por padrão, exigindo opt-in explícito e endereço local fixo.
- Oito cenários SQL aprovados em MariaDB local: importação idempotente, conflitos de documento, autorização e prestador, revisão humana, pagamentos parciais/estorno, mudança da fonte, importações concorrentes e reserva do mesmo item em respostas diferentes. A migração foi aplicada somente ao banco fictício.
- 13 cenários de navegador aprovados, sem erros JavaScript, incluindo mobile, Excel/XML, origem externa/Portal, ausência de configuração, ambiguidade, parcelas, estorno e callback tardio após troca de unidade.
- Build, `db:check` e `git diff --check` aprovados. TypeScript mantém os mesmos 172 diagnósticos legados, sem novos erros por arquivo/código.
- Revisão técnica independente focal não encontrou bloqueantes remanescentes na reserva única do item ou na recuperação idempotente da importação concorrente.

### Pendências do piloto COTEFI/CASSI

O preflight de produção utilizou somente SELECTs e rollback. As quatro tabelas novas ainda não existem. O convênio CASSI ativo e aplicável ao COTEFI não tem registro ANS preenchido; também não foi encontrado um vínculo ativo de prestador compatível com o XML de exemplo. Confirmar essas identificações pelo cadastro administrativo antes de utilizar o arquivo real, sem presumir que o prestador de outro hospital pertence ao COTEFI.

As chaves dedicadas não estão configuradas na sessão de desenvolvimento. Isso não comprova o estado dos segredos de produção; sua disponibilidade e preservação precisam ser verificadas pelo canal seguro na implantação.

Nenhuma mudança desta segunda etapa foi aplicada ao banco de produção. Não houve importação dos XMLs reais, aprovação de vínculos, cadastro de prestador nem lançamento financeiro. A publicação da primeira etapa da PR #107 foi comprovada separadamente e não libera a segunda etapa.
