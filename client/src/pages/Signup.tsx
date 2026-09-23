import { useState } from "react";
import { useLocation,Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest,queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form,FormField,FormItem,FormLabel,FormControl,FormMessage,FormDescription } from "@/components/ui/form";
import { SiteHeader,SiteFooter } from "@/components/SiteHeader";
import { useAuth } from "@/components/Auth";
import type { Church } from "@shared/schema";
import { publicChurchUrl } from "@/lib/inbox";

const schema=z.object({
  name:z.string().trim().min(2,"Enter a church name.").max(120),
  slug:z.string().min(3,"Use at least 3 characters.").max(40).regex(/^[a-z0-9][a-z0-9-]+$/,"Use lowercase letters, numbers, and hyphens.").refine(v=>v!=="demo","Please choose another church URL."),
  pastorName:z.string().trim().min(2,"Add a public care-team name.").max(100),
  greetingMessage:z.string().trim().min(1,"Add a confirmation message.").max(300,"Keep the greeting within 300 characters."),
});
export default function Signup(){
  const {session}=useAuth();const [,navigate]=useLocation();
  const [step,setStep]=useState(1);const [slugEdited,setSlugEdited]=useState(false);
  const form=useForm<z.infer<typeof schema>>({resolver:zodResolver(schema),defaultValues:{name:"",slug:"",pastorName:"Care team",greetingMessage:"Thank you for sharing. Your request has been received."}});
  const values=form.watch();
  const create=useMutation({mutationFn:async(v:z.infer<typeof schema>)=>(await apiRequest("POST","/api/churches",v)).json() as Promise<Church>,onSuccess:church=>{queryClient.invalidateQueries({queryKey:["/api/churches"]});navigate(`/church/${church.id}/qr`)}});
  async function next(){if(await form.trigger(["name","slug","pastorName"]))setStep(2)}
  return <><SiteHeader/><main className="max-w-3xl mx-auto px-5 py-12">
    <p className="eyebrow">Set up your church · {step} of 2</p><h1 className="text-3xl mb-3">{step===1?"Make a place for prayer.":"Welcome people in your own words."}</h1><p className="text-muted-foreground mb-8">No payment required during the pilot. Your QR code is ready as soon as you finish.</p>
    <Form {...form}><form className="border rounded-xl bg-card p-6 sm:p-8 space-y-6" onSubmit={form.handleSubmit(v=>create.mutate(v))}>
      {step===1?<>
        <FormField control={form.control} name="name" render={({field})=><FormItem><FormLabel>Church name</FormLabel><FormControl><Input {...field} maxLength={120} data-testid="input-church-name" placeholder="Grace Community Church" onChange={e=>{field.onChange(e);if(!slugEdited)form.setValue("slug",e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40))}}/></FormControl><FormMessage/></FormItem>}/>
        <FormField control={form.control} name="slug" render={({field})=><FormItem><FormLabel>Church URL name</FormLabel><FormControl><Input {...field} maxLength={40} data-testid="input-slug" onChange={e=>{setSlugEdited(true);field.onChange(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,""))}} placeholder="grace-community"/></FormControl><FormDescription className="break-all">{publicChurchUrl(values.slug||"your-church")}</FormDescription><FormMessage/></FormItem>}/>
        <FormField control={form.control} name="pastorName" render={({field})=><FormItem><FormLabel>Pastor or care-team display name</FormLabel><FormControl><Input {...field} maxLength={100} data-testid="input-pastor-name"/></FormControl><FormDescription>Visible to your congregation. You can use “Care team” instead of a personal name.</FormDescription><FormMessage/></FormItem>}/>
        <p className="text-sm text-muted-foreground break-all">Private account email: {session?.user.email}</p>
        <Button type="button" className="w-full min-h-12" data-testid="button-setup-next" onClick={next}>Continue</Button>
      </>:<>
        <FormField control={form.control} name="greetingMessage" render={({field})=><FormItem><FormLabel>After someone shares a request</FormLabel><FormControl><Textarea {...field} rows={3} maxLength={300} data-testid="input-greeting"/></FormControl><FormDescription>{values.greetingMessage.length}/300 characters. A receipt confirmation, not a promise that someone has already prayed.</FormDescription><FormMessage/></FormItem>}/>
        <div className="rounded-lg bg-muted/60 p-6" data-testid="card-welcome-preview"><p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Congregation preview</p><h2 className="text-xl">{values.name}</h2><p className="my-3">{values.greetingMessage}</p><p className="text-sm text-muted-foreground">From {values.pastorName}</p></div>
        {create.isError&&<p role="alert" className="text-destructive text-sm" data-testid="text-setup-error">{create.error.message}</p>}
        <div className="flex gap-3"><Button type="button" variant="outline" disabled={create.isPending} className="min-h-12" onClick={()=>{create.reset();setStep(1)}}>Back</Button><Button type="submit" className="flex-1 min-h-12" disabled={create.isPending} data-testid="button-create-church">{create.isPending?"Creating your church…":"Create church & get QR code"}</Button></div>
      </>}
    </form></Form><p className="mt-6 text-xs text-muted-foreground leading-relaxed">Only your signed-in account can access this church’s inbox. Your account email is not included on the public prayer form. SMS and billing are not active.</p><Link href="/app" className="inline-block mt-5 underline text-sm">Back to my churches</Link>
  </main><SiteFooter/></>;
}
