import { Form, Link, redirect, useNavigation, useSearchParams } from "react-router";
import { Route as StrategyIcon } from "lucide-react";
import type { Route } from "./+types/auth.login";
import { AppFooter } from "../components/app-footer";
import { ThemeToggle } from "../components/theme-toggle";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") || "/");
  throw redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export default function LoginPage() {
  const [params] = useSearchParams();
  const navigation = useNavigation();
  const returnTo = params.get("returnTo") || "/";
  const signedOut = params.get("signedOut") === "1";
  const demoLoading = navigation.location?.pathname === "/demo";

  return (
    <>
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        <div className="fixed right-4 top-4 sm:right-6 sm:top-6">
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--accent)] text-[var(--accent-foreground)]">
            <StrategyIcon className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-normal">
              Cyber Strategy
            </h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              战术数据分析系统
            </p>
          </div>
        </div>

        <p className="mt-3 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--muted)]">
          {signedOut ? "已退出当前应用 session。" : "请使用飞书登录继续访问。"}
        </p>

        <Form method="post" className="mt-6">
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            className="inline-flex w-full items-center justify-center rounded-md bg-[var(--accent)] px-4 py-2 text-base font-normal text-[var(--accent-foreground)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
          >
            <FeishuLogo />
            飞书登录
          </button>
        </Form>
        <Link
          to="/demo"
          prefetch="render"
          aria-disabled={demoLoading}
          className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-base font-medium text-[var(--foreground)] transition hover:bg-[var(--background)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)] aria-disabled:pointer-events-none aria-disabled:opacity-60"
        >
          {demoLoading ? "Demo 加载中…" : "进入 Demo"}
        </Link>
      </main>
      <AppFooter version="2026.1.44" />
    </>
  );
}

function FeishuLogo() {
  return (
    <svg className="mr-2 size-5" viewBox="0 0 24 24" role="img" aria-label="飞书">
      <path fill="#00D6B9" d="M3 4.5 10.8 9v5.2L3 9.7V4.5Z" />
      <path fill="#3370FF" d="M10.8 9 21 3.1v5.2l-10.2 5.9V9Z" />
      <path fill="#1456F0" d="m10.8 14.2 4.4 2.5L21 13.4v5.2l-5.8 3.3-4.4-2.5v-5.2Z" />
      <path fill="#00BFA5" d="M3 9.7 10.8 14.2v5.2L3 14.9V9.7Z" />
    </svg>
  );
}
