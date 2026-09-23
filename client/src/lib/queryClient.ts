import { QueryClient, type QueryFunction } from "@tanstack/react-query";
import { supabase,SUPABASE_URL,SUPABASE_KEY } from "./supabase";
import { providerFlags } from "./oauth-core";

const churchFields = "id,slug,name,pastorName:pastor_name,pastorEmail:pastor_email,greetingMessage:greeting_message,plan,createdAt:created_at";
const prayerFields = "id,churchId:church_id,submitterName:submitter_name,submitterPhone:submitter_phone,submitterEmail:submitter_email,message,category,isAnonymous:is_anonymous,isUrgent:is_urgent,isPrivate:is_private,status,pastorNotes:pastor_notes,createdAt:created_at";
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
      : await supabase.rpc("tend_submit_prayer", {
          p_slug:slug,p_message:data.message,p_submission_key:data.submissionKey,
          p_category:data.category,p_name:data.submitterName || null,p_phone:data.submitterPhone || null,
          p_anonymous:!!data.isAnonymous,p_urgent:!!data.isUrgent,p_website:data.website || "",
        });
    if (!reply.error && !reply.data) throw new Error("Church not found");
    return result(reply.data, reply.error);
  }
  const {data:session} = await supabase.auth.getSession();
  if (!session.session) throw new Error("Please sign in to access your church.");
  if (path === "/api/billing/status") return result({ configured:false, plans:[] });
  if (path === "/api/churches" && method === "GET") {
    const r=await supabase.from("tend_churches").select(churchFields).order("created_at"); return result(r.data,r.error);
  }
  if (path === "/api/churches" && method === "POST") {
    const r=await supabase.from("tend_churches").insert({
      name:data.name,slug:data.slug,pastor_name:data.pastorName,pastor_email:session.session.user.email,
      greeting_message:data.greetingMessage,
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
  throw new Error("This action is not available.");
}
type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {on401: UnauthorizedBehavior}) => QueryFunction<T> =
  () => async ({queryKey}) => (await apiRequest("GET",queryKey.join("/"))).json();
export const queryClient = new QueryClient({defaultOptions:{
  queries:{queryFn:getQueryFn({on401:"throw"}),refetchOnWindowFocus:true,staleTime:15000,retry:false},
  mutations:{retry:false},
}});
