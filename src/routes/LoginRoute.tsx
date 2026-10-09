import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";

import { LoginRequestSchema } from "../contracts";
import { apiClient, ApiClientError } from "../lib/api-client.js";

export const LoginRoute = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const state = location.state as { from?: string } | null;
  const from = state?.from ?? "/";

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: ({ signal }) => apiClient.getCurrentUser(signal),
    retry: false
  });

  const loginMutation = useMutation({
    mutationFn: apiClient.login,
    onSuccess: (session) => {
      queryClient.setQueryData(["auth", "me"], session.user);
      void navigate(from, { replace: true });
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.statusCode === 401) {
        setFormError("Email hoặc mật khẩu không đúng.");
        return;
      }

      setFormError("Hiện chưa đăng nhập được. Kiểm tra API rồi thử lại.");
    }
  });

  if (meQuery.data) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const parsed = LoginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      setFormError("Nhập email hợp lệ và mật khẩu.");
      return;
    }

    loginMutation.mutate(parsed.data);
  };

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-label="Đăng nhập">
        <div className="auth-brand">
          <div className="brand-mark" aria-hidden="true">
            N
          </div>
          <div>
            <p className="brand-name">Nesso Work</p>
            <p className="brand-subtitle">Không gian làm việc bảo mật</p>
          </div>
        </div>

        <div className="auth-heading">
          <ShieldCheck size={24} />
          <h1>Đăng nhập</h1>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <div className="auth-input-wrap">
              <Mail size={16} />
              <input
                autoComplete="email"
                inputMode="email"
                name="email"
                placeholder="example@gmail.com"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>Mật khẩu</span>
            <div className="auth-input-wrap">
              <LockKeyhole size={16} />
              <input
                autoComplete="current-password"
                name="password"
                placeholder="Mật khẩu"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </div>
          </label>

          {formError ? <p className="auth-error">{formError}</p> : null}

          <button className="primary-button auth-submit" disabled={loginMutation.isPending} type="submit">
            <span>{loginMutation.isPending ? "Đang đăng nhập" : "Đăng nhập"}</span>
          </button>
        </form>
      </section>
    </main>
  );
};

