import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { useLocation } from "wouter";
import { AuthPageShell } from "@/components/auth/AuthPageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";

export default function EsqueciSenha() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const requestReset = trpc.passwordAuth.requestReset.useMutation({ onSuccess: () => setSent(true) });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    requestReset.mutate({ email: email.trim() });
  };

  return (
    <AuthPageShell title="Recuperar acesso" description="Informe o e-mail cadastrado. Enviaremos um link seguro para você criar uma nova senha.">
      {sent ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><CheckCircle2 className="mb-3 h-7 w-7 text-emerald-700" /><h2 className="font-semibold text-emerald-950">Verifique seu e-mail</h2><p className="mt-2 text-sm leading-6 text-emerald-900">Se o endereço estiver cadastrado, as instruções chegarão em alguns minutos. O link será válido por 30 minutos e poderá ser usado uma única vez.</p></div>
          <Button className="w-full" onClick={() => setLocation("/login")}>Voltar para o login</Button>
          <button type="button" className="w-full text-sm text-slate-600 hover:underline" onClick={() => setSent(false)}>Tentar outro e-mail</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2"><Label htmlFor="reset-email">E-mail</Label><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="reset-email" type="email" autoComplete="email" required maxLength={320} className="h-11 pl-10" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@hospital.com.br" /></div></div>
          {requestReset.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Não foi possível processar agora. Tente novamente em alguns minutos.</p>}
          <Button type="submit" className="h-11 w-full bg-slate-950 text-white hover:bg-slate-800" disabled={requestReset.isPending}>{requestReset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar link de recuperação</Button>
          <button type="button" onClick={() => setLocation("/login")} className="flex w-full items-center justify-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"><ArrowLeft className="h-4 w-4" />Voltar para o login</button>
        </form>
      )}
    </AuthPageShell>
  );
}
