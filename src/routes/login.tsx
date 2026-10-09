import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, LayoutList, Radio, ShieldCheck } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authApi } from "@/features/auth/api";
import { GoogleSignInButton } from "@/features/auth/components/google-sign-in-button";
import { googleLoginErrorMessage } from "@/features/auth/google";
import { sessionQueryOptions, useAuthProviders } from "@/features/auth/hooks";
import { safeReturnPath } from "@/features/auth/redirect";
import { useCrossTabSession } from "@/features/auth/use-session-sync";
import { getErrorMessage, isApiError } from "@/lib/api/errors";

const noop = () => undefined;

const schema = z.object({
  email: z.string().trim().min(1, "Nhập email công việc.").email("Email chưa đúng định dạng."),
  password: z.string().min(1, "Nhập mật khẩu.").max(4096)
});
type Values = z.infer<typeof schema>;

const loginErrorMessage = (error: unknown) => {
  if (isApiError(error)) {
    if (error.code === "AUTH_INVALID" || error.status === 401)
      return "Email hoặc mật khẩu không đúng.";
    if (error.code === "LOGIN_RATE_LIMITED") return getErrorMessage(error);
  }
  return getErrorMessage(error, "Chưa đăng nhập được. Vui lòng thử lại.");
};

export const LoginRoute = () => {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const stateFrom = (location.state as { from?: unknown } | null)?.from;
  const next = safeReturnPath(params.get("next")) ?? safeReturnPath(stateFrom) ?? "/";
  // The Google callback reports failures as ?error=<code>; show it once, then drop it from the URL.
  const [googleError] = useState(() => googleLoginErrorMessage(params.get("error")));
  useEffect(() => {
    if (!params.has("error")) {
      return;
    }
    const rest = new URLSearchParams(params);
    rest.delete("error");
    setParams(rest, { replace: true });
  }, [params, setParams]);
  const providers = useAuthProviders();

  // If the cookies are still valid (or refreshable), skip the form.
  const session = useQuery({ ...sessionQueryOptions, retry: false });
  // Signed in from another tab meanwhile: re-read the session and move on (BUG-WK-16).
  useCrossTabSession(null, noop);
  if (session.data && !session.isFetching) {
    return <Navigate to={next} replace />;
  }

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <BrandPanel />
      <main className="flex min-h-dvh flex-col px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-10">
        <div className="flex items-center gap-2.5 lg:hidden">
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Nesso Work</span>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="flex w-full max-w-[380px] flex-col gap-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-semibold tracking-[-0.02em]">Đăng nhập</h1>
              <p className="text-sm text-foreground-muted">
                Dùng tài khoản công việc do quản trị viên cấp.
              </p>
            </div>
            <div className="flex flex-col gap-5">
              <LoginForm next={next} initialError={googleError} />
              {providers.data?.google ? (
                <>
                  <div className="flex items-center gap-3 text-xs text-foreground-subtle">
                    <span aria-hidden="true" className="h-px flex-1 bg-border" />
                    <span>hoặc</span>
                    <span aria-hidden="true" className="h-px flex-1 bg-border" />
                  </div>
                  <GoogleSignInButton next={next} />
                </>
              ) : null}
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-foreground-subtle lg:text-left">
          Gặp sự cố đăng nhập? Liên hệ quản trị viên tổ chức của bạn.
        </p>
      </main>
    </div>
  );
};

