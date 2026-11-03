# Leitura limitada de PDF contratual por arquivo

## Integração

`server/contratosConveniosPdfService.ts` exporta:

```ts
export async function lerContratoPdfArquivo(
  filePath: string
): Promise<ContratoConvenioPdfLeitura>
```

O finalizador de chunks existente já detecta esse export em `processContratosUploadPdfFile`. Com ele presente, usa o caminho do arquivo temporário montado em streaming inclusive para PDFs acima de 4 MiB; não usa `fs.readFile` nem `pdf-parse` nessa rota. Não foram alterados chunks, router, client, preços, esquema, ambiente ou Git.

A extração usa `pdfinfo` para confirmar a contagem de páginas e `pdftotext` para extrair todas as páginas admitidas. Texto vai para stdout limitado, não para outro arquivo temporário. Não há rasterização, OCR, análise por LLM, download ou conexão de rede. As funções existentes `normalizarTextoPdf` e `extrairPontosImportantes` são reutilizadas. A deduplicação de partes e contatos foi tornada incremental, e a busca de contatos é limitada ao entorno de `@` para evitar backtracking quadrático em tokens muito longos.

## Limites fixos

| Recurso | Limite/comportamento |
| --- | --- |
| Arquivo de entrada | Arquivo regular, não vazio, até **150 MiB** por `fstat` |
| Caminho | Absoluto, sem NUL; symlink final recusado; abertura `O_NOFOLLOW/O_NONBLOCK` |
| Cabeçalho | Apenas **1 KiB** lido para localizar `%PDF-` |
| Identidade da entrada | Descritor herdado como fd 3, usado por ambos os subprocessos via `/proc/self/fd/3`; alteração de tamanho/mtime/ctime invalida o resultado |
| Páginas | **512**; acima disso o PDF inteiro é recusado, sem processar prefixo |
| Texto bruto | **2 MiB** de UTF-8; excesso encerra o subprocesso e invalida toda a leitura |
| Quebras de linha/página | Até **50.000** linhas contadas antes da normalização, para limitar objetos JS |
| Metadados `pdfinfo` | **64 KiB** em stdout |
| Diagnóstico | **16 KiB** em stderr; qualquer aviso/erro não vazio impede conclusão |
| Tempo | Até **10 s** para `pdfinfo`, **60 s** para `pdftotext`, e deadline cumulativo de **75 s** no leitor |
| Memória do subprocesso | `prlimit --as=134217728`: **128 MiB de espaço virtual** por filho |
| CPU do subprocesso | `prlimit --cpu`, conforme o timeout da etapa; core dumps desativados |
| Concorrência | Uma leitura por processo/instância; outra chamada é recusada imediatamente, sem fila que retenha PDFs adicionais |

Os subprocessos não usam shell nem ficam detached. Recebem somente locale `C`, sem variáveis de segredos do projeto. Em timeout ou excesso de saída são encerrados com `SIGKILL`. O slot local só é liberado após o fechamento do subprocesso/pipes e do descritor. Não há fallback sem `prlimit`/Poppler quando os binários faltam. O caminho original nunca é interpolado em comando ou reaberto pelos subprocessos.

## Resultado e falhas

O retorno mantém o tipo existente: `paginas`, `textoExtraido`, `pontosImportantes` e `status` igual a `concluido` ou `ocr_necessario`. `concluido` exige execução íntegra dos dois subprocessos, sem avisos, limites excedidos ou entrada alterada, e pelo menos 80 caracteres normalizados. Texto curto/vazio de uma extração íntegra resulta em `ocr_necessario`; isso **não executa OCR**.

`concluido` não significa revisão jurídica nem garantia de que todas as cláusulas existem em texto: páginas escaneadas em um PDF misto podem não produzir texto. Pontos importantes são heurísticos, não uma análise completa do contrato. A mudança preserva essa semântica do serviço anterior, sem promover texto truncado a conclusão.

