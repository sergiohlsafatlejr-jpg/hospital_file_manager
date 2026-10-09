# Conta Convênio Warleine: campos do item e fonte por estabelecimento

**Solicitação de Sergio:** 09/10/2026.
**Issue:** [#66](https://github.com/sergiohlsafatlejr-jpg/safatle-sistema/issues/66).
**Branch:** `fix/warleine-campos-item-hup`.
**Banco:** sem alteração estrutural, DDL, carga, UPDATE de fatos ou conciliação. Não aplica nenhuma migração.

## 1. Correção do entendimento anterior

Sergio confirmou que, na extração Hop financeira do **Hospital Urológico**, `data` significa **data do item**, `procdisco` é **código TUSS**, `codgrufi` é **tipo de item**, `receber` é **S: via hospital / N: médico direto**, e `nomecc` é **setor**.

Esta confirmação substitui o diagnóstico anterior que tratava `data` HUP como abertura da conta e dizia que não havia data do item nessa fonte. A informação não deve ser estendida automaticamente a arquivos históricos ou outras unidades com contratos diferentes.

O parser existente já publicou `data` na coluna canônica histórica `dataAberturaConta`. Esta PR **não regrava o snapshot e não muda hashes ou identidades**: a resposta de leitura acrescenta `dataItem` para itens do estabelecimento HUP provenientes do publicador Hop. Outras origens preservam a interpretação antiga e sua data de origem é identificada separadamente.

## 2. Campos exibidos na mesma Conta Convênio

No detalhe da Conta Convênio, origem **Faturado Warleine**, a tabela de itens passa a mostrar:

| Coluna | Campo da origem / canônico | Regra |
| --- | --- | --- |
| Data do item | HUP `data` / valor histórico `dataAberturaConta` | DD/MM/AAAA, sem conversão de fuso; somente contrato Hop HUP confirmado |
| Código TUSS | `procdisco` / `codigoTuss` | Texto; conserva zeros à esquerda |
| Código interno | `codproprio` / `codigoItemInterno` | Coluna distinta; não é substituto silencioso do TUSS |
| Tipo de item (codgrufi) | `codgrufi` / `codigoTipoServico` | Exibe o código informado, sem inventar descrição de catálogo |
| Tipo de procedimento | `tipoproc` / `tipoItem` | Campo anterior mantido separado de codgrufi |
| Recebimento | `receber` / `recebimentoViaHospital` | Via hospital (S), Médico direto (N); vazio/desconhecido: Não informado |
| Setor | `nomecc` / `setorNome` | Setor informado pela origem |

Descrição, quantidade, unitário, faturado, análise e paginação permanecem. A rota é a mesma `/conta-convenio` → `/conta-convenio-detalhes?fonte=WARLEINE`; não foi criada outra Conta Convênio ou outro menu.

O código de glosa `codtiss` **não** é exibido como código TUSS. O motor de regras não foi alterado nem executado. A PR não transforma N (médico direto) em recebimento do hospital.

### Privacidade e isolamento

- Leitura da view de snapshot ativo, filtrada por estabelecimento + competência + conta + convênio.
- `origemRegistroId` é utilizado apenas internamente para identificar o contrato de data. Não é retornado pela API.
- Permissões existentes do módulo Conta Convênio permanecem exigidas.
- Nenhum paciente, linha clínica/financeira, hash de origem ou credencial integra esta documentação, Issue ou PR.

## 3. Faturado não é o mesmo que lote TISS comprovado

Segundo Sergio, a presença da guia no mês de produção com `numfatura` indica que foi faturada. Assim, o novo adaptador de faturamento poderá tratar:

- `mesprod`: competência de produção/faturamento;
- `numfatura`: remessa/referência de faturamento;
- `data`: data do item HUP;
- `procdisco`: código TUSS;
- `codgrufi`: tipo de item;
- `receber`: modalidade de recebimento;
- `nomecc`: setor.

Isso resolve a lacuna semântica da data do item nesta fonte e confirma o contexto de faturamento. **Não prova, por si só, que `numfatura` seja igual ao número do lote TISS informado no demonstrativo.** A conciliação deve usar esse campo como remessa até existir relação verificável com lote/protocolo da operadora. A identificação original da linha e os casos de múltiplos retornos continuam merecendo desambiguação.

## 4. Fonte oficial por estabelecimento — desenho recomendado, não ativado nesta PR

**Sim, é possível e recomendado escolher uma fonte oficial de faturamento por estabelecimento: XML ou BANCO.** A escolha deve ser persistida, não calculada a cada consulta conforme a existência de linhas.

| Configuração recomendada | Efeito |
| --- | --- |
| Estabelecimento | Unidade obrigatória; nenhuma configuração global que misture hospitais |
| Fonte de faturamento: XML | Utiliza o faturado dos XMLs enviados |
| Fonte de faturamento: BANCO | Utiliza os itens publicados do adaptador hospitalar escolhido (ex.: Hop/Warleine HUP) |
| Sistema/adaptador | Warleine, Tasy, Easyvision etc., apontando ao modelo validado; não a staging em carga |
| Vigência | Escolha padrão da unidade e início de competência, se houver troca da origem, preservando conciliações históricas |
| Auditoria | Quem configurou, quando, fonte anterior e motivo |

### Regras de produto

1. A mesma resolução de fonte deve ser usada em `popularTudo`, `faturamento_unificado`, Conta Convênio e Conciliação Cruzada. A configuração deve aparecer na interface.
2. XML e BANCO podem continuar armazenados para auditoria/comparação, mas **não são somados para a mesma cobrança**. Não oferecer AMBOS como total oficial sem deduplicação comprovada.
3. Se a fonte selecionada estiver sem carga, exibir **Fonte configurada sem carga publicada**. Não trocar silenciosamente para a outra fonte e não interpretar ausência como faturado zero comprovado.
4. Recebimento é uma escolha diferente: continua vindo do **evento único do demonstrativo importado**, mesmo quando o faturado é BANCO.
5. Alterar a fonte não deve apagar XML, snapshot ou vínculos antigos. Trocas que afetem histórico devem mostrar escopo e impacto antes de aprovação por Sergio.
6. Novas unidades precisam de configuração definida por Sergio; esta PR não define XML/BANCO automaticamente para nenhuma delas.
7. **Recomendação para o Urológico:** BANCO → snapshot Hop/Warleine, a ser ativado junto com o adaptador de faturamento e a ponte de conciliação, após validação. A mudança não foi ativada aqui.

### O que já existe e o que falta

Existe `estabelecimento_fonte_relatorios`, com `fonteFaturamento` em `integ_faturado`, `contas_convenio_itens` ou `faturamento_tiss` e `origemPreferida` XML/BANCO_CLIENTE/AMBOS. Ela é utilizada por alguns relatórios, mas **não** controla hoje `popularFaturamentoUnificado` nem incorpora o snapshot canônico Warleine como opção própria.

Portanto, simplesmente editar esse cadastro **não** resolveria a escolha de fonte da Conciliação Cruzada. Deve-se evoluir o contrato e os consumidores de forma coordenada. Se essa entrega exigir schema, reservar uma única migração na Issue #34, usar `db:generate`/`db:check` e aplicar somente após revisão e autorização de produção. Nenhuma reserva/migração foi feita por esta PR visual.

## 5. Validação da entrega visual

- Testes sintéticos do contrato de apresentação: data HUP e bloqueio de interpretação para outras origens, S/N/vazio, códigos textuais, datas civis e identidade técnica não retornada.
- Teste do endpoint com driver simulado: todos os SELECTs segregados, paginação, valores/quantidades e totais preservados.
- Regressões existentes de permissões, fonte Warleine, motor de regras e mapeamento Hop.
- QA local da página real, com dados sintéticos, respostas inteiramente simuladas e rede externa bloqueada: cabeçalhos/células, paginação e desktop/mobile. Nenhuma prévia foi ligada ao banco de produção. É ensaio de UI local, não homologação end-to-end com autenticação real.
- Build, `db:check`, `git diff --check` e comparação do diagnóstico TypeScript com a main constituem os gates antes do commit/PR.

**Não confundir:** PR aberta não é merge; checkpoint não é deploy; alteração de apresentação não publica o faturado em `faturamento_unificado` e não cria conciliações.

### Resultado final em 09/10/2026

- **49 testes em cinco arquivos aprovados**, incluindo 22 novos casos do contrato/campos.
- **Build, `db:check` e `git diff --check` aprovados.**
- TypeScript: **172 diagnósticos preexistentes**, mesma distribuição por arquivo/código e mensagens equivalentes após normalizar os caminhos dos worktrees/dependências; **zero novos diagnósticos**, zero nos arquivos desta mudança.
- QA local desktop/mobile aprovado: cabeçalhos e valores S/N/desconhecido corretos, data civil 25/10 preservada, paginação anterior/próxima, zero erro React e sem overflow da página mobile (a tabela usa rolagem horizontal).
- Auditoria independente focal: erro novo de tipagem detectado e corrigido antes do commit; reauditoria aprovou, sem P0/P1 restante identificado.
- Não há prévia remota privada autenticada por PR configurada nesta entrega. O teste visual foi local, isolado, sintético e não substitui validação funcional do revisor. Não foi alterada a prévia compartilhada WebDev nem feito deploy.
