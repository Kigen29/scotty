import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Scotty has a single operator, so there's only sign-in. */
const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
    else navigate("/");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-[340px]">
        <div className="mb-8 flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm bg-primary" />
          <span className="text-[15px] font-semibold tracking-tight">Scotty</span>
          <span className="text-[13px] text-muted-foreground">Code 5 Developers</span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email" className="text-[12px]">
              Email
            </Label>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password" className="text-[12px]">
              Password
            </Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error ? (
            <p role="alert" className="text-[12px] text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default Auth;
