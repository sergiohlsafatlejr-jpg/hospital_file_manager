# Conta Convênio — contexto médico informativo e confirmação de composição

Entrega em desenvolvimento; nenhum deploy ou DDL autorizado por este documento. Branch `feat/conta-contexto-medico-informativo`, baseada em main remota. O aceite final de Sergio será ligado à revisão/testes e, para banco, ao procedimento restrito específico. Sem aplicar 0135, db:migrate geral ou db:push.

## Objetivo

Mostrar os procedimentos e profissionais da estrutura TISS `guiaHonorarios` na conta XML hospitalar como informação, sem valores/recebimentos/lançamentos. Seleção assistida de gabaritos manuais com composição avaliada sobre itens hospitalares reais. Honorários nunca são inseridos em faturamento_tiss ou contas_convenio_itens. XML original preservado.

## Fronteiras e implementação

- Contratos públicos em `shared/contaContextoMedico.ts`. Não incluir valores médicos, carteirinha, autorização, URLs de XML, hashes ou conteúdo original em DTOs. Identificadores técnicos mínimos podem trafegar na sessão autenticada.
- Parser puro dedicado em `server/contaHonorariosParser.ts`: extrair informações de guiaHonorarios e procedimentoRealizado, tolerar objeto/array e namespaces, rejeitar DTD/ENTITY, limites; vários profissionais/registro repetido não multiplicam quantidade médica. Retornar códigos/descrições/profissionais/conselho/data e correlação privadamente, nunca valores. Não alterar parser financeiro legado.
- Comparador puro em `server/contaComposicaoInformativa.ts`: filtro duro unidade/convênio; todos os principais tipados e distintos necessários para elegibilidade. Gabarito parcial aparece inelegível, não como segunda recomendação. Composição por presença, ausência classificada e quantidade agregada decimal dos itens hospitalares. Sem setor no XML = avaliação explícita da conta inteira, não inventar Centro Cirúrgico. Não alterar comparador financeiro/legado nesta entrega.
- Grupos alternativos em JSON existente de itensAssociados: novos campos opcionais `grupoAlternativo`, `grupoObrigatorio` booleano. Alternativa satisfeita por pelo menos UM membro; zero com grupo opcional não gera falta; obrigatório gera somente UMA pendência de grupo. Não impor máximo 1 ou misturar UTI com hospedagem automaticamente. Categoria opcional/condicional/obrigatório continua preservada. Nenhum gabarito real será modificado automaticamente.
- UI na mesma ContaConvenioDetalhes: componente separado `client/src/components/contas/ContaContextoMedico.tsx`, ponto de integração em detalhes XML, oculto Warleine/Banco. Escolher o XML médico previamente importado com metadados de arquivo, ler/indexar como informação, exibir 6 registros/2 códigos quando existirem. Profissional informado não significa médico direto pago. Campos `informação não financeira` e `setor não informado`. Confirmar só gabarito elegível com justificativa, cancelar/invalidar sem apagar histórico. Não executar mutações ao montar componente.
- UI grupos no editor gabarito via campos da categoria/JSON atual, não hardcode em nomes de diárias.
- Backend router `contaContextoMedico` separado registrado em server/routers.ts; permission `reportProcedure('contaConvenio')` + autorização de unidade e escopo servidor. Consultas não escrevem. Fonte XML é indexada por mutação manual, a partir de arquivo previamente cadastrado do mesmo convênio/unidade. Não importar valores nem disparar comparador legado que salva divergências.
- Persistência aditiva: fontes informativas por arquivo+guia e versão (JSON sem valores), confirmação vigente por chave completa, eventos imutáveis de decisão. A versão vem do conteúdo semântico, não timestamp de publicação. Confirmação transacional, controle otimista de revisão e fonte/gabarito alterados bloqueiam uso definitivo; mesmo arquivo/versão idempotente; reimportação diferente exige reconfirmação. Três tabelas pequenas novas, sem FK improvisada nem DML clínico. Schema novo exportado via schema.ts; main agent reserva e gera migração com db:generate/db:check, não agentes.

