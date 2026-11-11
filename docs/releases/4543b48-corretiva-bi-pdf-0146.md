# Release 4543b48 — corretiva BI/PDF e procedimento restrito 0146

## Identidade e estado

Base exata: `4543b484a54be99de5a621c2a95cb29013fe1c91`. Branch da corretiva: `fix/bi0146-isolamento-procedimento`, no repositório oficial `sergiohlsafatlejr-jpg/safatle-sistema`. Preservados os três commits recebidos: recuperação de PDF, escala fluida/responsiva e Painel BI Executivo XML/Banco-CSV.

A corretiva é apresentada antes de merge, DDL, sincronização do WebDev, checkpoint ou publicação. A exceção específica da 0146 não é uma aprovação humana de um SHA futuro. Sergio deve aceitar a revisão final apresentada. Auditorias técnicas não concedem esse aceite em seu nome.

## Correções de segurança e consistência

### Painel BI Executivo

O catálogo de motivos de glosa é resolvido por hospital/global antes do JOIN e da soma, com prioridade local e escolha determinística. Isso evita descrição de outra unidade e multiplicação dos valores por catálogo duplicado; o JOIN corrigido não usa subconsulta em `ON`.

O faturado XML é reconhecido uma vez pelo grupo oficial de competência/convênio. As matrizes financeiras conservam as chaves do grupo, complementando ausências em linhas explícitas sem dimensão. Retornos sem vínculo ou com dimensão ambígua não herdam setor/tipo por inferência. Saldos informados zero ou negativos em Banco/CSV continuam autoritativos; somente NULL ou coluna legada ausente permite a fórmula de estimativa por linha, antes do SUM.

A tela vincula a resposta à chave completa de hospital, modo e filtros. Rejeita placeholder, erro e fonte/identidade divergentes; não exibe nem exporta os dados da unidade anterior durante troca de hospital/modo. Filtros, overrides e modais são reiniciados por montagem com chave, antes da primeira consulta do novo escopo. A guarda protege também o handler de Excel.

Erros do serviço/driver são transformados em mensagens genéricas no router, sem SQL, infraestrutura, credenciais ou exceção bruta. Autenticação, autorização de relatório e escrita por estabelecimento foram preservadas e exercitadas com stubs sintéticos.

**Limites semânticos importantes:** as medidas monetárias das quatro matrizes são reconciliadas com o resumo; as contagens não são aditivas entre matrizes de granularidades diferentes. Saldo analítico XML pode ser negativo; o clamp do resumo fica em uma linha explícita de ajuste global sem atribuição fictícia. Rankings permanecem Top 30, não matrizes de totais. SQLite em memória e mocks não são homologação física TiDB nem prova de plano/performance em produção.

### Upload e recuperação de PDF

Somente indisponibilidade explícita do processador permite fallback. Limites, timeout, cancelamento, integridade, arquivo inválido, processador ocupado e erros desconhecidos interrompem o fluxo, sem virar OCR ou sucesso fictício.

O fallback usa o motor instalado em subprocesso limitado, descritor fixado, validação de entrada/saída e integridade, com backpressure. Reutiliza os limites do leitor: 150 MiB por PDF, 512 páginas, 2 MiB de texto, 50.000 linhas, prazo cumulativo de 75 segundos e teto de memória do subprocesso. O timeout não é reiniciado ao entrar no fallback. Cancelamento aguarda fechamento após matar o filho.

A recuperação preserva a referência original até confirmar a criação substituta. Resposta incerta bloqueia replay; conflito conhecido reconcilia a tentativa original. A reserva de outro usuário não é removida. Não foram alterados cifra, cofre ou storage; não há novo armazenamento efêmero.

**Limites de implantação:** conferir ferramentas locais e configuração durável antes da promoção. Os testes não provam storage, PDF real, OCR/IA ou personalização gravada em produção. Essas operações não foram executadas.

## Procedimento restrito 0146

SQL, schemas, snapshots e journal integrados permaneceram intactos. Não há outra migration nesta corretiva. O novo executor restrito é `scripts/migrations/0146-painel-bi-restrita.mjs`, com testes em `tests/scripts/0146-painel-bi-restrita.test.mjs` e contrato em `docs/migrations/0146-painel-bi-restrita.md`.

Escopo único: criar `estabelecimento_bi_personalizado` vazia, com **12 colunas, 1 PK e 1 UNIQUE por estabelecimento**, sem FKs, e adicionar somente o marker técnico `when=1794400248375`. A baseline legada pós-0145 de **106 registros** deve permanecer integralmente preservada; após sucesso, o ledger terá apenas o marker adicional da 0146.