Falhas lançam `ContratoPdfArquivoError` com `code` estável, em vez de devolver um resultado parcial ou classificar automaticamente falha de recursos como OCR:

- `PDF_ARQUIVO_INVALIDO`, `PDF_LIMITE_BYTES`, `PDF_LIMITE_PAGINAS`;
- `PDF_LIMITE_TEXTO`, `PDF_LIMITE_SAIDA`, `PDF_TEMPO_ESGOTADO`;
- `PDF_PROCESSADOR_INDISPONIVEL`, `PDF_EXTRACAO_INCOMPLETA`, `PDF_PROCESSADOR_OCUPADO`.

O finalizador existente captura a rejeição e mantém a transição de erro fail-closed por claim/CAS distribuído. Não deve publicar texto/pontos como `concluido` ao capturar essas falhas. PDF criptografado é recusado: não se tenta senha, remoção de restrição de cópia ou bypass de proteção. Avisos benignos também podem ser recusados pela política conservadora.

## Produção e orçamento de recursos

O Dockerfile de raiz é necessário porque o deploy padrão não garante Poppler. Usa `node:22-slim`, instala `poppler-utils` e `util-linux` (fornece `prlimit`), mantém `node_modules`, faz o build completo com Corepack/PNPM incluindo frontend e schemas TISS e inicia `node dist/index.js` com `NODE_ENV=production`. Não instala Chromium nem fontes adicionais; a disponibilidade de browser das funções RPA preexistentes continua fora deste trabalho. Não foi feito build de imagem, deploy, alteração de secrets ou commit/checkpoint.

A plataforma continua limitada a **512 MiB / 1 vCPU / 180 s por request**. `/tmp` é em memória: um PDF de 150 MiB já consome 150 MiB além do Node, dos buffers de chunks/storage, do subprocesso e dos textos/objetos JS. `RLIMIT_AS` limita espaço virtual do filho, não RSS total da aplicação, e não contabiliza sozinho todo `/tmp`. O sistema pode recusar PDFs complexos muito antes de 150 MiB; o limite de upload não é promessa de processabilidade de todo PDF desse tamanho. Isso não é sandbox de segurança completo de Poppler.

**O slot deste leitor começa quando o finalizador chama o processador, depois de montar/persistir o arquivo.** Ele serializa a extração, não todo o download/montagem/storage do finalizador. O claim distribuído existente impede publicação concorrente do mesmo documento, mas não impede dois documentos distintos de serem montados em `/tmp` simultaneamente. Para garantir o orçamento em ponta a ponta, o integrador precisa limitar também a admissão de finalizações distintas **antes** da montagem; esses arquivos estão fora do escopo deste patch. Nenhuma fila de entrada de 150 MiB foi adicionada.

Os 75 s são o orçamento do leitor, não do request completo. Montagem, upload em storage e atualizações de banco precisam caber no restante do deadline do finalizador/180 s. Linux com `/proc` e os três binários é requisito; sem eles a extração falha controladamente. O método legado `lerContratoPdf(Buffer)` não foi reimplementado e continua tendo as limitações anteriores em callers fora da rota file-backed.

## Validação isolada

```sh
./node_modules/.bin/vitest run server/contratosPdfArquivo.test.ts --maxWorkers=1 --minWorkers=1
```

Os testes usam executores/filhos sintéticos para validação de arquivo, timeout, códigos/sinais/erro de spawn, saída excedida, avisos, UTF-8 truncado, contagem de páginas, limite de texto/linhas, exclusão mútua e troca/alteração do inode. Casos acima de 4 MiB e na fronteira de 150 MiB usam arquivos esparsos sintéticos; **não são teste de carga ou de memória real de 150 MiB**.

Um teste executa os binários locais de verdade sobre um PDF mínimo sintético gerado com offsets/xref válidos, menor que 2 KiB, sem contrato real, upload, storage, OCR ou LLM. O teto exato de texto de 2 MiB também é testado com executor sintético. Não foi rodada a suíte global, build global ou `tsc` global.
