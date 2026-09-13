import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve,dirname,normalize} from 'node:path';
const root=import.meta.dirname;
const boundaries=new Map([
 [normalize(resolve(root,'upstream/lib/runtime.ts')),resolve(root,'fixture.ts')],
 [normalize(resolve(root,'upstream/lib/desktop-host.ts')),resolve(root,'desktop.ts')],
]);
export default defineConfig({
 base:'/demos/kora/',
 plugins:[react(),{name:'demo-boundary',enforce:'pre',resolveId(source,importer){
   if(!importer||!source.startsWith('.'))return null;
   const candidate=normalize(resolve(dirname(importer.split('?')[0]),source.split('?')[0]));
   return boundaries.get(candidate)||boundaries.get(candidate+'.ts')||null;
 }}],
 define:{__KORA_QA_METRICS_ENABLED__:'false'},
 build:{outDir:'../kora',emptyOutDir:true}
});
