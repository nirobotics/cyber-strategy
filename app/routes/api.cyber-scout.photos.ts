import type { Route } from "./+types/api.cyber-scout.photos";
import { requireUser } from "../lib/auth.server";
import { downloadCyberScoutPhoto } from "../lib/cyber-scout.server";

export async function loader({ request }: Route.LoaderArgs) {
  await requireUser(request);
  const path = new URL(request.url).searchParams.get("path") ?? "";
  return downloadCyberScoutPhoto(path);
}
