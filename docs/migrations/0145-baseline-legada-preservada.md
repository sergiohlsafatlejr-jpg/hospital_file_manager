# 0145 — baseline legada preservada, sem reparo do histórico

## Motivo da correção

A PR #159, revisão `5fa161c513a11bff7a5ea9df4f222f874ccf2a58`, foi mesclada como `08be6c1`. O novo preflight parou com **zero DDL**: o validador ainda exigia SHA-256 para todos os registros de um histórico que já era divergente. Não é necessário alterar o banco para corrigir essa expectativa do procedimento.

O diagnóstico do operador em conexões TLS verificadas confirmou 105 registros no ledger, com IDs únicos/positivos, timestamps válidos e não posteriores à 0144, exatamente um marker 0144 e nenhum marker/conflito 0145. Três identificadores históricos não atendem ao formato SHA-256. Nenhum registro foi atualizado, excluído ou reparado.

A correção foi preparada em `fix/0145-baseline-ledger-legado`, sobre a revisão isolada `5fa161c`, sem incluir `9c5c839`. Altera somente o wrapper, seus testes e este documento. **SQL, schema, journal, snapshots, executor restrito original e verificador completo permanecem imutáveis.**

## Aceitação estrita da baseline conhecida

A chamada operacional do wrapper usa uma constante privada, congelada e versionada:

| Metadado agregado | Valor exigido |
|---|---|
| Registros históricos | 105 |
| Identificadores fora do formato SHA-256 | 3 |
| SHA-256 integral da baseline | `ddba1fe00d43958df2e585b43887c52b495736cce7a508279518b9dcd9bbb452` |

Quando há identificadores legados não-SHA, as três condições devem coincidir simultaneamente. A assinatura cobre **todas as linhas e campos**, com ordenação numérica por ID e ordenação recursiva das chaves. O cálculo usa uma cópia em memória; não normaliza nem escreve registros no banco. Mudar hash, ID, timestamp ou campo adicional, inserir/apagar uma linha ou adicionar uma quarta exceção bloqueia a operação. Não basta preservar as contagens.

Continuam obrigatórios IDs positivos e únicos, timestamps inteiros seguros e válidos, hashes não vazios, marker 0144 exato e ausência de marker/conflito 0145. Se todos os hashes já forem SHA válidos, permanece o caminho normal anterior, com suas invariantes históricas. A política específica não pode ser recalculada automaticamente nem substituída por `options`, `gates`, manifesto ou variável de ambiente.

O helper puro `assert0145HistoricalLedger` recebe uma política explícita apenas para testes. O wrapper operacional chama-o exclusivamente com a constante privada acima. Chamar o helper diretamente não gera comprovante de preflight nem autoriza `applyVerified0145`.

## Controles de aplicação preservados

Permanecem catálogo completo, layout físico do ledger, destino/TLS, sessões independentes, atestação contra Git, revisão/digests aprovados, manifesto, reserva exclusiva, exceção específica e janela limitada. A igualdade integral do histórico é revalidada antes da primeira DDL e entre etapas.

O marker 0145 continua tardio: somente após as duas DDL verificadas, em transação, preservando o histórico bloqueado. A leitura independente pós-commit exige todas as linhas originais — inclusive os três identificadores legados — e exatamente uma linha adicional com o par hash/timestamp da 0145. Divergência ou incerteza interrompe, sem retry automático ou reparo.

Não há autorização para `db:migrate` geral, `db:push`, reaplicar 0143, alterar o ledger, configurar chaves, enviar arquivos/boletos, importar/reprocessar dados ou modificar legados/perfis.

## Validação

**165/165 testes Node aprovados**, sem falhas ou skips: 151 do wrapper e 14 do verificador imutável. A suíte anterior tinha 101 casos; foram acrescentados 64. Os testes são sintéticos e cobrem assinatura positiva exata, mutações, inserção/remoção, NULL, invariantes inválidas, tentativa de injeção de política, alterações entre conexões/etapas e preservação pós-commit. Fixtures com `approvedBy: 'Sergio'` não são evidência de aprovação humana.

```sh
node --test tests/scripts/0145-rpa-execucao-verificada.test.mjs tests/scripts/0145-rpa-verificacao-completa.test.mjs
```

Além dos mocks, o operador conferiu em **duas conexões TLS independentes somente leitura** a baseline física/histórica contra as guardas puras novas: ambas passaram, com 105 registros, assinatura integral coincidente e zero DDL. Essa sondagem não chamou `applyVerified0145`, não produziu aprovação humana e não substitui o preflight fresco da revisão final aprovada.

Build, `db:check`, sintaxe Node e `git diff --check` foram aprovados. O TypeScript continua falhando com 187 diagnósticos da base; não houve alteração nos arquivos do aplicativo ou do schema. Não se declara `tsc` aprovado. A aplicação permanece pendente: modificar o wrapper muda seu digest, exigindo aceite da revisão exata antes de qualquer DDL. A autorização e exceção de produção existentes não serão usadas para contornar a nova revisão.

## Limites de publicação e sequência

O servidor corrente permanece no checkpoint `9953b6b2`. Primeiro deve ser concluída a release isolada aprovada, a aplicação única 0145, a verificação independente e a publicação. Somente depois será validada/publicada a entrega operacional `9c5c839`, conforme a sequência autorizada por Sergio.

Indicadores de configuração do sandbox não comprovam segredos ou binários em produção. Nenhuma chave foi modificada; readiness operacional de Banco Inter, RPA e processamento interno deve ser distinguida da publicação do código. Checkpoint não comprova deploy.