Preflight físico anterior, somente leitura: TiDB/TLS confirmados, baseline 106 preservada, tabela e marker 0146 ausentes. Isso não substitui o novo preflight vinculado ao SHA final, manifesto, reserva e janela exclusiva.

Sergio concedeu em 11/11/2026, às 10:02 BRT, exceção **única e específica** sem backup durável prévio, restauração comprovada ou homologação TiDB separada. O risco permanece: CREATE pode confirmar enquanto o marker fica pendente. Nenhum rollback, checkpoint ou arquivo local comprova recuperação do CREATE.

A execução autorizada deve exigir artefatos versionados/Git limpo e manifesto privado de origem verificável, sessões TLS independentes, ausência física antes do CREATE, catálogo completo e zero linhas antes do marker, transação pessimista do marker, confirmação independente pós-commit e registro sanitizado de `MIGRAÇÃO LIBERADA` na Issue #34. Parar na primeira falha ou incerteza, preservar evidências e não repetir/reparar automaticamente.

**Proibidos:** `db:migrate` geral, `db:push`, reaplicar 0145/0143, DROP/TRUNCATE/DELETE, alteração de baseline/ledger legado, retry cego ou outra migração. Arquivos de aprovação, alvo TLS e credenciais ficam privados e fora do Git.

## Verificações

A bateria consolidada final de 11/11/2026 passou em ambiente sintético, com `DATABASE_URL=''`, segredos fictícios e guarda de rede. Não houve inicialização de backend nem uso de dados reais.

| Verificação | Resultado final |
|---|---|
| Vitest, seleção completa serializada | **2.515 testes, 103 arquivos, zero falhas** |
| Testes Node 0145, na baseline imutável sem journal 0146 | **165 aprovados**; fontes/testes idênticos ao legado preservado |
| Testes Node do executor restrito 0146 | **109 aprovados** |
| Build e `pnpm db:check` | Aprovados; URL sintética no check |
| `git diff --check` | Aprovado |
| SQL/schema/snapshots/journal e artefatos 0145 | Sem delta em relação à base apropriada |
| TypeScript global | **Falha, exit 2: 157 diagnósticos legados**, idênticos à baseline publicada e à revisão recebida; **zero novos** |

A primeira execução teve duas falhas porque o runner usou outro valor de segredo fictício, além de uma asserção temporal LZMA que interrompeu antes de mais de uma fatia. O runner foi corrigido e a mesma seleção completa foi serializada; a execução final passou integralmente. Decoder e testes LZMA ficaram byte a byte preservados. Evidências da execução inicial e final foram mantidas separadas; não houve alteração do código para enfraquecer a prova.

As provas focadas concluídas incluem 17 regressões de consistência BI, 10 testes de escopo com QueryObserver e render DOM React/tRPC reais, 8 testes de segurança do router, 60 novos testes PDF/recuperação e 109 testes offline do executor 0146. Não somar esses números ao consolidado: os mesmos testes podem estar incluídos nele.

A revisão técnica estática do executor e do wrapper não identificou bloqueantes altos/críticos, mas não autentica a aprovação humana, reserva, manifesto ou banco real. O wrapper privado foi adicionalmente endurecido para exigir aceite explícito do SHA final antes de qualquer acesso operacional.

## Sequência após aceite de Sergio

1. Mesclar somente a PR e o SHA apresentados; revalidar o merge exato sem incorporar novas entregas.
2. Atualizar a reserva única na Issue #34, vincular evidência privada de aprovação/exceção e executar preflight somente leitura do executor restrito, em janela exclusiva.
3. Se todos os gates permanecerem válidos, aplicar a 0146 uma única vez. Na primeira falha/incerteza, parar; não publicar nem tentar recuperação automática.
4. Após confirmação independente de catálogo/marker, registrar resultado sanitizado e `MIGRAÇÃO LIBERADA`.
5. Conferir filas e candidatos de inicialização, configuração e ferramentas; sincronizar o WebDev ao merge, build/restart quando seguro, checkpoint e Publish.
6. Comprovar a versão pública por bundle/rota protegida e smoke somente leitura. Checkpoint ou restart não equivale a publicação.

A PR #176 e a frente Urológico/rede/TLS ficam fora do escopo. Não inclui dados reais, importação/reprocessamento de arquivos, personalizações reais, alterações de perfis, chaves, conectores, ERP, SMTP, Banco Inter, RPA ou novas automações.
