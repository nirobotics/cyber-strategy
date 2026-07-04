import { Form, redirect, useSearchParams } from "react-router";
import { Route as StrategyIcon } from "lucide-react";
import type { Route } from "./+types/auth.login";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") || "/");
  throw redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export default function LoginPage() {
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/";
  const signedOut = params.get("signedOut") === "1";

  return (
    <main className="grid min-h-dvh bg-[var(--background)] px-5 py-12 text-[var(--foreground)]">
      <section className="mx-auto flex w-full max-w-[800px] flex-col justify-center">
        <div className="mb-10 flex items-center gap-6 max-sm:gap-4">
          <div className="grid size-20 shrink-0 place-items-center rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] max-sm:size-16">
            <StrategyIcon className="size-10 max-sm:size-8" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-5xl font-semibold leading-tight tracking-normal max-sm:text-3xl">
              Cyber Strategy
            </h1>
            <p className="mt-2 truncate text-2xl font-semibold text-[var(--muted)] max-sm:text-lg">
              战术数据分析系统
            </p>
          </div>
        </div>

        <div className="mb-12 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-6 py-5 text-2xl font-semibold text-[var(--muted)] max-sm:text-lg">
          {signedOut ? "已退出当前应用 session。" : "请使用飞书登录继续访问。"}
        </div>

        <Form method="post">
          <input type="hidden" name="returnTo" value={returnTo} />
          <button
            type="submit"
            className="inline-flex h-20 w-full items-center justify-center gap-5 rounded-lg border border-transparent bg-[var(--accent)] px-5 text-3xl font-semibold text-[var(--accent-foreground)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 focus:ring-offset-[var(--background)] max-sm:h-16 max-sm:text-2xl"
          >
            <FeishuLogo />
            飞书登录
          </button>
        </Form>
      </section>
    </main>
  );
}

function FeishuLogo() {
  return (
    <svg className="size-8 max-sm:size-6" viewBox="0 0 24 24" role="img" aria-label="飞书">
      <path fill="#00D6B9" d="M3 4.5 10.8 9v5.2L3 9.7V4.5Z" />
      <path fill="#3370FF" d="M10.8 9 21 3.1v5.2l-10.2 5.9V9Z" />
      <path fill="#1456F0" d="m10.8 14.2 4.4 2.5L21 13.4v5.2l-5.8 3.3-4.4-2.5v-5.2Z" />
      <path fill="#00BFA5" d="M3 9.7 10.8 14.2v5.2L3 14.9V9.7Z" />
    </svg>
  );
}
