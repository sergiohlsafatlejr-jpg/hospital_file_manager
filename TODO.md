# TODO — Importador PDF de contratos e convênios

## Importador de até 30 PDFs com drag-and-drop

- [x] Na tela `/contratos-convenios`, disponibilizar uma ação explícita para importar documentos PDF em um contrato selecionado.
- [x] O seletor aceitará clique e arrastar/soltar, aceitará somente PDF e limitará o lote a 30 arquivos, informando arquivos excedentes ou inválidos antes do envio.
- [x] A tela exibirá nome, tamanho, estado individual, progresso e mensagens de sucesso/erro de cada arquivo; falha de um arquivo não ocultará os demais resultados.

## Leitura e persistência segura dos documentos

- [x] Cada PDF validado será guardado no storage privado com nome sanitizado e hash SHA-256, sem expor URL pública permanente.
- [x] O processamento persistirá no banco o contrato, estabelecimento, arquivo, tamanho, hash, número de páginas, status, texto extraído e pontos importantes estruturados.
- [x] O servidor rejeitará upload sem autenticação, sem contrato válido, fora da unidade autorizada ou fora do limite de tamanho/tipo definido para o lote.
- [x] O mesmo PDF não será duplicado para o mesmo contrato quando o hash já estiver registrado; a resposta informará o reaproveitamento.

## Pontos importantes na tela

- [x] O detalhe do contrato listará os documentos importados e seus estados.
- [x] Para cada processamento concluído, a tela exibirá pontos categorizados de vigência, faturamento/pagamento, documentos exigidos, obrigações, contatos e alertas, quando encontrados.
- [x] A tela sinalizará PDFs sem texto selecionável como "leitura pendente/OCR necessário" e não inventará pontos ausentes.
- [x] O conteúdo completo e os pontos só serão retornados após validação do acesso ao contrato e estabelecimento.

## Governança e verificação

- [x] A tabela nova permanecerá na única reserva ativa registrada na Issue #34; não executar `pnpm db:migrate` geral nem `pnpm db:push`.
- [x] Executar `pnpm db:generate`, conferir a SQL, executar `pnpm db:check`, testes focados, `pnpm check`, build e `git diff --check`.
- [ ] Sincronizar a branch com `origin/main`, abrir PR e aguardar aprovação de Sergio; não fazer push direto em `main` nem publicar/importar o ZIP em produção.
