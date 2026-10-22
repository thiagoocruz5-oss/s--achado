export function createBlobStore(sdk,{prefix='so-achado'}={}) {
  const CURRENT=`${prefix}/catalog/current.json`;
  async function readJson(path) {
    const result=await sdk.get(path,{access:'private',useCache:false});
    if(!result)return null;
    return {...JSON.parse(await new Response(result.stream).text()),_etag:result.blob.etag};
  }
  return {
    read:()=>readJson(CURRENT),
    writeBackup:backup=>sdk.put(`${prefix}/backups/${backup.id}.json`,JSON.stringify(backup),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'}),
    readBackup:id=>readJson(`${prefix}/backups/${id}.json`),
    compareAndSwap:async(current,next)=>sdk.put(CURRENT,JSON.stringify(next),{access:'private',addRandomSuffix:false,
      allowOverwrite:Boolean(current._etag),...(current._etag?{ifMatch:current._etag}:{}),contentType:'application/json'})
  };
}
