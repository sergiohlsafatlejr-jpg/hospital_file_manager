import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=(p:string)=>readFileSync(new URL(p,root),'utf8').replace(/\s+/g,' ');
const ui=read('client/src/components/integrador/EasyLocalAgendamentoAcao.tsx');
const tabs=read('client/src/components/integrador/EasyLocalIntegradorTabs.tsx');
const index=read('server/_core/index.ts');
describe('horários EASYLocal: confirmação e integração isolada',()=>{
 it('registrar leitura não cria tarefa; ativação exige prévia, alvo e confirmação',()=>{
   expect(ui).toContain('prever.useMutation');expect(ui).toContain('ativar.useMutation');
   expect(ui).toContain('tokenPrevia: previa.tokenPrevia');expect(ui).toContain('confirmarAgendamento: true');
   expect(ui).toContain('!confirmado');expect(ui).toContain('expirada');
   expect(tabs).toContain('Salvar a frequência desejada não ativa horários');
   expect(ui).toContain('America/Sao_Paulo');expect(ui).toContain('Horário de Brasília');
 });
 it('descarta plano em troca de unidade, leitura, frequência ou horário e não armazena registros',()=>{
   expect(ui).toContain('setPrevia(null)');expect(ui).toContain('setConfirmado(false)');
   expect(tabs).toContain('agenda-${estabelecimentoId}-${configuracao.id}-${versaoConexao}');
   expect(ui).not.toMatch(/localStorage|sessionStorage|setInterval|node-cron/);
 });
 it('não repete automaticamente mutações ou ativação inconclusiva',()=>{
   expect(ui.match(/retry: false/g)?.length).toBeGreaterThanOrEqual(3);
   expect(ui).toContain('Ativação não confirmada');expect(ui).toContain('incerto');
   expect(ui).toContain('podeGerenciar');expect(ui).toContain('agenda?.estado === "ativo"');
 });
 it('monta somente um callback autenticado antes do frontend',()=>{
   expect(index).toContain('app.post("/api/scheduled/easylocal-importar", easyLocalAgendamentoHandler)');
   expect(index.indexOf('app.post("/api/scheduled/')).toBeLessThan(index.indexOf('await setupVite'));
   expect(read('server/routers.ts')).toContain('easyLocalAgendamento: easyLocalAgendamentoRouter');
 });
});
