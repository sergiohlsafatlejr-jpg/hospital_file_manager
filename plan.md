# Plano — Importador de PDFs de contratos e convênios

## Objetivo

Estender `/contratos-convenios` para receber documentos PDF associados a um contrato já cadastrado, aceitar arrastar e soltar até 30 PDFs por lote, extrair texto no servidor, armazenar o original em storage privado e persistir no banco o resultado da leitura e os pontos importantes para consulta na tela.

## Decisões de implementação

- Reutilizar o visual existente do portal: cards claros, azul institucional, estados em badges e dialogs compactos; a interface prioriza leitura rápida e não adiciona ilustrações decorativas.
- Criar uma tabela própria `contratos_convenios_documentos`, sem sobrecarregar `contratos_convenios` ou `contratos_tabelas_fechadas` com texto e metadados de arquivos.
- Associar cada documento a `contratoId` e `estabelecimentoId`; validar no servidor que o contrato pertence à unidade e que o usuário pode gerenciá-la.
- Armazenar o PDF original somente no storage privado, com nome sanitizado e hash SHA-256. O banco guarda metadados, texto extraído, páginas, status e JSON de pontos importantes.
- Usar `pdf-parse` para PDFs textuais. A interface informa quando o PDF é escaneado ou não possui texto selecionável; OCR fica fora deste primeiro escopo.
- Extrair pontos de forma determinística e auditável, procurando partes, CNPJ, vigência, prazos, pagamento, faturamento, documentos exigidos, notificações, rescisão, reajuste, confidencialidade e contatos. O texto completo fica disponível apenas para usuários autorizados ao contrato.
- O upload será um endpoint multipart dedicado, com limite de 30 arquivos e validação de PDF. O endpoint processará cada arquivo isoladamente, mantendo sucesso parcial explícito e sem sobrescrever documento já existente com o mesmo hash.
- Não inserir o contrato de exemplo no banco de produção nesta entrega. O ZIP fornecido será usado apenas como fixture local temporária para conferir a extração.

## Estrutura prevista

- `drizzle/schema.ts`: tabela e tipos de documentos PDF.
- `drizzle/0141_*.sql` e snapshot/journal: artefatos gerados pelo Drizzle, preservados juntos na PR; a SQL não será aplicada em produção nesta etapa.
- `server/contratosConveniosPdfService.ts`: hash, parsing, normalização e extração de pontos.
- `server/routers/contratosConveniosRouter.ts`: listagem/detalhe dos documentos e autorizações de contrato.
- `server/uploadMultipart.ts`: endpoint multipart autenticado para PDFs de contratos.
- `client/src/pages/ContratosConvenios.tsx`: dialog de importação drag-and-drop, progresso/resultados e visualização de pontos importantes.
- `server/contratosConveniosPdfService.test.ts`: testes unitários com texto sintético e regras do exemplo, sem versionar PDFs empresariais.

## Entrega e limites

A branch deve conter código, testes, schema e SQL gerada, sem `db:migrate`, `db:push`, carga de dados ou publicação. A PR deverá registrar a reserva da migração na Issue #34, comandos executados, limitações (PDF escaneado/OCR) e ausência de preview conectado a produção.
