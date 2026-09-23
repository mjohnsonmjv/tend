import type { PrayerRequest } from "@shared/schema";
export function filterPrayers(rows:PrayerRequest[],search:string,status:string,category:string,urgent:boolean,sort:string){
  const term=search.trim().toLocaleLowerCase();
  return rows.filter(p=>(status==="all"||p.status===status)&&(category==="all"||p.category===category)&&(!urgent||p.isUrgent)&&(!term||[p.message,p.isAnonymous?"Anonymous":p.submitterName,p.pastorNotes].filter(Boolean).join(" ").toLocaleLowerCase().includes(term)))
    .sort((a,b)=>sort==="oldest"?a.createdAt-b.createdAt:sort==="urgent"?Number(b.isUrgent)-Number(a.isUrgent)||b.createdAt-a.createdAt:b.createdAt-a.createdAt);
}
export function csvCell(value:unknown){
  let text=String(value??"");
  if(/^[\s]*[=+@-]/.test(text)) text="'"+text;
  return `"${text.replace(/"/g,'""')}"`;
}
export function prayerCsv(rows:PrayerRequest[]){
  return [["Received","Name","Category","Status","Urgent","Request"],...rows.map(p=>[new Date(p.createdAt).toISOString(),p.isAnonymous?"Anonymous":p.submitterName||"Not provided",p.category,p.status,p.isUrgent?"Yes":"No",p.message])].map(row=>row.map(csvCell).join(",")).join("\r\n");
}
export function publicChurchUrl(slug:string){
  return `${window.location.origin}${window.location.pathname}#/c/${encodeURIComponent(slug)}`;
}
