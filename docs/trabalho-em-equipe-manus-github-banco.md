# Trabalho em equipe no Safatle Sistema

**Autor:** Manus AI
**Equipe:** Sergio, Danilo e Paulo
**Projeto:** Safalte Sistemas
**Repositório:** `sergiohlsafatlejr-jpg/safatle-sistema`
**Regra de aprovação atualizada por Sergio:** 26/10/2026, 19:08 BRT

## Regra permanente de aprovação

Sergio é o **único aprovador obrigatório** das Pull Requests e o responsável final por prioridades, mudanças destrutivas e liberações em produção. Por decisão expressa dele em 26/10/2026, Danilo e Paulo deixam de ser revisores obrigatórios. Eles podem contribuir com revisões técnicas quando solicitado, mas sua disponibilidade ou aprovação não é requisito adicional ao aceite de Sergio.

Essa mudança não é autorização irrestrita para mesclar todas as PRs abertas ou executar qualquer operação de produção. Cada merge, publicação, migração, carga, exclusão ou ativação depende da autorização de Sergio para o escopo e a revisão apresentados. Se ele autorizar um conjunto claramente identificado de PRs, registrar esse conjunto e seus limites; não estender a liberação a outras PRs ou revisões posteriores relevantes.

O autor apresenta a mudança, os testes, as limitações e o impacto. Sergio dá o aceite humano final. Auditorias automatizadas e pareceres de agentes ajudam a análise técnica, mas não devem ser registrados como uma aprovação humana de Sergio.

## Branches, GitHub e coordenação

Sergio, Danilo, Paulo e Manus podem preparar entregas em paralelo, em **branches próprias**. Toda alteração do sistema deve ser sincronizada com `https://github.com/sergiohlsafatlejr-jpg/safatle-sistema.git` e entrar em `main` por Pull Request. **Nunca fazer push direto em `main`**, inclusive em mudanças urgentes ou somente documentais.

