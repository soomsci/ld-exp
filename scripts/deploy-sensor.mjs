// Publish the student UI and standalone sensor helper; keep backend/teacher files off Pages.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=new URL('../',import.meta.url),repo='repos/soomsci/ld-exp',branch='sensor-page';
const statePath=new URL('artifacts/deployments/sensor.json',root);
mkdirSync(new URL('artifacts/deployments/',root),{recursive:true});
const state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{};
function api(path,method='GET',body){
  const output=execFileSync('gh',['api',path,'--method',method,...(body?['--input','-']:[])],{input:body?JSON.stringify(body):undefined,encoding:'utf8',stdio:['pipe','pipe','pipe']});
  return output.trim()?JSON.parse(output):null;
}
try{
  const sources=[{path:'index.html',content:readFileSync(new URL('index.html',root),'utf8')}, ...['index.html','pasco.js'].map(path=>({path:'sensor/'+path,content:readFileSync(new URL('sensor/'+path,root),'utf8')}))];
  const hash=createHash('sha256').update(JSON.stringify(sources)).digest('hex');
  if(state.sourceHash!==hash){
    const tree=[];
    for(const f of sources){const blob=api(repo+'/git/blobs','POST',{content:f.content,encoding:'utf-8'});tree.push({path:f.path,mode:'100644',type:'blob',sha:blob.sha});}
    const t=api(repo+'/git/trees','POST',{tree});
    const commit=api(repo+'/git/commits','POST',{message:'Publish student experiment and sensor connection window',tree:t.sha,parents:state.commit?[state.commit]:[]});
    if(state.commit)api(repo+'/git/refs/heads/'+branch,'PATCH',{sha:commit.sha});
    else api(repo+'/git/refs','POST',{ref:'refs/heads/'+branch,sha:commit.sha});
    Object.assign(state,{commit:commit.sha,sourceHash:hash});writeFileSync(statePath,JSON.stringify(state,null,2)+'\n');
  }
  let pages;
  try{pages=api(repo+'/pages');}catch(e){if(!String(e.stderr).includes('404'))throw e;pages=api(repo+'/pages','POST',{source:{branch,path:'/'},build_type:'legacy'});}
  if(pages.source?.branch!==branch){
    if(pages.source?.branch!=='main')throw new Error('Unexpected existing Pages source; will not change unrelated hosting.');
    state.previousSource=pages.source;
    api(repo+'/pages','PUT',{source:{branch,path:'/'},build_type:'legacy'});
    pages=api(repo+'/pages');
  }
  Object.assign(state,{url:pages.html_url,source:pages.source,status:pages.status});writeFileSync(statePath,JSON.stringify(state,null,2)+'\n');
  console.log(JSON.stringify(state,null,2));
}catch(error){
  console.error(String(error.stderr||error.message).slice(0,2000));process.exitCode=1;
}
