// Minimal Deno ambient types so `tsc` can check this edge function.
// Not imported at runtime; Supabase deploys index.ts on Deno.
declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
  function serve(
    handler: (req: Request) => Response | Promise<Response>,
  ): void;
}
