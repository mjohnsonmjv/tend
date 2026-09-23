import { useMemo,useState } from "react";
import { Link } from "wouter";
import { Search,ArrowUpRight,Download,Heart,RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from "@/components/ui/dialog";
import type { PrayerRequest,Status } from "@shared/schema";
import { CATEGORY_LABELS,STATUS_LABELS } from "@shared/schema";
import { filterPrayers,prayerCsv } from "@/lib/inbox";

type Props={rows:PrayerRequest[];churchId?:number;onStatus:(id:number,status:Status)=>void;pending?:boolean;refresh?:()=>void;refreshing?:boolean;onOpen?:(p:PrayerRequest)=>void;error?:string;demo?:boolean};
export function Inbox({rows,churchId,onStatus,pending,refresh,refreshing,onOpen,error,demo}:Props){
  const [status,setStatus]=useState("new");
  const [search,setSearch]=useState("");
  const [category,setCategory]=useState("all");
  const [urgent,setUrgent]=useState(false);
  const [sort,setSort]=useState("newest");
  const [exportOpen,setExportOpen]=useState(false);
  const visible=useMemo(()=>filterPrayers(rows,search,status,category,urgent,sort),[rows,search,status,category,urgent,sort]);
  const clear=()=>{setSearch("");setCategory("all");setUrgent(false);setStatus("all")};
  function download(){
    const url=URL.createObjectURL(new Blob(["\uFEFF",prayerCsv(visible)],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download=`tend-${demo?"example":"prayers"}-${new Date().toISOString().slice(0,10)}.csv`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);setExportOpen(false);
  }
  return <div className="inbox-workspace">
    <div className="flex flex-wrap items-start justify-between gap-4 mb-7">
      <div><p className="eyebrow mb-2">Care, one person at a time</p><h1 className="text-xl">Prayer inbox</h1><p className="text-muted-foreground mt-2 text-sm">Find a request. Remember the details. Take the next step.</p></div>
      <div className="flex gap-2">{refresh&&<Button variant="outline" onClick={refresh} disabled={refreshing} aria-label="Refresh inbox" data-testid="button-refresh"><RefreshCw size={16}/></Button>}
      <Button variant="outline" disabled={!visible.length} onClick={()=>setExportOpen(true)} data-testid="button-export"><Download size={16}/> Export</Button></div>
    </div>
    <div className="inbox-statuses" role="group" aria-label="Request status">
      {["all","new","praying","prayed_for","archived"].map(s=><button key={s} aria-pressed={status===s} className={status===s?"selected":""} onClick={()=>setStatus(s)} data-testid={`button-tab-${s}`}><span>{s==="all"?"All requests":STATUS_LABELS[s as Status]}</span><strong>{s==="all"?rows.length:rows.filter(p=>p.status===s).length}</strong></button>)}
    </div>
    <div className="inbox-toolbar">
      <div className="relative"><Search className="absolute left-3 top-3 text-muted-foreground" size={17}/><Input aria-label="Search requests" className="pl-9 h-11" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search names, requests, or notes" data-testid="input-inbox-search"/></div>
      <select aria-label="Category" value={category} onChange={e=>setCategory(e.target.value)} data-testid="select-category"><option value="all">All categories</option>{Object.entries(CATEGORY_LABELS).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select>
      <select aria-label="Sort requests" value={sort} onChange={e=>setSort(e.target.value)} data-testid="select-sort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="urgent">Urgent first</option></select>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 py-4">
      <label className="flex items-center gap-2 text-sm min-h-11 cursor-pointer"><input type="checkbox" checked={urgent} onChange={e=>setUrgent(e.target.checked)} data-testid="checkbox-urgent-only"/> Urgent requests only</label>
      <p className="text-xs text-muted-foreground" aria-live="polite" data-testid="text-result-count">{visible.length} {visible.length===1?"request":"requests"} shown</p>
    </div>
    {error&&<p role="alert" className="border rounded p-3 mb-4 text-sm">Couldn’t save that change. Please try again.</p>}
    {!visible.length?<div className="rounded-lg border border-dashed p-10 text-center"><Heart className="mx-auto mb-4 text-primary" size={24}/><h2 className="text-lg">{rows.length?"No requests match these filters.":"Your inbox is ready."}</h2><p className="text-muted-foreground mt-2 mb-5 text-sm">{rows.length?"Try another name, category, or status.":"Share your church’s QR code to invite your first prayer request."}</p>{rows.length?<Button variant="outline" onClick={clear} data-testid="button-clear-filters">Clear filters</Button>:churchId&&<Link href={`/church/${churchId}/qr`} className="brand-button">Get your QR code</Link>}</div>:
    <div className="space-y-3">{visible.map(p=><article key={p.id} className="inbox-request" data-testid={`card-prayer-${p.id}`}>
      <div className="flex flex-wrap justify-between items-center gap-2 text-xs text-muted-foreground mb-3"><span>{CATEGORY_LABELS[p.category as keyof typeof CATEGORY_LABELS]} · {new Date(p.createdAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</span><div className="flex gap-2">{p.isUrgent&&<span className="request-urgent">Urgent</span>}<span className="request-status">{STATUS_LABELS[p.status as Status]}</span></div></div>
      <h2 className="text-base font-semibold mb-2">{p.isAnonymous?"Anonymous":p.submitterName||"Name not provided"}</h2><p className="text-sm leading-relaxed line-clamp-3 break-words">{p.message}</p>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {p.status==="new"&&<Button variant="outline" className="min-h-11" disabled={pending} onClick={()=>onStatus(p.id,"praying")} data-testid={`button-praying-${p.id}`}><Heart size={14}/> Praying</Button>}
        {(p.status==="new"||p.status==="praying")&&<Button variant="ghost" className="min-h-11" disabled={pending} onClick={()=>onStatus(p.id,"prayed_for")} data-testid={`button-prayed-${p.id}`}>Prayed for</Button>}
        {onOpen?<Button variant="ghost" className="ml-auto min-h-11" onClick={()=>onOpen(p)} data-testid={`link-prayer-${p.id}`}>Open request <ArrowUpRight size={14}/></Button>:<Link className="ml-auto inline-flex items-center gap-2 text-sm min-h-11 px-3" href={`/church/${churchId}/prayer/${p.id}`} data-testid={`link-prayer-${p.id}`}>Open request <ArrowUpRight size={14}/></Link>}
      </div>
    </article>)}</div>}
    <Dialog open={exportOpen} onOpenChange={setExportOpen}><DialogContent><DialogHeader><DialogTitle>Export {visible.length} visible requests?</DialogTitle><DialogDescription>The CSV includes names, prayer text, categories, dates, and statuses. Phone numbers and private notes are excluded. Keep downloaded files secure and share them only with authorized people.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={()=>setExportOpen(false)}>Cancel</Button><Button onClick={download} data-testid="button-confirm-export">Download CSV</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
