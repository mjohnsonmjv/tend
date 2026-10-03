import { QueryClient, type QueryFunction } from "@tanstack/react-query";
import { supabase,SUPABASE_URL,SUPABASE_KEY } from "./supabase";
import { providerFlags } from "./oauth-core";

const churchFields = "id,slug,name,pastorName:pastor_name,pastorEmail:pastor_email,contactRole:contact_role,greetingMessage:greeting_message,plan,createdAt:created_at";
const prayerFields = "id,churchId:church_id,submitterName:submitter_name,submitterPhone:submitter_phone,submitterEmail:submitter_email,submitterPhotoUrl:submitter_photo_url,submitterPhotoPath:submitter_photo_path,message,category,isAnonymous:is_anonymous,isUrgent:is_urgent,isPrivate:is_private,status,pastorNotes:pastor_notes,createdAt:created_at";
const dateRows = (rows: any): any => Array.isArray(rows) ? rows.map(dateRows) : rows && typeof rows === "object" && rows.createdAt ? { ...rows, createdAt: Date.parse(rows.createdAt) } : rows;
const result = (data: any, error?: any) => {
  if (error) throw new Error(error.code === "23505" ? "That church URL is already taken." : error.message || "Request failed.");
  return new Response(JSON.stringify(dateRows(data)), { headers: { "content-type": "application/json" } });
};

/** All app data calls go to durable Supabase APIs, never a sandbox proxy.
 * Public reads/writes are narrow RPCs; private calls use the signed-in JWT + RLS.
 */
