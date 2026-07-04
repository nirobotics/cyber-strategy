import type { Route } from "./+types/api.auth.me";
import { getOptionalUser } from "../lib/auth.server";

export async function loader({ request }: Route.LoaderArgs) {
  return Response.json({ user: getOptionalUser(request) });
}
