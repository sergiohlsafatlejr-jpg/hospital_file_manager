# Criação de lotes — elegibilidade e seleção por fonte

## Causa confirmada

A listagem agrupada e a criação transacional do lote exigem um recurso efetivamente criado e sem vínculo de lote. A lista detalhada permitia também a simples classificação `recursar` ou `auto_recursar`, mesmo sem o recurso criado. Na conferência autorizada, somente leitura, do COTEFI/SulAmérica, a lista detalhada tinha oito itens, mas somente sete estavam elegíveis. Todos pertenciam ao mesmo estabelecimento e convênio; o oitavo estava classificado, mas sem recurso criado. A mensagem anterior atribuía indistintamente a rejeição ao escopo e não explicava esse estado.

Classificar para recursar não equivale a criar o recurso. A correção não cria recursos, altera classificações ou descarta silenciosamente itens selecionados dentro de uma tentativa de lote.

## Escopo da correção

As duas consultas usam critérios compatíveis com a reserva transacional: estabelecimento e convênio corretos, status efetivamente pronto, glosa positiva e ausência de vínculo de lote. A conciliação também respeita a reserva própria do lote. Ausência de estabelecimento não permite consulta ampla.

A seleção identifica cada item pela combinação fonte + ID, evitando colisão entre demonstrativo e conciliação. O botão de criar todos utiliza o conjunto do próprio grupo, sem depender da lista de outro convênio ou de uma consulta ainda não carregada. Troca de unidade, convênio ou filtro invalida a seleção; fonte desconhecida ou contexto alterado bloqueia a tentativa.

A validação e a transação do servidor continuam protegendo o lote inteiro: mudanças concorrentes ou item indisponível causam rejeição e rollback. Não reduzir a seleção automaticamente para criar um lote parcial e não marcar envio ou recebimento no ato da criação.

## Uso

Atualizar a lista depois da publicação da correção. Os itens efetivamente prontos podem ser selecionados para criação explícita do lote. Um item somente classificado deve ter seu recurso revisado e criado pelo fluxo apropriado antes de aparecer como pronto. Nenhum item é excluído pela correção.

## Implantação e limites

Entrega exclusivamente de código em branch/PR. Sem migração, carga, importação XML, criação real de lote, alteração de classificação, vínculo financeiro, envio, recebimento, estorno ou agenda. A reserva 0139 permanece separada; não aplicar migrador geral ou db:push.

Os XMLs de honorários e itens hospitalares, a sincronização diária de atendimentos e os retornos externos de recurso são entregas distintas; esta correção não as ativa.
