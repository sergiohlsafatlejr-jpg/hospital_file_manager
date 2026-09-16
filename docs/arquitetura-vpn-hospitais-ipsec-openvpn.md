# Arquitetura VPN para integração dos hospitais

**Autor:** Manus AI  
**Data:** 16 de setembro de 2026

## Objetivo

Conectar o Integrador de Dados do portal Safatle aos bancos PostgreSQL internos dos hospitais sem publicar o banco na internet. O gateway com IP fixo permanece na nuvem e cada hospital estabelece um túnel site-to-site usando o protocolo aceito pelo próprio firewall.

> O portal não acessa diretamente a rede hospitalar. Ele envia uma solicitação autenticada ao gateway; somente o serviço de integração do gateway atravessa a VPN e consulta o banco com usuário de leitura.

## Arquitetura

```text
Portal Safatle
      |
      | HTTPS + autenticação de serviço
      v
Gateway Safatle com IP fixo
      |
      | IPsec/IKEv2 ou OpenVPN
      v
Firewall ou servidor VPN do hospital
      |
      | rota restrita ao IP/porta do banco
      v
PostgreSQL interno — usuário somente leitura
```

IPsec permite conectar sub-redes por meio de dois gateways e selecionar exatamente quais redes ou endereços devem atravessar o túnel. A documentação do strongSwan descreve a configuração site-to-site com autenticação por certificados e seletores de tráfego para as redes locais e remotas.[1] O OpenVPN também suporta roteamento site-to-site, mas exige que as rotas das redes privadas sejam configuradas nos gateways participantes.[2] [3]

## Opções

| Abordagem | Trade-offs | Custo | Complexidade de configuração |
|---|---|---|---|
| **IPsec/IKEv2 no firewall do hospital** | Integração nativa em muitos firewalls corporativos; alto desempenho; parâmetros criptográficos, NAT e seletores precisam coincidir nos dois lados | Sem licença obrigatória usando strongSwan no gateway; permanece o custo operacional do servidor já existente | Média a alta; depende do fabricante e do TI do hospital |
| **OpenVPN site-to-site** | Mais uniforme entre hospitais e mais simples de diagnosticar; normalmente exige instalar um cliente ou configurar o firewall compatível | Sem licença obrigatória usando OpenVPN Community; Access Server comercial é opcional | Média; certificados, rotas e serviço permanente precisam ser administrados |
| **Conector local por HTTPS, sem VPN** | Não exige rota entre redes e usa somente saída HTTPS; limita-se às consultas implementadas no agente | Sem licença adicional; exige manter um serviço no hospital | Baixa a média; alternativa quando o TI não puder configurar VPN site-to-site |

Não é necessário escolher o mesmo protocolo para todos os hospitais. O gateway pode manter conexões IPsec para algumas unidades e OpenVPN para outras. Quando o firewall possui IPsec site-to-site nativo e o TI domina esse recurso, ele tende a reduzir componentes instalados dentro do hospital. Quando o firewall aceita OpenVPN ou o hospital prefere um cliente dedicado, o gateway pode manter uma instância isolada para aquela unidade.

## Segurança e isolamento

Cada hospital terá credencial, certificado, interface de túnel, rota, regra de firewall e identificação próprias. Para impedir conflito entre hospitais que usam as mesmas faixas privadas, cada conexão será isolada em um namespace de rede ou receberá um endereço virtual exclusivo para o banco. O gateway não anunciará acesso à rede inteira: será liberado apenas o IP interno do PostgreSQL e sua porta.

| Camada | Controle proposto |
|---|---|
| Autenticação da VPN | Certificado exclusivo por hospital; IPsec/IKEv2 com certificado ou OpenVPN com certificado individual |
| Portal → gateway | HTTPS com autenticação de serviço e autorização por estabelecimento |
| Acesso ao banco | Usuário PostgreSQL exclusivo, somente leitura, autorizado apenas pelo endereço do túnel |
| Rotas | Somente destino `/32` do banco ou uma sub-rede mínima aprovada pelo TI |
| Firewall | Negação por padrão; somente túnel e porta do banco permitidos |
| Segredos | Fora do código e do navegador, protegidos no servidor e com rotação controlada |
| Auditoria | Hospital, consulta cadastrada, início, término, duração, quantidade e resultado, sem registrar senha nem dados clínicos |

A documentação do strongSwan recomenda IKEv2 e desaconselha IKEv1 por razões de estabilidade e segurança. Ela também descreve autenticação por certificados X.509 e o uso de políticas que permitem apenas o tráfego negociado.[4]

## Funcionamento operacional

O Integrador consulta o gateway por HTTPS. O gateway identifica o estabelecimento, escolhe o túnel correspondente e executa somente uma consulta previamente cadastrada. O resultado é devolvido ao backend do portal, que valida o estabelecimento e grava os dados normalizados. O navegador nunca recebe a senha do banco nem acesso de rede à VPN.

O monitoramento verificará o estado do túnel, o alcance da porta do banco e uma consulta leve, como `SELECT 1`. A interface distinguirá falha de VPN, rota, firewall, autenticação PostgreSQL e consulta. Sincronizações automáticas usarão filas e tentativas limitadas; a queda de um hospital não interromperá os demais.

## Informações necessárias do TI de cada hospital

| Informação | Exemplo/decisão |
|---|---|
| Protocolo aceito | IPsec/IKEv2 ou OpenVPN |
| Equipamento e fabricante | FortiGate, Sophos, SonicWall, pfSense, OPNsense ou servidor Linux/Windows |
| IP público do hospital | Fixo ou dinâmico; informar se existe NAT |
| Rede e IP interno do PostgreSQL | Informar somente ao canal seguro de configuração |
| Porta do PostgreSQL | Geralmente configurável; não deve ser publicada na internet |
| Faixas privadas existentes | Necessárias para evitar sobreposição entre hospitais |
| Autenticação disponível | Certificado, PSK forte ou perfil OpenVPN; certificados são preferíveis |
| Usuário do banco | Usuário exclusivo e somente leitura |
| Janela de implantação | Horário para ativação, teste e eventual reversão |

## Roteiro de implantação

Primeiro será escolhido um hospital piloto. O TI informará o protocolo e os parâmetros de rede sem enviar senhas por mensagem comum. Em seguida, o gateway será configurado com um túnel isolado e regras de firewall restritas. O hospital configurará seu firewall, a rota até o PostgreSQL e a autorização no `pg_hba.conf`. Depois serão testados, em ordem, túnel, rota, porta, autenticação, consulta de leitura, isolamento por estabelecimento e reconexão após interrupção.

Nenhuma alteração de infraestrutura foi executada nesta etapa. A implantação deve ocorrer somente com autorização do TI do hospital e uma janela de mudança definida.

## Referências

[1]: https://docs.strongswan.org/docs/latest/config/quickstart.html "strongSwan — Configuration Quickstart: Site-to-Site"
[2]: https://openvpn.net/as-docs/site-to-site-routing.html "OpenVPN — Site-to-Site VPN Routing"
[3]: https://openvpn.net/community-docs/setting-up-routing.html "OpenVPN — Setting Up Routing"
[4]: https://docs.strongswan.org/docs/latest/howtos/introduction.html "strongSwan — Introduction, IKE and IPsec Basics"
