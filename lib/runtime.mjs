import * as blob from '@vercel/blob';
import {readFile} from 'node:fs/promises';
import {createBlobStore} from './blob-store.mjs';
import {createService} from './catalog-service.mjs';
import {createAdminAuth} from './admin-auth.mjs';
const seed=JSON.parse(await readFile(new URL('../data/products.json',import.meta.url),'utf8'));
// Prévia e produção nunca compartilham o catálogo, mesmo vinculadas ao mesmo store.
const prefix=process.env.VERCEL_ENV==='production'?'so-achado':
  'so-achado-preview/'+String(process.env.VERCEL_GIT_COMMIT_SHA||'local').replace(/[^a-zA-Z0-9-]/g,'');
export const service=createService(createBlobStore(blob,{prefix}),seed);
export const adminAuth=createAdminAuth(createBlobStore(blob,{prefix:prefix+'/admin-auth'}));