export async function apiRequest(method: string, url: string, data?: any): Promise<Response> {
  const parsed = new URL(url, "https://tend.invalid");
  const path = parsed.pathname;
  if(path==="/api/auth/providers"&&method==="GET"){
    const response=await fetch(SUPABASE_URL+"/auth/v1/settings",{headers:{apikey:SUPABASE_KEY},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error("Unable to check sign-in options.");
    return result(providerFlags(await response.json()));
  }
  const publicMatch = path.match(/^\/api\/churches\/by-slug\/([^/]+)(\/prayers)?$/);
  if (publicMatch) {
    const slug = decodeURIComponent(publicMatch[1]);
    if (slug === "demo") {
      if (method === "POST") return result({ ok: true, demo: true, greetingMessage: "This was a demonstration. Nothing was saved or sent." });
      return result({ slug:"demo", name:"Example Church", pastorName:"your church's pastor", greetingMessage:"This was a demonstration. Nothing was saved or sent." });
    }
    const reply = method === "GET"
      ? await supabase.rpc("tend_public_church", {p_slug:slug})
      : await (async () => {
          const args = {
            p_slug:slug,p_message:data.message,p_submission_key:data.submissionKey,
            p_category:data.category,p_name:data.submitterName || null,p_phone:data.submitterPhone || null,
            p_email:data.submitterEmail || null,
            p_anonymous:!!data.isAnonymous,p_urgent:!!data.isUrgent,p_website:data.website || "",
            p_photo_url:data.submitterPhotoUrl || null,p_photo_path:data.submitterPhotoPath || null,
          };
          const first = await supabase.rpc("tend_submit_prayer", args);
          // Production RPC may predate the p_email / photo migrations; retry without them.
          if (first.error && (first.error.code === "PGRST202" || /could not find the function/i.test(first.error.message || ""))) {
            const { p_email: _dropped, p_photo_url: _droppedUrl, p_photo_path: _droppedPath, ...legacyArgs } = args;
            return await supabase.rpc("tend_submit_prayer", legacyArgs);
          }
          return first;
        })();
    if (!reply.error && !reply.data) throw new Error("Church not found");
    return result(reply.data, reply.error);
  }
  // ---- 24/7 prayer watches: public signup surface (no sign-in required) ----
  const watchSlugMatch = path.match(/^\/api\/watches\/by-slug\/([^/]+)(?:\/(day|signup))?$/);
  if (watchSlugMatch) {
    const slug = decodeURIComponent(watchSlugMatch[1]), part = watchSlugMatch[2];
    if (!part && method === "GET") {
      const r = await supabase.rpc("tend_public_watch", { p_slug: slug });
      if (r.error || !r.data) throw new Error("Prayer watch not found.");
      return result(r.data, r.error);
    }
    if (part === "day" && method === "GET") {
      const date = parsed.searchParams.get("date");
      if (!date) throw new Error("Date is required.");
      const r = await supabase.rpc("tend_watch_day", { p_slug: slug, p_date: date });
      return result(r.data, r.error);
    }
    if (part === "signup" && method === "POST") {
      const r = await supabase.rpc("tend_signup_watch_slot", {
        p_slug: slug, p_slot_id: data.slotId, p_name: data.name, p_signup_key: data.signupKey,
        p_email: data.email || null, p_phone: data.phone || null, p_website: data.website || "",
      });
      return result(r.data, r.error);
    }
  }
  if (path === "/api/watches/cancel" && method === "POST") {
    const r = await supabase.rpc("tend_cancel_watch_signup", { p_signup_key: data.signupKey });
    return result(r.data, r.error);
  }
  const {data:session} = await supabase.auth.getSession();
  if (!session.session) throw new Error("Please sign in to access your church.");
  if (path === "/api/billing/status") return result({ configured:true, plans:[
    { id:"starter", name:"Starter", price:29, description:"For churches under 200. Unlimited requests, custom greeting." },
    { id:"growth", name:"Growth", price:49, description:"For churches 200 to 500. Multiple QR codes, CSV export." },
    { id:"large", name:"Large Church", price:99, description:"For churches 500 and up. Team accounts, priority support." },
  ] });
  const billingFn = async (fn: string, body: any) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
      method:"POST",
      headers:{
        "content-type":"application/json",
        apikey:SUPABASE_KEY,
        Authorization:`Bearer ${session.session.access_token}`,
      },
      body: JSON.stringify(body),
      signal:AbortSignal.timeout(30000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Billing request failed.");
    return result(data);
  };
  if (path === "/api/nurture/lead" && method === "POST") {
    // Public demo email capture. The edge function validates, verifies the
    // Turnstile token, and rate-limits.
    const res = await fetch(`${SUPABASE_URL}/functions/v1/capture-lead`, {
      method:"POST",
      headers:{ "content-type":"application/json", apikey:SUPABASE_KEY },
      body: JSON.stringify({ email:data.email, source:data.source || "demo", turnstileToken:data.turnstileToken || "" }),
      signal:AbortSignal.timeout(30000),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || "Could not save your email.");
    return result(out);
  }
  if (path === "/api/billing/checkout" && method === "POST") {
    return billingFn("create-checkout-session", {
      church_id:data.churchId, plan:data.plan, interval:data.interval,
    });
  }
  if (path === "/api/billing/portal" && method === "POST") {
    return billingFn("create-portal-session", { church_id:data.churchId });
  }
  if (path === "/api/billing/gift" && method === "POST") {
    // Public: no Tend account needed. The edge function validates the slug.
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-gift-checkout`, {
      method:"POST",
      headers:{ "content-type":"application/json", apikey:SUPABASE_KEY },
      body: JSON.stringify({ slug:data.slug, plan:data.plan, interval:data.interval }),
      signal:AbortSignal.timeout(30000),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || "Gift checkout failed.");
    return out;
  }
  if (path === "/api/churches" && method === "GET") {
    const r=await supabase.from("tend_churches").select(churchFields).order("created_at"); return result(r.data,r.error);
  }
  if (path === "/api/churches" && method === "POST") {
    const r=await supabase.from("tend_churches").insert({
      name:data.name,slug:data.slug,pastor_name:data.pastorName,pastor_email:session.session.user.email,
      contact_role:data.contactRole,greeting_message:data.greetingMessage,
    }).select(churchFields).single(); return result(r.data,r.error);
  }
  const churchMatch=path.match(/^\/api\/churches\/(\d+)(?:\/(greeting|prayers|stats))?$/);
  if(churchMatch){
    const id=Number(churchMatch[1]), part=churchMatch[2];
    if(part==="greeting"){
      const r=await supabase.from("tend_churches").update({greeting_message:data.greeting}).eq("id",id).select(churchFields).single(); return result(r.data,r.error);
    }
    if(part==="prayers" || part==="stats"){
      const rows:any[]=[];
      for(let offset=0;;offset+=1000){
        if(offset>=10000) throw new Error("This inbox is too large to load at once. Contact support for a paginated export.");
        let q=supabase.from("tend_prayers").select(prayerFields).eq("church_id",id).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+999);
        const status=parsed.searchParams.get("status");if(status && part==="prayers")q=q.eq("status",status);
        const batch=await q;if(batch.error)return result(null,batch.error);
        rows.push(...batch.data);if(batch.data.length<1000)break;
      }
      const r={data:rows,error:null};
      if(part==="stats"){
        const counts:Record<string,number>={new:0,praying:0,prayed_for:0,archived:0};
        for(const p of r.data || []) counts[p.status]=(counts[p.status] || 0)+1;
        return result(counts,r.error);
      }
      return result(r.data,r.error);
    }
    const r=await supabase.from("tend_churches").select(churchFields).eq("id",id).single(); return result(r.data,r.error);
  }
  const prayerMatch=path.match(/^\/api\/prayers\/(\d+)(?:\/(status|notes))?$/);
  if(prayerMatch){
    const id=Number(prayerMatch[1]);
    if(method==="GET"){const r=await supabase.from("tend_prayers").select(prayerFields).eq("id",id).single();return result(r.data,r.error);}
    const update=prayerMatch[2]==="status"?{status:data.status}:{pastor_notes:data.notes};
    const r=await supabase.from("tend_prayers").update(update).eq("id",id).select(prayerFields).single();return result(r.data,r.error);
  }
  // ---- 24/7 prayer watches: pastor management (signed in, RLS enforced) ----
  const watchFields="id,churchId:church_id,title,description,slug,startDate:start_date,endDate:end_date,slotMinutes:slot_minutes,isActive:is_active,createdAt:created_at";
  const churchWatchMatch=path.match(/^\/api\/churches\/(\d+)\/watches$/);
  if(churchWatchMatch){
    const churchId=Number(churchWatchMatch[1]);
    if(method==="GET"){
      const r=await supabase.from("tend_prayer_watches").select(watchFields).eq("church_id",churchId).order("created_at",{ascending:false});
      return result(r.data,r.error);
    }
    if(method==="POST"){
      const slug=(data.slug||data.title||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60)||`watch-${Date.now().toString(36)}`;
      const r=await supabase.from("tend_prayer_watches").insert({
        church_id:churchId,title:data.title,description:data.description||null,slug,
        start_date:data.startDate,end_date:data.endDate||null,slot_minutes:data.slotMinutes||15,
      }).select(watchFields).single();
      if(r.error) return result(null,r.error);
      // Generate the first 14 days of slots now; the day view lazily fills the rest.
      const start=new Date(data.startDate); const horizon=new Date(start); horizon.setDate(horizon.getDate()+13);
      const endLimit=data.endDate?new Date(data.endDate):horizon;
      const through=endLimit<horizon?endLimit.toISOString().slice(0,10):horizon.toISOString().slice(0,10);
      await supabase.rpc("tend_generate_watch_slots",{p_watch_id:r.data.id,p_from:data.startDate,p_to:through});
      return result(r.data,null);
    }
  }
  const watchMatch=path.match(/^\/api\/watches\/(\d+)(?:\/(day|generate|invites))?$/);
  if(watchMatch){
    const watchId=Number(watchMatch[1]), part=watchMatch[2];
    if(!part && method==="GET"){
      const r=await supabase.from("tend_prayer_watches").select(watchFields).eq("id",watchId).single();
      return result(r.data,r.error);
    }
    if(!part && method==="PATCH"){
      const r=await supabase.from("tend_prayer_watches").update({
        ...(data.title!==undefined?{title:data.title}:{}),
        ...(data.description!==undefined?{description:data.description}:{}),
        ...(data.isActive!==undefined?{is_active:data.isActive}:{}),
      }).eq("id",watchId).select(watchFields).single();
      return result(r.data,r.error);
    }
    if(!part && method==="DELETE"){
      const r=await supabase.from("tend_prayer_watches").delete().eq("id",watchId);
      return result({ok:!r.error},r.error);
    }
    if(part==="day" && method==="GET"){
      const date=parsed.searchParams.get("date");
      if(!date) throw new Error("Date is required.");
      const r=await supabase.rpc("tend_watch_day_detail",{p_watch_id:watchId,p_date:date});
      return result(r.data,r.error);
    }
    if(part==="generate" && method==="POST"){
      const r=await supabase.rpc("tend_generate_watch_slots",{p_watch_id:watchId,p_from:data.from,p_to:data.to});
      return result({generated:r.data},r.error);
    }
    if(part==="invites" && method==="GET"){
      const r=await supabase.from("tend_prayer_watch_invites").select("id,email,sentAt:sent_at,acceptedAt:accepted_at,createdAt:created_at").eq("watch_id",watchId).order("created_at",{ascending:false});
      return result(r.data,r.error);
    }
    if(part==="invites" && method==="POST"){
      // data.emails: string[] — upsert invite rows, then send via edge function.
      const emails=Array.from(new Set((data.emails||[]).map((e:string)=>e.trim().toLowerCase()).filter(Boolean)));
      if(!emails.length) throw new Error("Add at least one email address.");
      const rows=emails.map(email=>({watch_id:watchId,email}));
      const r=await supabase.from("tend_prayer_watch_invites").upsert(rows,{onConflict:"watch_id,email"}).select("id,email,token");
      if(r.error) return result(null,r.error);
      const w=await supabase.from("tend_prayer_watches").select("title,slug").eq("id",watchId).single();
      const signupUrl=`${window.location.origin}${window.location.pathname}#/w/${w.data?.slug||""}`;
      const res=await fetch(`${SUPABASE_URL}/functions/v1/send-watch-invite`,{
        method:"POST",headers:{"content-type":"application/json",apikey:SUPABASE_KEY,
          Authorization:`Bearer ${session.session.access_token}`},
        body:JSON.stringify({watchId,title:w.data?.title,signupUrl,invites:r.data}),
        signal:AbortSignal.timeout(30000),
      });
      const out=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(out.error||"Invites saved, but sending failed.");
      return result(out,null);
    }
  }
  throw new Error("This action is not available.");
}
type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {on401: UnauthorizedBehavior}) => QueryFunction<T> =
  () => async ({queryKey}) => (await apiRequest("GET",queryKey.join("/"))).json();
export const queryClient = new QueryClient({defaultOptions:{
  queries:{queryFn:getQueryFn({on401:"throw"}),refetchOnWindowFocus:true,staleTime:15000,retry:false},
  mutations:{retry:false},
}});
