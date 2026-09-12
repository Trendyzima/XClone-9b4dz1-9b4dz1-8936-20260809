import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Placeholder intentionally not written yet: canonical inbox implementation requires schema verification.
Deno.serve(() => new Response(JSON.stringify({ error: "Federation inbox is being initialized" }), { status: 503, headers: { "Content-Type": "application/json" } }));
