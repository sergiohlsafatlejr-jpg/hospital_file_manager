# Correção das glosas Unimed — Hospital Urológico

## Diagnóstico

O arquivo Unimed exibido na tela Demonstrativo possuía 919 itens. A planilha compacta informa somente o valor final do item e a situação `PAGO` ou `GLOSADO`. O parser genérico não preservava a situação `GLOSADO`; por isso, quatro itens eram gravados como pagos e o cartão de glosa permanecia zerado.

## Correção e recuperação

O parser passou a tratar o valor único como pagamento quando a situação é `PAGO` e como glosa quando a situação é `GLOSADO`. O cálculo unitário foi mantido exclusivamente para o formato IPASGO, evitando multiplicação indevida na Unimed.

O arquivo afetado foi reprocessado de forma isolada no Hospital Urológico. A consulta usada pela própria tela confirmou 50 contas, 919 itens, quatro itens glosados e R$ 665,80 de glosa. O valor pago permaneceu R$ 56.540,88 e o valor informado totalizou R$ 57.206,68.
