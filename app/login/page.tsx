import { createClient } from "@/lib/supabase/server";
import { login, logout } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
      <div className="w-full max-w-sm border border-border bg-surface rounded-lg p-8">
        <h1 className="text-lg font-semibold text-gold mb-1">NXS Staff Login</h1>
        <p className="text-sm text-muted mb-6">Sign in with your staff account.</p>

        {user ? (
          <div className="space-y-4">
            <p className="text-sm">
              Signed in as <span className="text-foreground">{user.email}</span>.
            </p>
            <form action={logout}>
              <button
                type="submit"
                className="w-full rounded-md border border-border py-2 text-sm hover:bg-white/5"
              >
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <form action={login} className="space-y-4">
            <input type="hidden" name="next" value={next ?? "/dashboard"} />
            {error && (
              <p className="text-sm text-red-400 border border-red-900/50 bg-red-950/30 rounded-md px-3 py-2">
                {error}
              </p>
            )}
            <div>
              <label htmlFor="email" className="block text-xs text-muted mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="username"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs text-muted mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-gold text-background font-medium py-2 text-sm hover:bg-gold-hover"
            >
              Sign In
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
