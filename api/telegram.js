import * as blob from '@vercel/blob';
import {service,adminAuth,prefix} from '../lib/runtime.mjs';
import {createBlobStore} from '../lib/blob-store.mjs';
import {createCloudTelegram} from '../lib/cloud-telegram.mjs';
import {createCloudHandler} from '../lib/cloud-telegram-http.mjs';
import {createGitHubVerifier} from '../lib/github-oidc.mjs';
import {createTelegram} from '../lib/telegram-client.mjs';
export const config={maxDuration:120};
const cloud=createCloudTelegram({catalog:service,telegram:createTelegram(),
  store:createBlobStore(blob,{prefix:prefix+'/telegram-state'}),
  credentials:createBlobStore(blob,{prefix:prefix+'/telegram-private'})});
export default createCloudHandler(cloud,{adminAuth,verifyGitHub:createGitHubVerifier()});
