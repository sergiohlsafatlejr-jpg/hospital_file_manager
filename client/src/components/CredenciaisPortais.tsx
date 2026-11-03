import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Save,
  KeyRound,
  Globe,
  Building2,
  UserCircle,
  Edit,
  Trash2,
  ShieldCheck,
  AlertTriangle,
  Hospital,
  Hash,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function CredenciaisPortais() {
  const {
    data: credenciais,
    refetch,
    isLoading,
  } = trpc.rpa.listarCredenciais.useQuery();
  const { data: convenios } = trpc.rpa.listarConvenios.useQuery();
  const { data: estabelecimentos } = trpc.rpa.listarEstabelecimentos.useQuery();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentId, setCurrentId] = useState<number | undefined>();
  const [estabelecimentoId, setEstabelecimentoId] = useState<number | "">("");
  const [convenioId, setConvenioId] = useState<number | "">("");
  const [codigoPrestadorOperadora, setCodigoPrestadorOperadora] = useState("");
  const [registroAns, setRegistroAns] = useState("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [urlLogin, setUrlLogin] = useState("");
  const [urlEnvioXml, setUrlEnvioXml] = useState("");
  const [cpfResponsavel, setCpfResponsavel] = useState("");

  const salvarMutation = trpc.rpa.salvarCredencial.useMutation({
    onSuccess: () => {
      toast.success(
        "Credencial salva e criptografada (AES-256-GCM) no Cofre com sucesso!"
      );
      setIsModalOpen(false);
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao salvar credencial: ${error.message}`);
    },
  });

  const excluirMutation = trpc.rpa.excluirCredencial.useMutation({
    onSuccess: () => {
      toast.success("Credencial removida do Cofre.");
      refetch();
    },
    onError: (error) => {
      toast.error(`Erro ao excluir: ${error.message}`);
    },
  });

  const handleNovo = () => {
    setCurrentId(undefined);
    setEstabelecimentoId("");
    setConvenioId("");
    setCodigoPrestadorOperadora("");
    setRegistroAns("");
    setLogin("");
    setSenha("");
    setUrlLogin("");
    setUrlEnvioXml("");
    setCpfResponsavel("");
    setIsModalOpen(true);
  };

  const handleEditar = (cred: any) => {
    setCurrentId(cred.id);
    setEstabelecimentoId(cred.estabelecimentoId || "");
    setConvenioId(cred.convenioId);
    setCodigoPrestadorOperadora(cred.codigoPrestadorOperadora || "");
    setRegistroAns(cred.registroAns || "");
    setLogin(cred.login);
    setSenha("********");
    setUrlLogin(cred.urlLogin || "");
    setUrlEnvioXml(cred.parametrosExtras?.urlEnvioXml || "");
    setCpfResponsavel(cred.parametrosExtras?.cpf || "");
    setIsModalOpen(true);
  };

  const handleConvenioSelect = (idConv: number) => {
    setConvenioId(idConv);
    const convObj = convenios?.find((c: any) => Number(c.id) === idConv);
    if (convObj) {
      if (convObj.registroAns && !registroAns) {
        setRegistroAns(convObj.registroAns);
      }
      const nomeUp = String(convObj.nome || "").toUpperCase();
      if (nomeUp.includes("UNIMED") && !urlLogin) {
        setUrlLogin(
          "https://www.unimedgoiania.coop.br/wps/portal/usuariosunimed"
        );
        if (!registroAns) setRegistroAns("382876");
      } else if (nomeUp.includes("IPASGO") && !urlLogin) {
        setUrlLogin(
          "https://portalos.ipasgo.go.gov.br/Portal_Dominio/PrestadorLogin.aspx"
        );
      } else if (nomeUp.includes("CASSI") && !urlLogin) {
        setUrlLogin(
          "https://servicosonline.cassi.com.br/GASC/v2/Usuario/Login/Participante"
        );
        if (!registroAns) setRegistroAns("346659");
      } else if (nomeUp.includes("SULAMERICA") && !urlLogin) {
        setUrlLogin(
          "https://saude.sulamericaseguros.com.br/prestador/login/?accessError=2"
        );
        if (!registroAns) setRegistroAns("006246");
      } else if (nomeUp.includes("BRADESCO") && !urlLogin) {
        setUrlLogin(
          "https://wwws.bradescosaude.com.br/PCBS-GerenciadorPortal/td/loginReferenciado.do"
        );
        if (!registroAns) setRegistroAns("005711");
      } else if (nomeUp.includes("AMIL") && !urlLogin) {
        setUrlLogin("https://credenciado.amil.com.br/login");
        if (!registroAns) setRegistroAns("326305");
      }
    }
  };

  const handleSalvar = () => {
    const estabNum = Number(estabelecimentoId);
    if (!estabNum || estabNum <= 0) {
      toast.error("Selecione o Hospital proprietário da credencial.");
      return;
    }
    if (!convenioId || !login || (!senha && !currentId)) {
      toast.error("Preencha Convênio, Usuário e Senha.");
      return;
    }

    const extras: Record<string, any> = {};
    if (urlEnvioXml.trim()) extras.urlEnvioXml = urlEnvioXml.trim();
    if (cpfResponsavel.trim()) extras.cpf = cpfResponsavel.trim();

    salvarMutation.mutate({
      id: currentId,
      estabelecimentoId: estabNum,
      convenioId: Number(convenioId),
      codigoPrestadorOperadora: codigoPrestadorOperadora.trim() || null,
      registroAns: registroAns.trim() || null,
      login: login.trim(),
      senha: senha === "********" ? undefined : senha,
      urlLogin: urlLogin.trim() || null,
      parametrosExtras: Object.keys(extras).length > 0 ? extras : null,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            Cofre de Credenciais Multi-Hospital (AES-256-GCM)
          </h2>
          <p className="text-sm text-muted-foreground">
            Vincule Hospital + Convênio + Código do Prestador na Operadora. O
            sistema usa esse vínculo para rotear os XMLs automaticamente e
            proteger o login com trava anti-bloqueio.
          </p>
        </div>
        <Button onClick={handleNovo}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Credencial Hospital × Convênio
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hospital (Estabelecimento)</TableHead>
                <TableHead>Convênio / ANS</TableHead>
                <TableHead>Cód. Prestador (XML)</TableHead>
                <TableHead>Login Portal</TableHead>
                <TableHead>Segurança / Status</TableHead>
                <TableHead>Último Acesso</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Carregando cofre de credenciais...
                  </TableCell>
                </TableRow>
              ) : credenciais?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Nenhuma credencial cadastrada. Cadastre as credenciais por
                    Hospital e Convênio para habilitar a triagem e o envio
                    automático de XML.
                  </TableCell>
                </TableRow>
              ) : (
                credenciais?.map((cred: any) => (
                  <TableRow key={cred.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Hospital className="w-4 h-4 text-primary shrink-0" />
                        <div>
                          <div className="font-semibold text-sm">
                            {cred.estabelecimentoNome}
                          </div>
                          {cred.estabelecimentoCnpj && (
                            <div className="text-xs text-muted-foreground font-mono">
                              CNPJ: {cred.estabelecimentoCnpj}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <div className="font-medium text-sm">
                            {cred.convenioNome || `ID: ${cred.convenioId}`}
                          </div>
                          {cred.registroAns && (
                            <div className="text-xs text-muted-foreground font-mono">
                              ANS: {cred.registroAns}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {cred.codigoPrestadorOperadora ? (
                        <Badge
                          variant="secondary"
                          className="font-mono text-xs flex items-center gap-1 w-fit"
                        >
                          <Hash className="w-3 h-3" />
                          {cred.codigoPrestadorOperadora}
                        </Badge>
                      ) : (
                        <span className="text-xs text-amber-600">
                          Não informado (usa CNPJ)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5 font-mono text-sm">
                          <UserCircle className="w-4 h-4 text-muted-foreground" />
                          {cred.login}
                        </div>
                        {cred.urlLogin && (
                          <div className="flex items-center gap-1 text-xs text-blue-500 max-w-[180px] truncate">
                            <Globe className="w-3 h-3 shrink-0" />
                            {cred.urlLogin}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {cred.statusCredencial === "SENHA_INVALIDA" ? (
                          <Badge
                            variant="destructive"
                            className="flex items-center gap-1 w-fit text-xs"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            SENHA INVÁLIDA (PAUSADA)
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200 flex items-center gap-1 w-fit text-xs"
                          >
                            <ShieldCheck className="w-3 h-3" />
                            ATIVA • AES-256
                          </Badge>
                        )}
                        {cred.mensagemErro && (
                          <span className="text-[11px] text-red-600 max-w-[200px] truncate">
                            {cred.mensagemErro}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {cred.ultimoAcesso
                        ? new Date(cred.ultimoAcesso).toLocaleString("pt-BR")
                        : "Nunca testado"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditar(cred)}
                        >
                          <Edit className="w-4 h-4 text-slate-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            excluirMutation.mutate({ id: cred.id })
                          }
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {currentId
                ? "Editar Credencial do Cofre"
                : "Nova Credencial (Hospital × Convênio)"}
            </DialogTitle>
            <DialogDescription>
              A senha é criptografada com AES-256-GCM e descriptografada apenas
              em memória RAM pelo robô no instante do login.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Hospital (Estabelecimento)
                </label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={estabelecimentoId}
                  onChange={(e) =>
                    setEstabelecimentoId(
                      e.target.value ? Number(e.target.value) : ""
                    )
                  }
                >
                  <option value="">Global (Todos os Hospitais)</option>
                  {estabelecimentos?.map((e: any) => (
                    <option key={e.id} value={e.id}>
                      {e.nome} {e.cnpj ? `(${e.cnpj})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Convênio *</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={convenioId}
                  onChange={(e) => handleConvenioSelect(Number(e.target.value))}
                >
                  <option value="">Selecione o Convênio...</option>
                  {convenios?.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Código do Prestador na Operadora
                </label>
                <Input
                  placeholder="Ex: 05562645000131 ou 00768-2"
                  value={codigoPrestadorOperadora}
                  onChange={(e) => setCodigoPrestadorOperadora(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Tag {"<ans:codigoPrestadorNaOperadora>"} do XML (identifica o
                  hospital no upload).
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase text-muted-foreground">
                  Registro ANS da Operadora
                </label>
                <Input
                  placeholder="Ex: 382876 (Unimed Goiânia)"
                  value={registroAns}
                  onChange={(e) => setRegistroAns(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Tag {"<ans:registroANS>"} do XML (identifica o convênio no
                  upload).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Usuário / Login no Portal *
                </label>
                <Input
                  placeholder="Login do hospital no convênio"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Senha do Portal *
                </label>
                <Input
                  type="password"
                  placeholder="Senha secreta"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  URL de Login do Portal
                </label>
                <Input
                  placeholder="https://www.unimedgoiania.coop.br/..."
                  value={urlLogin}
                  onChange={(e) => setUrlLogin(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  URL Direta da Tela de Envio XML (Opcional)
                </label>
                <Input
                  placeholder="https://... (se quiser ir direto após login)"
                  value={urlEnvioXml}
                  onChange={(e) => setUrlEnvioXml(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                CPF do Responsável / Código Auxiliar (Opcional — usado em
                Bradesco/SulAmérica)
              </label>
              <Input
                placeholder="CPF ou código referenciado auxiliar"
                value={cpfResponsavel}
                onChange={(e) => setCpfResponsavel(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvar}
              disabled={salvarMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              {salvarMutation.isPending
                ? "Criptografando e Salvando..."
                : "Salvar no Cofre AES-256"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
