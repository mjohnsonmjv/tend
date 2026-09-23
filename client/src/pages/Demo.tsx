import { useState } from "react";
import { Link } from "wouter";
import { Inbox } from "@/components/Inbox";
import { SiteHeader,SiteFooter } from "@/components/SiteHeader";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PrayerRequest,Status } from "@shared/schema";
import { STATUS_LABELS } from "@shared/schema";
const now=Date.now();
const initial:PrayerRequest[]=[
  {id:1,churchId:0,submitterName:"Jordan M.",submitterPhone:null,submitterEmail:null,message:"My mom has surgery this week. Please pray for peace for our family.",category:"prayer",isAnonymous:false,isUrgent:true,isPrivate:true,status:"new",pastorNotes:null,createdAt:now-3600000},
  {id:2,churchId:0,submitterName:null,submitterPhone:null,submitterEmail:null,message:"I’m carrying some uncertainty about work. I’d appreciate prayer for clarity and patience.",category:"prayer",isAnonymous:true,isUrgent:false,isPrivate:true,status:"new",pastorNotes:null,createdAt:now-86400000},
  {id:3,churchId:0,submitterName:"Alex R.",submitterPhone:null,submitterEmail:null,message:"We welcomed our new baby this week. Grateful for the meals and encouragement.",category:"praise",isAnonymous:false,isUrgent:false,isPrivate:true,status:"prayed_for",pastorNotes:"Ask how the family is settling in.",createdAt:now-172800000},
  {id:4,churchId:0,submitterName:"Morgan T.",submitterPhone:null,submitterEmail:null,message:"It was good to be back on Sunday. Could someone tell me about joining a small group?",category:"question",isAnonymous:false,isUrgent:false,isPrivate:true,status:"praying",pastorNotes:null,createdAt:now-259200000},
];
export default function Demo(){
  const [rows,setRows]=useState(initial);
  const [selected,setSelected]=useState<number|null>(null);
  const [note,setNote]=useState("");
  const [saved,setSaved]=useState(false);
  const prayer=rows.find(p=>p.id===selected);
  const status=(id:number,s:Status)=>setRows(v=>v.map(p=>p.id===id?{...p,status:s}:p));
  return <><SiteHeader/><main className="max-w-5xl mx-auto p-5 sm:p-10">
    <div className="demo-banner"><div><strong>Try Tend with sample requests</strong><p>Fictional people. Changes stay in this tab and reset when you refresh. Nothing is sent.</p></div><Link href="/signup" className="brand-button" data-testid="link-demo-create">Create your church</Link></div>
    <Inbox demo rows={rows} onStatus={status} onOpen={p=>{setSelected(p.id);setNote(p.pastorNotes||"");setSaved(false)}}/>
    <Dialog open={!!prayer} onOpenChange={open=>{if(!open)setSelected(null)}}><DialogContent><DialogHeader><DialogTitle>{prayer?.isAnonymous?"Anonymous":prayer?.submitterName}</DialogTitle><DialogDescription>Fictional request. This is an interactive demonstration, not a real person’s information.</DialogDescription></DialogHeader>
    <p className="leading-relaxed">{prayer?.message}</p>
    <label className="text-sm">Request status<select className="block mt-2 border rounded bg-background p-3 w-full" data-testid="select-demo-status" value={prayer?.status} onChange={e=>prayer&&status(prayer.id,e.target.value as Status)}>{Object.entries(STATUS_LABELS).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
    <label className="text-sm" htmlFor="demo-notes">Private note</label><Textarea id="demo-notes" data-testid="input-demo-note" value={note} maxLength={4000} onChange={e=>{setNote(e.target.value);setSaved(false)}}/>
    <Button data-testid="button-demo-save" onClick={()=>{setRows(v=>v.map(p=>p.id===selected?{...p,pastorNotes:note}:p));setSaved(true)}}>Save sample note</Button>{saved&&<p role="status" className="text-sm text-primary">Sample note saved in this tab.</p>}
    </DialogContent></Dialog>
  </main><SiteFooter/></>;
}
