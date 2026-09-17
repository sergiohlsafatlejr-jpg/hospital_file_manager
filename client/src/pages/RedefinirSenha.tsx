import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useLocation } from "wouter";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function RedefinirSenha() {
  const [, setLocation] = useLocation();
  const token = useMemo(() => {
    const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    return new URLSearchParams(fragment).get("token") || "";
  }, []);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const validation = trpc.passwordAuth.validateResetToken.useMutation();

  useEffect(() => {
    if (!token) return;
    validation.mutate({ token });
    window.history.replaceState({}, document.title, "/redefinir-senha");
    // O token é capturado somente na abertura da página e removido da barra do navegador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const resetPassword = trpc.passwordAuth.resetPassword.useMutation({
    onSuccess: () => {
      localStorage.removeItem("hospital_estabelecimento_id");
      toast.success("Senha criada com sucesso.");
      window.location.assign("/selecionar-estabelecimento");
    },
    onError: (error) => toast.error(error.message),
  });

  const requirements = [
    { label: "10 ou mais caracteres", met: newPassword.length >= 10 },
    { label: "Uma letra maiúscula", met: /[A-Z]/.test(newPassword) },
    { label: "Uma letra minúscula", met: /[a-z]/.test(newPassword) },
    { label: "Um número", met: /\d/.test(newPassword) },
  ];
  const canSubmit = requirements.every((item) => item.met) && newPassword === confirmPassword;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return toast.error("Confira os requisitos e a confirmação da senha.");
    resetPassword.mutate({ token, newPassword, confirmPassword });
  };

  if (!token || validation.isError || validation.data?.valid === false) {
    return <AuthPageShell title="Link inválido ou expirado" description="Este link não pode mais ser utilizado."><div className="space-y-5"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><AlertTriangle className="mb-3 h-7 w-7 text-amber-700" /><p className="text-sm leading-6 text-amber-900">Solicite um novo link de recuperação. Por segurança, cada link funciona uma única vez e expira em 30 minutos.</p></div><Button className="w-full" onClick={() => setLocation("/esqueci-senha")}>Solicitar novo link</Button></div></AuthPageShell>;
  }

  if (validation.isPending || !validation.data) {
    return <AuthPageShell title="Validando link" description="Estamos confirmando a segurança desta solicitação."><div className="flex items-center justify-center py-14"><Loader2 className="h-8 w-8 animate-spin text-blue-700" /></div></AuthPageShell>;
  }

  return (
    <AuthPageShell title="Crie uma nova senha" description="O novo acesso será ativado assim que você concluir esta etapa.">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="new-password">Nova senha</Label><div className="relative"><LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} className="h-11 px-10" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
        <div className="grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">{requirements.map((item) => <div key={item.label} className={`flex items-center gap-2 text-xs ${item.met ? "text-emerald-700" : "text-slate-500"}`}>{item.met ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-slate-300" />}{item.label}</div>)}</div>
        <div className="space-y-2"><Label htmlFor="confirm-password">Confirmar nova senha</Label><Input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={128} className="h-11" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>
        {confirmPassword && newPassword !== confirmPassword && <p className="text-sm text-red-700">As senhas não conferem.</p>}
        <Button type="submit" className="h-11 w-full bg-slate-950 text-white hover:bg-slate-800" disabled={!canSubmit || resetPassword.isPending}>{resetPassword.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar nova senha e entrar</Button>
      </form>
    </AuthPageShell>
  );
}
