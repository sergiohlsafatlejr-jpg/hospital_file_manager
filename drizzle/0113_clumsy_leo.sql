DELETE pe
FROM `permissoesEstabelecimento` pe
INNER JOIN (
  SELECT id
  FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY userId, estabelecimentoId
        ORDER BY updatedAt DESC, id DESC
      ) AS duplicateRank
    FROM `permissoesEstabelecimento`
  ) ranked
  WHERE ranked.duplicateRank > 1
) duplicates ON duplicates.id = pe.id;--> statement-breakpoint
ALTER TABLE `permissoesEstabelecimento` ADD CONSTRAINT `uq_permissoes_user_estabelecimento` UNIQUE(`userId`,`estabelecimentoId`);
