import { cookies } from "next/headers";
import { SSRPageComposer } from "@/rendering/SSRPageComposer";
import { getManifest } from "@/scenarios/loadManifest";

/**
 * Classic blocking SSR (classic build only, cacheComponents disabled).
 * force-dynamic prevents any static optimization; the response is a single
 * HTML document produced entirely at request time.
 */
export const dynamic = "force-dynamic";

export default async function SSRPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  const cookieStore = await cookies();
  const userId = cookieStore.get("BENCH_USER_ID")?.value;
  return <SSRPageComposer manifest={getManifest(scenarioId)} userId={userId} />;
}
