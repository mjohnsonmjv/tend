import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Church } from "@shared/schema";
import { SiteHeader,SiteFooter } from "@/components/SiteHeader";
export default function MyChurches(){
  const {data, isLoading,error}=useQuery<Church[]>({queryKey:["/api/churches"]});
  return <><SiteHeader/><main className="max-w-3xl mx-auto p-8"><h1 className="text-3xl mb-8">Your churches</h1>
    {isLoading?<p role="status">Loading your churches…</p>:error?<p role="alert">Unable to load your churches. Please sign in again.</p>:data?.length?<div className="space-y-4">{data.map(c=><Link key={c.id} href={`/church/${c.id}/dashboard`} className="block border rounded-lg p-6 hover:bg-muted" data-testid={`link-church-${c.id}`}><h2 className="text-xl">{c.name}</h2><p className="text-sm text-muted-foreground">Open prayer inbox</p></Link>)}</div>:<p className="mb-6">Create your first church to get your prayer QR code.</p>}
    <Link href="/signup" className="brand-button mt-6" data-testid="link-create-another-church">Create a church</Link>
  </main><SiteFooter/></>;
}
