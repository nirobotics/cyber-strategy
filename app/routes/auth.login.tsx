import { Form, redirect, useSearchParams } from "react-router";
import {
  CheckCircle2,
  Database,
  LockKeyhole,
  Route as StrategyIcon,
} from "lucide-react";
import type { Route } from "./+types/auth.login";
import { ThemeToggle } from "../components/theme-toggle";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const returnTo = String(formData.get("returnTo") || "/");
  throw redirect(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export default function LoginPage() {
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo") || "/";

  return (
    <main className="min-h-dvh bg-[var(--background)] px-4 py-4 text-[var(--foreground)] sm:px-6 lg:px-8">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <section className="mx-auto grid min-h-[calc(100dvh-2rem)] w-full max-w-5xl items-center gap-6 py-14 lg:grid-cols-[1.08fr_0.92fr] lg:py-10">
        <div className="min-w-0">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid size-12 shrink-0 place-items-center rounded-md bg-[var(--accent)] text-[var(--accent-foreground)]">
              <StrategyIcon className="size-6" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold leading-tight">战术数据分析</p>
              <p className="truncate text-sm text-[var(--muted)]">Cyber Strategy</p>
            </div>
          </div>

          <div className="max-w-xl">
            <p className="section-label">Cyber App</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-normal sm:text-4xl">
              策略分析工作台
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-[var(--muted)]">
              使用飞书组织身份进入，查看队伍表现、对比数据和赛事策略信息。
            </p>
          </div>

          <div className="mt-8 grid gap-2 sm:grid-cols-3">
            <LoginSignal icon={LockKeyhole} title="组织登录" text="飞书身份校验" />
            <LoginSignal icon={Database} title="数据闭环" text="Supabase 服务端读取" />
            <LoginSignal icon={CheckCircle2} title="权限控制" text="管理员操作审计" />
          </div>
        </div>

        <Form method="post" className="card grid gap-5 p-5 shadow-sm sm:p-6">
          <input type="hidden" name="returnTo" value={returnTo} />
          <div>
            <p className="section-label">登录</p>
            <h2 className="mt-2 text-2xl font-semibold">进入 Cyber Strategy</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              仅支持 NI Robotics 飞书组织成员访问。
            </p>
          </div>

          <button
            type="submit"
            className="btn btn-primary h-11 w-full text-base"
          >
            <FeishuLogo />
            使用飞书登录
          </button>

          <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-xs leading-5 text-[var(--muted)]">
            登录成功后会创建应用会话；业务数据通过服务端读取，不会向浏览器暴露服务密钥。
          </div>
        </Form>
      </section>
    </main>
  );
}

function LoginSignal({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof LockKeyhole;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--panel)] p-3">
      <Icon className="mb-3 size-4 text-[var(--accent)]" aria-hidden />
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{text}</p>
    </div>
  );
}

function FeishuLogo() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" role="img" aria-label="飞书">
      <path fill="#00D6B9" d="M3 4.5 10.8 9v5.2L3 9.7V4.5Z" />
      <path fill="#3370FF" d="M10.8 9 21 3.1v5.2l-10.2 5.9V9Z" />
      <path fill="#1456F0" d="m10.8 14.2 4.4 2.5L21 13.4v5.2l-5.8 3.3-4.4-2.5v-5.2Z" />
      <path fill="#00BFA5" d="M3 9.7 10.8 14.2v5.2L3 14.9V9.7Z" />
    </svg>
  );
}