const LoginForm = ({ next, initialError }: { next: string; initialError: string | null }) => {
  const ids = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reveal, setReveal] = useState(false);
  const [formError, setFormError] = useState<string | null>(initialError);
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched"
  });

  const login = useMutation({
    mutationFn: (values: Values) => authApi.login(values),
    meta: { errorMessage: false },
    onSuccess: async () => {
      // Never show a previous user's cached data.
      queryClient.removeQueries();
      try {
        await queryClient.fetchQuery(sessionQueryOptions);
      } catch {
        // The gate retries / explains; navigation still proceeds.
      }
      void navigate(next, { replace: true });
    },
    onError: (error) => setFormError(loginErrorMessage(error))
  });

  const pending = login.isPending || login.isSuccess;

  return (
    <form
      noValidate
      aria-describedby={formError ? `${ids}-error` : undefined}
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        setFormError(null);
        void handleSubmit((values) => login.mutate(values))(event);
      }}
    >
      <Field data-invalid={Boolean(formState.errors.email)}>
        <FieldLabel htmlFor={`${ids}-email`}>Email</FieldLabel>
        <Input
          id={`${ids}-email`}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoFocus
          placeholder="ten@congty.vn"
          className="h-10"
          aria-invalid={Boolean(formState.errors.email)}
          {...register("email")}
        />
        <FieldError errors={[formState.errors.email]} />
      </Field>

      <Field data-invalid={Boolean(formState.errors.password)}>
        <FieldLabel htmlFor={`${ids}-password`}>Mật khẩu</FieldLabel>
        <div className="relative">
          <Input
            id={`${ids}-password`}
            type={reveal ? "text" : "password"}
            autoComplete="current-password"
            className="h-10 pr-10"
            aria-invalid={Boolean(formState.errors.password)}
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setReveal((value) => !value)}
            aria-label={reveal ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            aria-pressed={reveal}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-foreground-subtle outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <FieldError errors={[formState.errors.password]} />
      </Field>

      {formError ? (
        <p
          id={`${ids}-error`}
          role="alert"
          className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] text-danger"
        >
          {formError}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-10 w-full text-sm" disabled={pending}>
        {pending ? <Spinner /> : null}
        {pending ? "Đang đăng nhập…" : "Đăng nhập"}
        {pending ? null : <ArrowRight data-icon="inline-end" />}
      </Button>
    </form>
  );
};

const BrandMark = () => (
  <span
    aria-hidden="true"
    className="bg-brand-fill flex size-8 items-center justify-center rounded-[10px] text-sm font-semibold text-brand-foreground shadow-sm"
  >
    N
  </span>
);

const highlights = [
  {
    icon: LayoutList,
    title: "Dự án rõ ràng",
    text: "Dự án → danh sách → công việc và việc con, theo dõi trong một nơi."
  },
  {
    icon: Radio,
    title: "Cập nhật tức thì",
    text: "Thay đổi của đồng đội hiện ra ngay, không cần tải lại trang."
  },
  {
    icon: ShieldCheck,
    title: "Phân quyền chặt chẽ",
    text: "Vai trò và quyền truy cập dự án được kiểm soát ở máy chủ."
  }
];

const BrandPanel = () => (
  <aside className="relative hidden overflow-hidden border-r bg-canvas lg:flex lg:flex-col lg:justify-between lg:p-12">
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -top-40 -left-40 size-[36rem] rounded-full opacity-[0.18] blur-3xl dark:opacity-25"
      style={{ background: "var(--brand-gradient)" }}
    />
    <div className="relative flex items-center gap-2.5">
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-[-0.01em]">Nesso Work</span>
    </div>

    <div className="relative flex max-w-md flex-col gap-10">
      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-medium text-brand-text">Không gian làm việc nội bộ</p>
        <h2 className="text-[32px] leading-[1.15] font-semibold tracking-[-0.025em] text-balance">
          Mọi dự án, công việc và trao đổi của đội ngũ — ở cùng một nơi.
        </h2>
      </div>
      <ul className="flex flex-col gap-5">
        {highlights.map((item) => (
          <li key={item.title} className="flex gap-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-surface text-foreground-muted shadow-xs">
              <item.icon className="size-4" aria-hidden="true" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{item.title}</span>
              <span className="text-[13px] leading-relaxed text-foreground-muted">{item.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>

    <p className="relative text-xs text-foreground-subtle">
      © {new Date().getFullYear()} Nesso · Bảo mật bằng phiên HttpOnly và CSRF.
    </p>
  </aside>
);
