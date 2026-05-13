import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { getDevBypassUrl } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Mail, ArrowRight, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("sergiohlsafatlejr@gmail.com");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [isLoadingLink, setIsLoadingLink] = useState(false);

  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (user) setLocation("/");
  }, [user, setLocation]);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsLoadingLink(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (!error) {
      setMagicLinkSent(true);
    } else {
      alert("Erro ao enviar link mágico: " + error.message);
    }
    setIsLoadingLink(false);
  };

  const handleOAuth = async (provider: 'google' | 'azure' | 'apple') => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({ 
        provider, 
        options: { redirectTo: window.location.origin } 
      });
      if (error) {
        alert(`Erro no login com ${provider}: ` + error.message);
      }
    } catch (err: any) {
      alert(`Erro inesperado no login com ${provider}: ` + err.message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0f172a]">

      {/* ── FUNDO ANIMADO ────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Gradient orbs */}
        <div
          className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #4f46e5 0%, transparent 70%)", animation: "pulse 8s ease-in-out infinite" }}
        />
        <div
          className="absolute -bottom-40 -right-20 h-[500px] w-[500px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)", animation: "pulse 10s ease-in-out infinite 2s" }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[800px] w-[800px] rounded-full opacity-5"
          style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }}
        />
        {/* Grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(rgba(99,102,241,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.5) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      {/* ── CARD PRINCIPAL ───────────────────────────────────────────────── */}
      <div
        className="relative z-10 w-full max-w-md mx-4"
        style={{ animation: "fadeInUp 0.6s ease-out" }}
      >
        {/* Glow atrás do card */}
        <div
          className="absolute inset-0 rounded-2xl blur-xl opacity-30"
          style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
        />

        <div
          className="relative rounded-2xl border border-white/10 p-8"
          style={{
            background: "rgba(13, 17, 28, 0.85)",
            backdropFilter: "blur(24px)",
            boxShadow: "0 32px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* ── LOGO + HEADER ─────────────────────────────────────────── */}
          <div className="mb-8 flex flex-col items-center gap-4">
            <div className="relative">
              <div
                className="absolute inset-0 rounded-2xl blur-lg opacity-50"
                style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
              />
              <div
                className="relative rounded-2xl p-1"
                style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}
              >
                <img
                  src="https://d2xsxph8kpxj0f.cloudfront.net/310519663295218967/98MRdVE9Uf2ZRMz25bPSye/safatle-logo_81045648.png"
                  alt="Safatle Logo"
                  className="h-16 w-16 rounded-xl object-contain bg-white p-1"
                />
              </div>
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Safatle <span style={{ background: "linear-gradient(90deg, #818cf8, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Gerenciamento</span>
              </h1>
              <p className="mt-1.5 text-sm text-white/40">
                Sistema de gestão hospitalar e convênios médicos
              </p>
            </div>
          </div>

          {/* ── ACESSO PRINCIPAL (BYPASS) ─────────────────────────────── */}
          <button
            type="button"
            onClick={() => { window.location.href = getDevBypassUrl(); }}
            className="group relative w-full overflow-hidden rounded-xl py-3.5 px-6 font-semibold text-white transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%)",
              boxShadow: "0 8px 32px rgba(29,78,216,0.4)",
            }}
          >
            <span className="relative z-10 flex items-center justify-center gap-2.5">
              <ShieldCheck className="h-4 w-4" />
              Entrar no Sistema
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </span>
            <div
              className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)" }}
            />
          </button>

          {/* ── DIVISOR ───────────────────────────────────────────────── */}
          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-white/25 uppercase tracking-widest">ou acesse com email</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          {/* ── FORMULÁRIO DE MAGIC LINK ──────────────────────────────── */}
          {magicLinkSent ? (
            <div
              className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-center"
            >
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              <p className="text-sm text-emerald-300 font-medium">Link mágico enviado!</p>
              <p className="text-xs text-white/40">
                Verifique sua caixa de entrada em <span className="text-white/60 font-mono">{email}</span>
              </p>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
                <Input
                  type="email"
                  placeholder="Seu email corporativo"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoadingLink}
                  required
                  className="h-11 bg-white/5 border-white/10 text-white pl-10 placeholder:text-white/25 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 rounded-xl"
                />
              </div>
              <button
                type="submit"
                disabled={isLoadingLink}
                className="h-11 w-full rounded-xl border border-white/10 bg-white/5 text-sm font-medium text-white/70 transition-all hover:bg-white/10 hover:text-white flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoadingLink ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
                ) : (
                  <><Mail className="h-4 w-4" /> Receber Link Mágico</>
                )}
              </button>
            </form>
          )}

          {/* ── OAUTH ─────────────────────────────────────────────────── */}
          <div className="mt-4 grid grid-cols-3 gap-2">
            {/* Google */}
            <button type="button" title="Google"
              onClick={() => handleOAuth('google')}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs font-medium text-white/60 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white">
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google
            </button>
            {/* Microsoft */}
            <button type="button" title="Microsoft"
              onClick={() => handleOAuth('azure')}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs font-medium text-white/60 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white">
              <svg width="16" height="16" viewBox="0 0 21 21">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
              Microsoft
            </button>
            {/* Apple */}
            <button type="button" title="Apple"
              onClick={() => handleOAuth('apple')}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs font-medium text-white/60 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white">
              <svg width="16" height="16" viewBox="0 0 814 1000" fill="currentColor" className="text-white/70">
                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-57.8-155.5-127.4C46 389.8 30 237 30 189c0-124.2 81.6-190.2 161.1-190.2 75.9 0 127.5 46.3 164 46.3 35.5 0 93.8-48.8 175.3-48.8 42.8 0 155.5 3.9 209.4 112.3zm-209.4-2.9c-23.7-11.8-62.2-24.4-107.2-24.4-80.4 0-172.5 50.9-172.5 181.1 0 125.4 82.3 235.5 168.3 235.5 78 0 101-45.2 167.4-45.2 63.9 0 97 40.8 165.3 40.8-1.9-4.5-104.4-62.2-104.4-190.5 0-111.1 75.3-162.7 103.7-189.8-48.5-52.6-123.4-7.5-220.6-7.5z"/>
              </svg>
              Apple
            </button>
          </div>

          {/* ── RODAPÉ ────────────────────────────────────────────────── */}
          <p className="mt-6 text-center text-[11px] text-white/20">
            Safatle Consultoria © {new Date().getFullYear()} · v2.0
          </p>
        </div>
      </div>

      {/* ── KEYFRAMES (inline style) ─────────────────────────────────────── */}
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50%       { transform: scale(1.1); opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
