# Esteira — perfil salvo e escopo de setores (Issue #155)

## Escopo

Corretiva isolada sobre `8261017`, da branch `fix/esteira-usuarios-acesso-recepcao`, sem integrar a `main` de contratos/glosas. Nenhuma migração, DDL ou alteração de permissões/perfis cadastrados. A publicação aplica a configuração já salva; não cadastra, libera ou revoga acessos por carga de dados.

## Política

- Para um colaborador **não-admin com perfil salvo**, os setores, hospitais e a opção de relatórios do perfil são respeitados, mesmo que exista permissão **Gerenciar na Central**. Gerenciar a equipe continua sendo um direito separado; não significa operar em todos os setores.
- O administrador mantém o bypass operacional já previsto, sem dispensar as guardas do hospital proprietário existentes no sistema.
- A **ausência comprovada de uma linha de perfil** mantém o comportamento legado. Esta entrega não cria perfis nem redefine automaticamente os usuários sem perfil. Uma linha inválida ou falha na leitura não equivale a ausência e bloqueia a operação.
- Um perfil com setores vazios não recebe todos os setores por fallback.
- O compartilhamento já aprovado entre **Limpeza/Envio** e **Enviado/Recursos** é mantido e usado de forma consistente na interface e no servidor. Estados de Recursos e Finalizado pertencem ao fluxo final; não liberam Recepção, Faturamento ou Auditorias.

## Consultas e guardas

`listarContas` e `resumoSetores` intersectam o perfil salvo com o escopo hospitalar já autorizado. Lista, paginação, contagem e KPIs usam o mesmo predicado de setores/hospitais. Pedir explicitamente um setor não autorizado é recusado. Sem setor explícito, a listagem reúne somente os setores liberados, sem ampliar para todos.

Guardas de cadastro, importação e operações por lote passam a usar o perfil salvo sem a ampliação pela gestão da Central. O direito de gerenciar a equipe não é removido nem convertido em direito operacional. Não há troca de proprietário ou alteração financeira.

## Interface

Menu e tela usam a mesma política de setores. Durante carregamento ou erro do perfil, não exibem acesso operacional por fallback nem iniciam as consultas operacionais. Seleção por URL é limitada ao escopo disponível. Perfil vazio apresenta estado sem setores, não seis cartões. A ação “Todos os Setores Liberados” significa a união dos setores efetivamente autorizados.

## Validação e promoção

Os resultados finais de testes, build, Drizzle, tipos e revisão de diff serão registrados na PR. Os ensaios usam banco/permissões simulados, sem pacientes, importações ou mutações em produção. A dívida TypeScript da base é de 195 diagnósticos; a comparação exige zero novos diagnósticos.

O checkpoint apresentado para revisão não comprova deploy nem constitui aprovação de merge. A produção permanece na release anterior até a autorização específica e a verificação do ambiente publicado.

## Resultado final da revisão preparada em 03/11/2026

**142 testes passaram em 9 arquivos**, incluindo cadastro negado fora do setor mesmo com gerenciamento Central, SQL/count/KPIs com interseção por perfil, vazio/erro fechados, admin/legado e compartilhamento dos setores finais. Build, `pnpm db:check` e `git diff --check` aprovados. Type-check global continua falhando com **195 diagnósticos legados**, semanticamente idênticos à base `8261017`, com **zero novos**; não foi declarado como aprovado.

Auditoria independente somente do delta: nenhum bloqueio crítico/alto confirmado. Isso é verificação técnica, não aprovação humana ou liberação de produção.

Cobertura da interface: helpers realmente usados pelo menu/tela e regressões da ligação no código-fonte; não houve renderização/E2E com perfis reais. SQL validada com mocks, sem consultar contas hospitalares. Não foi acionada nenhuma liberação de equipe, importação, alteração de perfil, migração ou reprocessamento real.