## API compartilhada

`ScopeContaMedica`: estabelecimentoId:number, convenioId:number, numeroConta:string, arquivoHospitalId:number, numeroLote?:string, competencia?:string. Campos derivados/validados contra linhas reais de faturamento_tiss do arquivo e guia exatos; ambiguidade recusar.

Router operações:
- `consultar({scope})`: fontes informativas já indexadas, candidatos e composição atual, contexto confirmado/pending. Sem escrever ou buscar XMLs externos automaticamente.
- `listarArquivos({scope})`: metadados de XMLs enviados do mesmo estabelecimento/convênio (limite com paginação), nunca URL/secret.
- `indexar({scope,arquivoMedicoId})`: leitura única de XML autorizado e correlação forte do arquivo médico com guia, beneficiário quando presente, datas compatíveis; armazenar somente referência informativa. Ambiguidade bloquear.
- `confirmar({scope,padraoId,justificativa,revisaoEsperada})`: servidor recompõe contexto atual, valida elegibilidade e versões, persiste associação e evento atômicos; não financeiro.
- `invalidar({scope,justificativa,revisaoEsperada})`: registro de cancelamento/versionamento, sem delete.

DTO `ContaContextoMedicoResultado`: configuracaoPendente:boolean, fontes:FonteMedicaInfo[], candidatos:CandidatoGabarito[], contexto:ContextoMedicoInfo|null, itensHospitalares:number, setorInformado:boolean, avisos:string[]. Frontend usa export type destas interfaces (sem any).

FonteMedicaInfo: arquivoId:number, registros:number, codigosDistintos:number, procedimentos: ProcedimentoMedicoInfo[], versao?: nunca hash público. ProcedimentoMedicoInfo: codigo, descricao, dataExecucao|null, profissionais:{nome,conselho,numeroConselho}[], sequencial|null; sem quantidade financeira ou valores.
CandidatoGabarito: padraoId, nome, elegivel:boolean, motivos:string[], principaisTotal:number, principaisEncontrados:number, recomendacao:boolean, composicao:ResumoComposicao (item results cod/desc/categoria/grupo/presenca/qtd optional, counts). Apenas um elegível inequívoco => recomendado, mesmo assim confirmação humana obrigatória.
ContextoMedicoInfo: padraoId, nomePadrao, status:'confirmado'|'invalidado'|'revisao_necessaria', revisao:number, confirmadoEm:string|null, confirmadoPor:number|null, justificativa:string, abrangencia:'conta_inteira_sem_setor'|'conta_inteira'.

## Correções das informações anteriores

A simulação anterior usou por engano o snapshot de outra conta (44 itens) com XML novo (39 itens). A lista 14/32 e 18 ausentes NÃO será usada como resultado dessa guia nova; recalcular metadados corretos sem emitir dados clínicos. `tipo=DIARIA/MAT_MED` não é categoria/obrigatoriedade: usar campo categoria real. Grupos alternativos não tornam diárias opcionais em obrigatórias, nem definem máximo 1 sem aprovação da regra. Não classificar honorário como recebimento direto comprovado apenas por profissional presente.

## Validação

Testes sintéticos: parsing honorários arrays/namespaces/dtd/sem valores, correlação guia/carteira/datas sem exposição, bloqueios unidade/convênio, parcial vs completo, grupo OR opcional/obrigatório, quantidades agregadas, idempotência/concurrency/reimportação, permissão, não financeiro. Prévia componente REAL com fixtures sintéticas e sem DATABASE_URL, mutações mockadas. Testes/build/types baseline/db:check/diff. SQL e procedimento novos apresentados antes de DDL. Sem cadastrar associação ou regra na guia real até autorização específica.
