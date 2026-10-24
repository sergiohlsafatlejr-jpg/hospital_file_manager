import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {readFileSync} from 'node:fs';
const qa='/home/ubuntu/auth-homologacao-qa', branch='/home/ubuntu/auth-homologacao-isolada';
const backend={target:'http://127.0.0.1:3042',xfwd:true};
export default defineConfig({root:qa,plugins:[react(),tailwindcss()],define:{'import.meta.env.VITE_APP_ID':JSON.stringify('safatle-auth-qa'),'import.meta.env.VITE_OAUTH_PORTAL_URL':JSON.stringify('https://127.0.0.1:3041')},resolve:{alias:[{find:'@shared',replacement:branch+'/shared'},{find:'@',replacement:branch+'/client/src'}]},server:{host:'127.0.0.1',port:3041,strictPort:true,https:{key:readFileSync('/home/ubuntu/private/auth-homologacao-runtime/qa.key'),cert:readFileSync('/home/ubuntu/private/auth-homologacao-runtime/qa.crt')},proxy:{'/api':backend,'/qa/health':backend,'/qa/revogar':backend,'/qa/restaurar':backend,'/app-auth':backend},fs:{allow:[qa,branch,'/home/ubuntu/hospital_file_manager']}}});
