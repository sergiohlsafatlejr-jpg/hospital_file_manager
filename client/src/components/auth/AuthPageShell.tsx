import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

export function AuthPageShell({ children, title, description }: { children: ReactNode; title: string; description: string }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-12 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -right-24 bottom-8 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:32px_32px]" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[28px] border border-white/10 bg-white shadow-2xl shadow-black/30 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div className="flex items-center gap-3">
              <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663295218967/98MRdVE9Uf2ZRMz25bPSye/safatle-logo_81045648.png" alt="Safatle" className="h-12 w-12 rounded-xl bg-white object-contain p-1" />
              <div><p className="text-xl font-bold">Safatle</p><p className="text-sm text-blue-200">Gerenciamento Hospitalar</p></div>
            </div>
            <div className="space-y-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-400/15 ring-1 ring-blue-300/20"><ShieldCheck className="h-6 w-6 text-blue-200" /></div>
              <div><h2 className="text-3xl font-semibold leading-tight">Acesso protegido aos dados da sua unidade.</h2><p className="mt-3 max-w-md text-sm leading-6 text-slate-300">Autenticação individual, recuperação segura e controle por estabelecimento.</p></div>
            </div>
            <p className="text-xs text-slate-400">Portal Safatle · Gestão de faturamento hospitalar</p>
          </section>

          <section className="p-6 sm:p-10 lg:p-12">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663295218967/98MRdVE9Uf2ZRMz25bPSye/safatle-logo_81045648.png" alt="Safatle" className="h-11 w-11 object-contain" />
              <div><p className="font-bold">Safatle</p><p className="text-xs text-slate-500">Gerenciamento Hospitalar</p></div>
            </div>
            <div className="mx-auto max-w-md">
              <div className="mb-7"><h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div>
              {children}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
