import { useEffect, useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { useLocation } from "wouter";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { getOAuthLoginFeedback } from "@shared/oauthLoginFeedback";
import { toast } from "sonner";

export default function LoginSenha() {
  const [, setLocation] = useLocation();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const authFeedback = getOAuthLoginFeedback(window.location.search, Boolean(user));

  useEffect(() => {
    if (!loading && user) setLocation("/selecionar-estabelecimento", { replace: true });
  }, [loading, setLocation, user]);

  const login = trpc.passwordAuth.login.useMutation({
    onSuccess: () => {
      localStorage.removeItem("hospital_estabelecimento_id");
      window.location.assign("/selecionar-estabelecimento");
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    login.mutate({ email: email.trim(), password });
  };

  const handleProviderLogin = () => {
    startLogin();
  };

  return (
    <AuthPageShell title="Acesse o Portal Safatle" description="Entre com seu e-mail e senha ou continue usando seu provedor habitual.">
      {authFeedback && (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-red-950"
        >
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">{authFeedback.title}</p>
              <p className="mt-1 text-sm leading-5 text-red-900">{authFeedback.message}</p>
              {authFeedback.reference && (
                <p className="mt-2 text-xs text-red-800">
                  Referência de atendimento: {authFeedback.reference}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 border-red-300 bg-white text-red-900 hover:bg-red-100"
                onClick={handleProviderLogin}
              >
                Tentar novamente com provedor
              </Button>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="login-email">E-mail</Label><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="login-email" type="email" autoComplete="email" required maxLength={320} className="h-11 pl-10" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@hospital.com.br" /></div></div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3"><Label htmlFor="login-password">Senha</Label><button type="button" onClick={() => setLocation("/esqueci-senha")} className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline">Esqueci minha senha</button></div>
          <div className="relative"><LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={128} className="h-11 px-10" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
        </div>
        <Button type="submit" className="h-11 w-full bg-slate-950 text-white hover:bg-slate-800" disabled={login.isPending}>{login.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Entrar</Button>
      </form>

      <div className="my-7 flex items-center gap-3"><div className="h-px flex-1 bg-slate-200" /><span className="text-xs font-medium uppercase tracking-wider text-slate-400">ou</span><div className="h-px flex-1 bg-slate-200" /></div>
      <Button type="button" variant="outline" className="h-11 w-full bg-white" onClick={handleProviderLogin}>Continuar com Google, Microsoft ou Apple</Button>
      <p className="mt-6 text-center text-xs leading-5 text-slate-500">O acesso continua limitado aos estabelecimentos e módulos autorizados para sua conta.</p>
    </AuthPageShell>
  );
}
