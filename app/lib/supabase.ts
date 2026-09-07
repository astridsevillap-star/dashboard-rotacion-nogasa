import { createClient } from "@supabase/supabase-js";

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://shgnuihnxoahsvrnntfq.supabase.co";
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "sb_publishable_TGNnuqnajrAZ6m2_XyklzA_LqZoVKrS";

export const supabase = createClient(supabaseUrl, supabaseKey);

const trustedPortalOrigins = new Set([
  "https://portal-nogasa.vercel.app",
  "https://portal-nogasa-astridsevillap-star-s.vercel.app",
]);

export const embeddedSessionReady = new Promise<void>((resolve) => {
  if (typeof window === "undefined" || window.self === window.top) {
    resolve();
    return;
  }

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    resolve();
  };

  window.addEventListener("message", async (event) => {
    if (!trustedPortalOrigins.has(event.origin) || event.source !== window.parent) return;
    if (event.data?.type !== "nogasa-auth-session") return;
    const access_token = event.data.accessToken;
    const refresh_token = event.data.refreshToken;
    if (typeof access_token !== "string" || typeof refresh_token !== "string") return;
    await supabase.auth.setSession({ access_token, refresh_token });
    finish();
  });

  window.parent.postMessage({ type: "nogasa-auth-request" }, "*");
  window.setTimeout(finish, 3000);
});

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}
