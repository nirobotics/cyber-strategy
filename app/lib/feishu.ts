export function startFeishuLogin(returnTo = "/") {
  const url = new URL("/api/auth/login", location.origin);
  url.searchParams.set("returnTo", returnTo);
  location.assign(url.toString());
}
