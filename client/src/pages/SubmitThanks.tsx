import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/Logo";
import { Heart } from "lucide-react";

interface PublicChurch {
  slug: string;
  name: string;
  pastorName: string;
  greetingMessage: string;
}

export default function SubmitThanks() {
  const { slug } = useParams<{ slug: string }>();
  const { data: church } = useQuery<PublicChurch>({
    queryKey: ["/api/churches/by-slug", slug],
  });

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="max-w-md">
        <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-6">
          <Heart className="h-7 w-7" strokeWidth={1.75} />
        </div>
        <h1 className="font-serif text-4xl text-foreground leading-tight mb-4">
          {slug === "demo" ? "That’s how simple sharing can be." : "Your request was received."}
        </h1>
        <p className="font-serif italic text-xl text-primary leading-relaxed">
          "{church?.greetingMessage || "Thank you for sharing."}"
        </p>
        {church?.pastorName && (
          <p className="mt-2 text-sm text-muted-foreground">From {church.pastorName}</p>
        )}

        <div className="mt-16 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Logo size={16} />
          <span className="font-serif italic">Tend</span>
        </div>
      </div>
    </div>
  );
}
