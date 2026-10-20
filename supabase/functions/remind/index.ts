// Sends the play-day notifications. Called every 5 minutes by pg_cron (see migrations/20261107120000_push_reminders.sql);
// the database decides who gets what and when (claim_reminders), so calling it more often never sends twice.
// POST {"test": true} with a user's login token sends a test notification to that user's phones.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const TEXT: Record<string, Record<string, string>> = {
  en: { day: "🏸 Badminton today at {time}. Are you coming? Tap to answer.", last: "🏸 Last call: answers close in 30 minutes. Are you coming?", test: "🏸 Notifications work!" },
  ro: { day: "🏸 Badminton azi la {time}. Vii? Atinge ca să răspunzi.", last: "🏸 Ultima chemare: răspunsurile se închid în 30 de minute. Vii?", test: "🏸 Notificările funcționează!" },
  hr: { day: "🏸 Badminton danas u {time}. Dolaziš? Dodirni za odgovor.", last: "🏸 Zadnji poziv: odgovori se zatvaraju za 30 minuta. Dolaziš?", test: "🏸 Obavijesti rade!" },
  sv: { day: "🏸 Badminton i dag kl. {time}. Kommer du? Tryck för att svara.", last: "🏸 Sista chansen: svaren stängs om 30 minuter. Kommer du?", test: "🏸 Aviseringar fungerar!" },
};
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

async function keys() {   // created once, on the first run
  let { data } = await sb.from("push_keys").select("*").maybeSingle();
  if (!data) {
    const k = webpush.generateVAPIDKeys();
    await sb.from("push_keys").upsert({ id: true, public: k.publicKey, private: k.privateKey }, { ignoreDuplicates: true });
    ({ data } = await sb.from("push_keys").select("*").single());   // two first runs at once: both use the pair that was stored
  }
  webpush.setVapidDetails("https://github.com/radulescugciprian/Badminton-match", data.public, data.private);
}

async function send(rows: { endpoint: string; p256dh: string; auth: string; kind: string; play?: string; lang?: string }[]) {
  let sent = 0;
  for (const r of rows) {
    const body = (TEXT[r.lang || "en"] || TEXT.en)[r.kind].replace("{time}", r.play || "");
    try {
      await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, JSON.stringify({ title: "Badminton", body, kind: r.kind }));
      sent++;
    } catch (e) {   // the phone unsubscribed or the app was uninstalled: forget it
      if ([404, 410].includes((e as { statusCode?: number }).statusCode ?? 0)) await sb.from("push_subs").delete().eq("endpoint", r.endpoint);
      else console.error(r.endpoint, e);
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  await keys();
  const body = await req.json().catch(() => ({}));
  if (body.test) {
    const { data: { user } } = await sb.auth.getUser((req.headers.get("Authorization") || "").replace("Bearer ", ""));
    if (!user) return new Response("log in first", { status: 401, headers: cors });
    const [{ data: subs }, { data: prof }] = await Promise.all([
      sb.from("push_subs").select("endpoint, p256dh, auth").eq("user_id", user.id),
      sb.from("profiles").select("lang").eq("id", user.id).maybeSingle()]);
    const sent = await send((subs || []).map((s) => ({ ...s, kind: "test", lang: prof?.lang })));
    return Response.json({ sent }, { headers: cors });
  }
  const { data, error } = await sb.rpc("claim_reminders");
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ sent: await send(data || []) });
});
