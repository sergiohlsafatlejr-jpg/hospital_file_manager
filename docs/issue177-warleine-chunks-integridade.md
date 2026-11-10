# Issue #177 — integridade e upload Warleine em partes

**Base exata:** `e848db3e1996e625dbcf4b1ed96b54483f7b5980`. **Branch:** `fix/issue177-warleine-chunks-integridade`. Preparação autorizada por Sergio em 10/11/2026. Merge e publicação dependem do aceite da revisão apresentada. A versão WebDev permaneceu no checkpoint `cdb56b66`; não foi feita operação de dados, ERP, SMTP, Inter, configuração de segredos ou migração nesta corretiva.

## Entrega

O importador mantém CSV, ZIP e XLSX e preserva os relatórios e entregas anteriores. CSV agora é interpretado por registro lógico, com campos multilinha entre aspas, UTF-8/BOM, escapes e exatamente 48 campos. Registros incompletos, UTF-8 inválido e aspas abertas não chegam à validação/publicação. ZIP usa leitor nativo Node compatível com Linux, sem `tar`: valida diretório/membros, CRC, tamanhos e consumo integral de DEFLATE. Aceita um CSV com diretórios pais vazios e métodos STORED/DEFLATE; formatos disfarçados, traversal, links, membros extras e arquivos corrompidos são rejeitados.

O novo modal envia o arquivo em partes binárias de **4 MiB**, até **300 MiB (314.572.800 bytes)**. Cada parte possui verificação de hash e cifra AES-GCM; o manifesto é igualmente cifrado. Nenhuma requisição transporta o arquivo inteiro, contornando o teto de 32 MiB do transporte HTTP/1. O teste de 300 MiB utiliza 75 partes virtuais, não um upload real desse tamanho.

Storage cloud durável é obrigatório no novo protocolo. Não há fallback para disco ou memória como fonte persistente. O worker reconstrói uma cópia temporária privada apenas para processar a fonte durável, confere integridade e remove a cópia ao terminar. O multipart legado é limitado a 4 MiB e continua exigindo autorização anterior ao recebimento, confirmação explícita e storage. No CLI, fonte local só pode ser aceita com opt-in explícito em desenvolvimento/teste; produção a recusa incondicionalmente.

## Reserva, autorização e retomada

A reserva usa somente colunas já existentes da tabela de lotes, com origem `upload-controle`. Não há nova tabela, coluna ou índice. Esses controles são excluídos da fila de processamento e do histórico operacional.

Sessão/token e idempotência ficam vinculados ao usuário e ao hospital. A finalização reautentica/reautoriza, verifica prazo e faz CAS do ponteiro/estado. A gravação do lote e do recibo ocorre na mesma transação. Lote de mesmo hash/hospital já existente conserva a fonte e não recebe novo dispatch. A resposta incerta é reconciliada pelo mesmo controle; o cleanup condicionado ao ponteiro anterior não converte recibo comprometido em erro nem duplica lote. Controles e arquivos de outro usuário/hospital são negados.

O navegador guarda apenas versão, UUID de tentativa e identificador de sessão, com namespace usuário/hospital. Não guarda nome de arquivo, conteúdo, paciente, guia, valores ou hashes. A chave é persistida antes da rede. Após interrupção, o usuário seleciona o mesmo arquivo; partes reconhecidas são também verificadas por hash no servidor. Resposta ambígua não gera automaticamente nova tentativa. Upload em erro/expirado exige verificação; não há liberação automática ou reprocessamento de um lote rejeitado nesta entrega. A janela de recebimento é de 24 horas; cada requisição/finalização tem orçamento de 150 segundos e estado de erro reconciliável após expiração.

## Worker, publicação e interface

O acionamento imediato é obrigatoriamente por **lote + hospital**. O consumidor global preexistente continua reservado à rotina de background, sem ser usado como efeito de um comando imediato. A reserva/lease continuam sendo verificadas no banco. O importador recebe o ID esperado, rejeita divergência de arquivo/lote e devolve estado `validado` ou `publicado`. A falha inicial faz rollback; erros persistidos/logados nesse caminho são códigos sanitizados.

O CLI distingue publicação comprovada, enfileirado, ocupado, não publicado, falha e estado indisponível. Um flag ou `phase=completed` não comprova publicação. O worker confere o estado durável do mesmo lote. O modal só anuncia sucesso após leitura de `jobStatus=publicado` da própria sessão; erro, validação, desaparecimento da lista ou outro lote publicado não geram sucesso. Respostas antigas após troca de hospital/usuário são descartadas. Os controles não aparecem como lotes de relatório, e mensagens de erro antigas do histórico não são exibidas brutas.

