export async function GET() {
  return Response.json({
    ok: true,
    renderConfig: process.env.RENDER_CONFIG ?? "unknown",
  });
}
