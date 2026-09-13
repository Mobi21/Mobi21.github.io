import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({base:'/demos/kora/',plugins:[react(),{name:'demo-boundary',enforce:'pre',resolveId(source){if(/(?:^|\/)lib\/runtime$/.test(source))return resolve(import.meta.dirname,'fixture.ts');if(/(?:^|\/)lib\/desktop-host$/.test(source))return resolve(import.meta.dirname,'desktop.ts');}}],define:{__KORA_QA_METRICS_ENABLED__:'false'},build:{outDir:'../kora',emptyOutDir:true}});
