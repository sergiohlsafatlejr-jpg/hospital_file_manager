## Resumo

Descreva o problema, a solução e o resultado esperado.

## Responsáveis

- Autor:
- Revisor:
- Issue ou tarefa Manus:

## Tipo de alteração

- [ ] Funcionalidade
- [ ] Correção
- [ ] Refatoração
- [ ] Documentação
- [ ] Banco de dados

## Validação geral

- [ ] A branch foi atualizada com `main`.
- [ ] `pnpm check` foi executado e esta mudança não adicionou novos erros à linha de base conhecida.
- [ ] `pnpm test` foi executado e esta mudança não adicionou novas falhas à linha de base conhecida.
- [ ] `pnpm build` passou.
- [ ] Não foram incluídos segredos, dados hospitalares ou arquivos `.env`.
- [ ] A validação funcional foi descrita abaixo.

## Banco de dados

Preencha esta seção quando houver alteração em `drizzle/`.

- [ ] A reserva `MIGRAÇÃO RESERVADA` foi registrada na tarefa de coordenação.
- [ ] O schema, SQL novo, snapshot e journal estão no mesmo Pull Request.
- [ ] Nenhuma migração já integrada foi editada.
- [ ] `pnpm db:generate` e `pnpm db:check` passaram.
- [ ] O SQL gerado foi lido e revisado por outra pessoa.
- [ ] O impacto em dados, índices e isolamento por estabelecimento foi avaliado.
- [ ] A homologação foi aplicada e validada.
- [ ] A validação pós-migração está descrita abaixo.
- [ ] Não há operação destrutiva; ou a aprovação explícita de Sergio está vinculada abaixo.

## Evidências e plano de validação

Descreva testes, telas conferidas, consultas de validação e resultados esperados.

## Implantação e reversão

Descreva a ordem de implantação, eventuais cuidados e como interromper ou corrigir a entrega com segurança.
