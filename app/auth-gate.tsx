"use client";

import { FormEvent, useEffect, useState } from "react";
import { embeddedSessionReady, supabase } from "./lib/supabase";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      await embeddedSessionReady;
      const { data } = await supabase.auth.getUser();
      if (active) {
        setAllowed(Boolean(data.user));
        setChecking(false);
      }
    })();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAllowed(Boolean(session?.user)));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const requestUrl = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      const isApiRequest = requestUrl.startsWith("/api/") || requestUrl.startsWith(`${window.location.origin}/api/`);
      if (!isApiRequest) return nativeFetch(input, init);

      const { data } = await supabase.auth.getSession();
      const headers = new Headers(input instanceof Request ? input.headers : undefined);
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
      return nativeFetch(input, { ...init, headers });
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError("Correo o contraseña incorrectos.");
    setBusy(false);
  }

  if (checking) return <main className="auth-screen"><div className="auth-card"><h1>Rotación</h1><p>Validando acceso…</p></div></main>;
  if (!allowed) return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={login}>
        <span className="auth-badge">NOGASA</span>
        <h1>Dashboard de Rotación</h1>
        <p>Ingrese con las mismas credenciales del Portal Nogasa.</p>
        <label>Correo<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label>
        <label>Contraseña<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>
        {error && <div className="auth-error">{error}</div>}
        <button type="submit" disabled={busy}>{busy ? "Ingresando…" : "Iniciar sesión"}</button>
      </form>
    </main>
  );
  return <>{children}</>;
}
