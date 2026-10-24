import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {httpBatchLink} from '@trpc/client';
import superjson from 'superjson';
import {Route,Switch,Link} from 'wouter';
import {trpc} from '@/lib/trpc';
import {useAuth} from '@/_core/hooks/useAuth';
import {EstabelecimentoProvider,useEstabelecimento} from '@/contexts/EstabelecimentoContext';
import LoginSenha from '@/pages/LoginSenha';
import SelecionarEstabelecimento from '@/pages/SelecionarEstabelecimento';
import {Toaster} from 'sonner';
import './style.css';
const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
const client=trpc.createClient({links:[httpBatchLink({url:'/api/trpc',transformer:superjson,fetch:(url,init)=>fetch(url,{...init,credentials:'include'})})]});
function ProtectedTest({id}:{id:number}){
 const query=(trpc as any).qaAcesso.ver.useQuery({estabelecimentoId:id});
 const {user}=useAuth();
 return <section className="p-8"><h1 className="text-2xl font-bold">Rota protegida de homologação</h1><p>Unidade solicitada: {id}</p>{!user?<p>Sessão não autenticada</p>:query.error?<p role="alert">Acesso negado: {query.error.message}</p>:query.data?<p>Acesso autorizado à unidade {query.data.estabelecimentoId}</p>:<p>Verificando...</p>}<Link href="/selecionar-estabelecimento">Selecionar estabelecimento</Link></section>;
}
function Home(){const {user,logout}=useAuth();const {estabelecimentoAtual}=useEstabelecimento();if(!user||!estabelecimentoAtual)return <SelecionarEstabelecimento/>;return <section className="p-8"><h1 className="text-2xl font-bold">Área de Homologação</h1><p>Usuário: {user.name}</p><p>Estabelecimento selecionado: {estabelecimentoAtual.nome}</p><div className="flex gap-4 mt-6"><Link href="/selecionar-estabelecimento">Trocar unidade</Link><Link href="/qa/unidade/101">Testar unidade Alfa</Link><Link href="/qa/unidade/102">Testar unidade Beta</Link><button onClick={async()=>{await logout();location.assign('/selecionar-estabelecimento')}}>Sair</button></div></section>}
createRoot(document.getElementById('root')!).render(<trpc.Provider client={client} queryClient={qc}><QueryClientProvider client={qc}><EstabelecimentoProvider><div className="bg-amber-100 text-amber-950 p-3 font-semibold">HOMOLOGAÇÃO ISOLADA — dados fictícios; sem conexão com produção</div><Switch><Route path="/login" component={LoginSenha}/><Route path="/selecionar-estabelecimento" component={SelecionarEstabelecimento}/><Route path="/qa/unidade/:id">{params=><ProtectedTest id={Number(params.id)}/>}</Route><Route><Home/></Route></Switch><Toaster richColors/></EstabelecimentoProvider></QueryClientProvider></trpc.Provider>);
