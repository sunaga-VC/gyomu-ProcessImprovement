import { FormEvent, useState } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const { ready, session, configured, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!ready) {
    return <div className="min-h-screen grid place-items-center text-slate-500">読み込み中…</div>;
  }

  if (!configured) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <p className="text-sm text-slate-600">
          Supabase の設定（VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY）がありません。
        </p>
      </div>
    );
  }

  if (session) return <Redirect to="/dashboard" />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await signIn(email.trim(), password);
    setSubmitting(false);
    if (result.error) setError(result.error);
  }

  return (
    <div className="min-h-screen grid place-items-center bg-slate-100 px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-lg font-semibold text-slate-900">業務改善管理</h1>
          <p className="mt-1 text-sm text-slate-500">メールアドレスとパスワードでログイン</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">メール</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">パスワード</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "ログイン中…" : "ログイン"}
        </Button>
      </form>
    </div>
  );
}
