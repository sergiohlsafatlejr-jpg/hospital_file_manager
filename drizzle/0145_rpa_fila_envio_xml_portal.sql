-- Migração 0145: Evolução do Cofre de Credenciais Multi-Hospital e Fila de Envio XML RPA

ALTER TABLE `credenciais_portais`
  ADD COLUMN `codigoPrestadorOperadora` varchar(80) DEFAULT NULL,
  ADD COLUMN `registroAns` varchar(20) DEFAULT NULL,
  ADD COLUMN `parametrosExtras` json DEFAULT NULL,
  ADD COLUMN `statusCredencial` varchar(40) DEFAULT 'ATIVA';

CREATE TABLE IF NOT EXISTS `fila_envio_xml_portal` (
  `id` int NOT NULL AUTO_INCREMENT,
  `estabelecimento_id` int NOT NULL,
  `convenio_id` int NOT NULL,
  `fabrica_conta_id` int DEFAULT NULL,
  `arquivo_id` int DEFAULT NULL,
  `usuario_upload_id` int NOT NULL,
  `usuario_upload_nome` varchar(255) DEFAULT NULL,
  `nome_arquivo` varchar(255) NOT NULL,
  `numero_lote` varchar(80) NOT NULL,
  `versao_tiss` varchar(20) DEFAULT NULL,
  `registro_ans` varchar(20) DEFAULT NULL,
  `codigo_prestador_xml` varchar(80) DEFAULT NULL,
  `cnpj_prestador_xml` varchar(20) DEFAULT NULL,
  `qtd_guias` int NOT NULL DEFAULT 0,
  `qtd_itens` int NOT NULL DEFAULT 0,
  `valor_total` decimal(14,2) NOT NULL DEFAULT '0.00',
  `hash_xml` varchar(64) NOT NULL,
  `caminho_arquivo_xml` varchar(512) NOT NULL,
  `resumo_guias_json` json DEFAULT NULL,
  `status_esteira` varchar(40) NOT NULL DEFAULT 'IMPORTADO',
  `modo_execucao` varchar(20) NOT NULL DEFAULT 'producao',
  `protocolo_retorno` varchar(120) DEFAULT NULL,
  `id_recebimento_portal` varchar(120) DEFAULT NULL,
  `mensagem_portal` text,
  `comprovante_url` varchar(512) DEFAULT NULL,
  `screenshot_base64` longtext,
  `tentativas` int NOT NULL DEFAULT 0,
  `enviado_em` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_fila_xml_status_estab` (`status_esteira`, `estabelecimento_id`, `convenio_id`),
  KEY `idx_fila_xml_hash_estab` (`estabelecimento_id`, `convenio_id`, `hash_xml`),
  KEY `idx_fila_xml_fabrica_conta` (`fabrica_conta_id`)
);
