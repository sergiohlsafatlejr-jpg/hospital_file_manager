# XML médico automático na Conta Convênio

## Resultado para quem opera a tela

1. Envie o XML normalmente na tela **Upload** com a direção **Enviado**.
2. O Portal identifica um XML exclusivamente de honorários médicos e o processa em segundo plano.
3. Quando cada guia do XML tiver **uma única** conta hospitalar correspondente no mesmo estabelecimento e convênio, os procedimentos passam a aparecer no quadro **Itens médicos informativos**, dentro da aba **Itens** da Conta Convênio.
4. O quadro exibe somente código, descrição, data de execução e profissional/conselho quando constarem do XML médico. Não exibe valor, recebimento, saldo ou qualquer efeito financeiro.
5. A aba **Contexto médico informativo** permanece para comparar os itens importados com gabaritos e registrar revisão humana; não é mais necessário escolher manualmente o XML para o fluxo normal de upload.

## Regras de segurança da associação

- A correspondência exige guia, estabelecimento e convênio compatíveis com uma conta hospitalar canônica.
- Uma guia que puder apontar para mais de uma conta é ambígua e não é associada.
- Se **qualquer** guia de um XML não for encontrada ou ficar ambígua, **nenhuma** guia daquele arquivo é associada. O arquivo fica bloqueado para revisão, sem associação parcial.
- XML misto (honorários junto com outro tipo de guia), XML malformado ou acima do limite conservador também é bloqueado antes de qualquer escrita financeira.
- Reenviar o mesmo XML não duplica os procedimentos informativos já associados.

## Limites preservados

Este fluxo não cria itens financeiros, não altera Conta Convênio, não gera faturamento, não concilia demonstrativos e não lança pagamentos. XMLs já enviados antes da publicação não são reprocessados automaticamente; uma eventual reclassificação histórica exigirá uma ação própria e explícita.