Por decisão de Sergio em 02/10/2026, a coordenação ocorre por Issues e PRs do GitHub; não depende de Manus Collab. A Issue privada [#34 — Coordenação de migrações](https://github.com/sergiohlsafatlejr-jpg/safatle-sistema/issues/34) registra reservas, responsável, revisão, PR, executor, janela e resultados sanitizados de banco.

Cada entrega deve ter escopo curto, responsável, branch e PR identificados. A PR registra as verificações pertinentes, uma descrição do impacto e as pendências. Somente membros autorizados acessam o repositório; sua natureza privada não permite incluir segredos ou dados hospitalares.

O fluxo de desenvolvimento é atualizar a referência da `main`, criar branch própria, implementar, testar, revisar o diff, sincronizar a branch e abrir PR. A aprovação de Sergio deve ser ligada ao escopo e à revisão apresentados antes do merge/publicação. Checkpoint não comprova deploy; verificar o ambiente publicado antes de declarar implantação.

## Testes e prévias

Executar testes focados, build, verificação de tipos e `git diff --check` conforme a entrega. Para mudanças de banco, `pnpm db:check` permanece obrigatório. Dívida técnica preexistente deve ser identificada por baseline; não declarar verificações falhas como aprovadas, nem introduzir novos erros no escopo.

Mudanças visuais devem apresentar uma prévia privada com dados sintéticos ou desidentificados autorizados, em backend e banco isolados de produção. Não apontar mutações ou importações de uma prévia para o banco do Portal. Identificar branch, revisão e evidências; não prometer prévia persistente por PR antes de configurar e verificar esse serviço.

## Divisão de responsabilidades

Sergio define prioridades, analisa o escopo e as evidências e autoriza merge, publicação e ações de produção. Danilo e Paulo desenvolvem em branches próprias, preparam testes e PRs e podem oferecer revisão técnica opcional. Manus apoia implementação, análise, testes e coordenação e só executa produção com autorização específica e delegação de Sergio quando aplicável.

Aprovação de código não equivale a autorização de banco ou de dados. Delegação de execução não autoriza redefinir requisitos, escolher outro destino, ampliar recortes ou executar recuperação destrutiva.

## Fluxo obrigatório de banco

### Reserva única

Manter **somente uma migração ativa por vez**. Antes de gerar ou aplicar, consultar a Issue #34 e registrar `MIGRAÇÃO RESERVADA`, com responsável, branch, PR e escopo. A reserva não confere autorização automática de produção. A próxima migração aguarda liberação ou suspensão formal da atual.

Enquanto uma reserva estiver ativa, podem avançar em paralelo mudanças de código que não gerem nem alterem migração. Alterações concorrentes em schema/journal devem aguardar a fila. Registrar `MIGRAÇÃO LIBERADA` somente após a conferência final, ou registrar suspensão/cancelamento com seus limites.

### Schema e artefatos imutáveis

O schema TypeScript é a fonte de verdade. Usar `pnpm db:generate` e `pnpm db:check` no desenvolvimento. Conferir o SQL gerado; incluir schema, nova SQL, snapshot e journal na mesma revisão quando houver alteração estrutural.

Nunca editar ou renumerar uma migração já integrada/aplicada, combinar snapshots manualmente ou alterar o journal à mão. Uma correção exige nova migração coordenada. Se uma migração ainda não integrada ficou incompatível, atualizá-la a partir da `main` e regenerá-la pelo Drizzle.

### Revisão e homologação

Apresentar a Sergio a revisão exata, objetos e comandos previstos, efeitos nos dados, índices, isolamento por estabelecimento e plano de recuperação. A aprovação obrigatória é a dele; revisão de Danilo/Paulo é opcional.

Homologação e produção usam acessos e destinos distintos. Testar o schema no produto/versão compatível com o destino, além dos fluxos funcionais pertinentes. Para dados, validar contagens, somatórios e isolamento, usando precisão decimal para valores financeiros. MariaDB local não deve ser descrito como recuperação ou homologação completa de TiDB.

### Backup e aplicação em produção

Backup aplicável, proteção, retenção e recuperação demonstrada continuam exigidos pelo procedimento da entrega. Cópia cifrada local e checkpoint de código não equivalem, por si só, a backup durável restaurável de produção. O responsável de recuperação e as evidências de restauração devem ser identificados antes da janela.

Sergio ou delegado formal aplica somente o escopo autorizado, uma única vez, em janela exclusiva e após os requisitos técnicos. **Enquanto o histórico legado Drizzle estiver divergente, não executar `pnpm db:migrate` geral nem `db:push`.** Usar somente procedimento restrito previamente aprovado para a SQL versionada, com preflight físico/histórico e registro controlado depois da prova física. Não selecionar e aplicar migrações pendentes indiscriminadamente.

A migração 0135 Banco/XML permanece fora do escopo da 0137. Suspensão de reserva não equivale a aplicação, desfazimento ou reconciliação de histórico. Não reparar entradas anteriores sem procedimento e autorização próprios.

DDL pode ficar parcial. Parar na primeira falha ou incerteza, preservar evidências e não repetir comandos às cegas. Não executar `DROP`, `TRUNCATE`, `DELETE`, reordenação de SQL, recriação ou alteração de histórico para contornar uma falha sem plano específico aprovado.

Após a execução, validar estruturas, constraints, índices, tipos/defaults e histórico em conexão independente, além das contagens e do isolamento aplicáveis. Registrar na Issue #34 revisão, arquivo, horário, executor e resultados agregados, sem segredos ou dados hospitalares. Só então liberar a reserva.

### Ações destrutivas e exceções

Qualquer remoção de estrutura, `TRUNCATE`, exclusão em massa, redução de tipo, substituição de dados ou alteração destrutiva exige alvo, impacto, backup e autorização explícita de Sergio. Aprovar uma PR não substitui a autorização destrutiva.

Uma exceção a backup, homologação, recuperação ou outro requisito deve ser específica, com risco e limites apresentados e aceite inequívoco de Sergio. Exceções antigas não se transferem para outra migração. A adoção de Sergio como aprovador único **não cria uma dispensa permanente desses requisitos**.

## Segredos e dados hospitalares

Credenciais, chaves, conexões e valores de segredos permanecem em gerenciadores seguros ou arquivos locais ignorados pelo Git, nunca em chat, Issues, PRs, documentos, logs ou capturas. Não divulgar pacientes, carteirinhas, guias, protocolos, valores individuais ou conteúdo de XML/PDF. Usar metadados mínimos, contagens e agregados sanitizados.

Danilo e Paulo recebem, quando necessário, acesso individual limitado à homologação; não precisam de credenciais de produção. Inspeções de produção devem priorizar somente leitura, TLS e consultas restritas.

## Checklist de liberação

Antes de encerrar uma entrega, confirmar branch e PR sincronizadas, revisão exata aprovada por Sergio, testes e limitações registrados e ausência de push direto na main. Para banco, confirmar reserva única, SQL imutável, backup/recuperação e homologação aplicáveis, janela/executor autorizados e pós-validação independente. Para deploy, comprovar a versão efetivamente publicada.

A implantação de código ou tabela não autoriza, automaticamente, importações, vínculos, recebimentos, estornos ou horários de automação. Cada ativação deve ter escopo e autorização próprios.

## Registro da decisão

Em 26/10/2026, às 19:08 BRT, Sergio escolheu expressamente: **“B — Alterar a regra permanente, com Sergio como aprovador único”**. Esta versão substitui o requisito anterior de revisão obrigatória de outra pessoa, mantendo todos os demais controles acima. A atualização da configuração compartilhada não equivale ao merge de uma PR ou à aplicação da 0137.