## Orçamentos

| Controle | Limite |
|---|---:|
| Arquivo CSV/ZIP/XLSX no transporte | 300 MiB |
| Parte binária | 4 MiB |
| Manifesto | 64 KiB |
| Recebimento da sessão | 24 h |
| Requisição/finalização | 150 s |
| CSV/ZIP efetivamente lido/expandido | 1 GiB |
| Registro CSV lógico bruto | 1 MiB |
| Campo CSV bruto | 256 KiB |
| Registros CSV, incluindo cabeçalho | 5.000.001 |
| Membros ZIP, incluindo diretórios vazios | 64 |
| Job do worker | 15 min |

A iteração CSV/ZIP é cancelável e fecha streams/descritores na conclusão, rejeição, abort ou interrupção do consumidor. Os tetos podem ser estreitados, não ampliados. O formato ZIP seguro é deliberadamente restrito. O caminho XLSX/ExcelJS preserva seus limites e comportamento anteriores; não foi afirmada proteção nova completa contra shared strings/estilos massivos.

## Validação efetiva

- **2.369 testes Vitest aprovados, 95 arquivos**, incluindo regressões anteriores e novas suites de parser, chunks, SQL fake, worker, CLI, cliente, modal e histórico.
- **165 testes Node aprovados**, preservando os executores existentes.
- **8 provas externas aprovadas com as mesmas fixtures originais**: multiline com um registro e decimal íntegro, ZIP DEFLATE genuíno, CSV simples, rejeição de TAR disfarçado/múltiplos membros/traversal/expansão excessiva/cabeçalho incompleto.
- Build e `pnpm db:check` aprovados. O `db:check` usou URL sintética e não aplicou SQL.
- TypeScript global continua falhando com **157 diagnósticos preexistentes**, exatamente como a base; **zero novos diagnósticos**. Não declarar `tsc` global aprovado.
- `git diff --check` aprovado e **zero delta em `drizzle/` e `scripts/migrations/`**. Startup, chaves internas, conectores hospitalares e router Inter/Financeiro permanecem idênticos à base.
- Auditoria independente focal, somente leitura, sem achados críticos/altos concretos na publicação CAS, autorização, corpo/ready, retomada e falso sucesso. Não substitui aprovação humana.
- Prévia de frontend com hospital fictício, servida por fixture HTTP sem backend/banco; POST e PUT recusados com 403. Não é uma homologação funcional de importação.

As primeiras execuções da bateria tinham divergências de teste (identificador de ambiente fictício e estilo de aspas na expectativa estática). O validador foi corrigido e a suíte Vitest completa foi reexecutada. Os logs anteriores de falha foram preservados e não são apresentados como sucesso.

## Precondições e limites para ativação

O novo protocolo exige storage cloud configurado e, em produção, **`WARLEINE_FILE_ENCRYPTION_KEY` dedicada com pelo menos 32 caracteres**, sem depender do JWT para aceitar upload. Recomenda-se material aleatório independente (32 bytes, por exemplo 64 hex). A chave não foi criada, rotacionada ou consultada neste trabalho; deve ser conferida pelo canal seguro antes da ativação. Chaves anteriores e envelopes legados devem ser preservados conforme a política do cofre; nunca sobrescrever chave existente sem confirmar fontes cifradas.

Não houve upload de arquivo hospitalar, uso de storage real, ensaio físico de concorrência TiDB, teste entre réplicas Cloud Run, benchmark de RSS ou prova de capacidade máxima 300 MiB/1 GiB. As transações foram simuladas; os 75 chunks virtuais comprovam divisão do transporte, não performance end-to-end. Os conjuntos de hash/batches e caches XLSX preexistentes exigem homologação de capacidade antes de carga máxima. Objetos cifrados órfãos de CAS/erros podem permanecer no storage; esta PR não executa limpeza nem define retenção destrutiva. Uma nova política de limpeza depende de escopo e aceite próprios.

## Rede do Hospital Urológico — frente separada

A PR de diagnóstico remoto #176 não está incluída. Ela é recomendável como diagnóstico administrativo sanitizado após aceite e revalidação da revisão integrada, mas não resolve conectividade nem TLS. A saída observada no WebDev não comprova IP de produção ou estabilidade. A sonda separada alcançou TCP/TLS, porém não aprovou confiança do certificado, sem senha ou SQL. Para allowlist estável, o administrador deve comprovar egress de produção com NAT/IP reservado ou canal privado/VPN e identificar CA/cadeia/hostname confiáveis. Nenhuma regra `pg_hba.conf`, firewall ou validação TLS foi alterada nesta corretiva.
