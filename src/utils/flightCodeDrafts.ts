// Mounted fields only; callbacks are removed on unmount and hold no global copy of file data.
const drafts=new Map();
export function registerFlightCodeDraft(id,save){
 if(!id)return()=>{};
 if(!drafts.has(id))drafts.set(id,new Set());drafts.get(id).add(save);
 return()=>{const current=drafts.get(id);current?.delete(save);if(!current?.size)drafts.delete(id);};
}
export async function flushFlightCodeDrafts(ids){
 const tasks=[...new Set(ids)].flatMap(id=>[...(drafts.get(id)||[])]);
 const results=await Promise.allSettled(tasks.map(save=>save()));
 return results.every(r=>r.status==="fulfilled"&&r.value!==false);
}
