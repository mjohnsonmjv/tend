import { useParams } from "wouter";
import { useQuery,useMutation } from "@tanstack/react-query";
import { apiRequest,queryClient } from "@/lib/queryClient";
import { DashboardShell } from "@/components/DashboardShell";
import { Inbox } from "@/components/Inbox";
import { AccessProblem } from "@/components/AccessProblem";
import { Skeleton } from "@/components/ui/skeleton";
import type { Church,PrayerRequest,Status } from "@shared/schema";

export default function Dashboard(){
  const {id}=useParams<{id:string}>();const churchId=Number(id);
  const church=useQuery<Church>({queryKey:["/api/churches",churchId]});
  const prayers=useQuery<PrayerRequest[]>({queryKey:["/api/churches",churchId,"prayers"],enabled:!!church.data,refetchInterval:30000});
  const change=useMutation({mutationFn:async({id,status}:{id:number;status:Status})=>(await apiRequest("PATCH",`/api/prayers/${id}/status`,{status})).json(),onSuccess:()=>queryClient.invalidateQueries({queryKey:["/api/churches",churchId]})});
  return <DashboardShell church={church.data}>{church.isError||prayers.isError?<AccessProblem retry={()=>{church.refetch();prayers.refetch()}}/>:
    church.isLoading||prayers.isLoading?<div className="p-8 space-y-5"><Skeleton className="h-16"/><Skeleton className="h-44"/><Skeleton className="h-44"/></div>:
    <div className="max-w-5xl mx-auto p-5 sm:p-10"><Inbox rows={prayers.data||[]} churchId={churchId} onStatus={(id,status)=>change.mutate({id,status})} pending={change.isPending} refresh={()=>prayers.refetch()} refreshing={prayers.isFetching} error={change.error?.message}/></div>}</DashboardShell>;
}
