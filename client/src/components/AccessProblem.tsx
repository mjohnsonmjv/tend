import { Link } from "wouter";
import { Button } from "@/components/ui/button";
export function AccessProblem({retry}:{retry?:()=>void}){
  return <section role="alert" className="max-w-xl mx-auto p-8 sm:p-12" data-testid="access-problem">
    <h1 className="text-xl mb-3">We couldn’t open this page.</h1>
    <p className="text-muted-foreground leading-relaxed mb-6">The link may be unavailable, your account may not have access, or the connection may have dropped. Your saved data has not been changed.</p>
    <div className="flex flex-wrap gap-3"><Link href="/app" className="brand-button" data-testid="link-access-churches">My churches</Link>{retry&&<Button variant="outline" className="min-h-12" onClick={retry} data-testid="button-retry">Try again</Button>}</div>
  </section>;
}
