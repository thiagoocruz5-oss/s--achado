export function createBlobStore(sdk,{prefix='so-achado'}={}) {
  const CURRENT=`${prefix}/catalog/current.json`;
  async function readJson(path) {
    const result=await sdk.get(path,{access:'private',useCache:false});
    if(!result)return null;
    return {...JSON.parse(await new Response(result.stream).text()),_etag:result.blob.etag};
  }
  async function readCurrent() {
    // Usa o ETag do plano de controle para escrita condicional. O ETag do
    // download pode corresponder à representação servida pelo armazenamento.
    let metadata;
    try {metadata=await sdk.head(CURRENT);}
    catch(error){if(error instanceof sdk.BlobNotFoundError)return null;throw error;}
    const current=await readJson(CURRENT);
    return current?{...current,_etag:metadata.etag}:null;
  }
  return {
    read:readCurrent,
    writeBackup:backup=>sdk.put(`${prefix}/backups/${backup.id}.json`,JSON.stringify(backup),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'}),
    readBackup:id=>readJson(`${prefix}/backups/${id}.json`),
    compareAndSwap:async(current,next)=>{
      try{return await sdk.put(CURRENT,JSON.stringify(next),{access:'private',addRandomSuffix:false,
        allowOverwrite:Boolean(current._etag),...(current._etag?{ifMatch:current._etag}:{}),contentType:'application/json'});}
      catch(error){if(error instanceof sdk.BlobPreconditionFailedError||error instanceof sdk.BlobAlreadyExistsError){error.status=409;}throw error;}
    }
  };
}
