import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/portal/service-client";
import { SettingsBrowser } from "@/components/settings-browser";
import { compareSlotTimes } from "@/lib/bookings/slots";

export default async function SettingsPage() {
  const supabase = await createClient();

  const [
    { data: services },
    { data: promos, error: promosError },
    { data: addons },
    { data: weekendSlots },
    { count: lockersCount },
    { count: roomsCount },
    { data: appSettings },
  ] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, price, points_earned")
      .eq("active", true)
      .order("name", { ascending: true }),
    (async () => {
      const fullRes = await supabase
        .from("promos")
        .select("id, label, discount, applicable_days, applicable_slots, min_pax")
        .eq("active", true)
        .order("label", { ascending: true });
      if (fullRes.error && (fullRes.error.code === "42703" || fullRes.error.code === "PGRST204" || fullRes.error.message?.includes("applicable_days") || fullRes.error.message?.includes("schema cache"))) {
        const fallbackRes = await supabase
          .from("promos")
          .select("id, label, discount")
          .eq("active", true)
          .order("label", { ascending: true });
        return {
          data: (fallbackRes.data ?? []).map((p) => ({
            ...p,
            applicable_days: null,
            applicable_slots: null,
            min_pax: 1,
          })),
          error: fallbackRes.error,
        };
      }
      return fullRes;
    })(),
    supabase
      .from("addons")
      .select("id, name, price")
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase.from("weekend_slots").select("id, slot_time"),
    supabase
      .from("lockers")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
    supabase
      .from("rooms")
      .select("*", { count: "exact", head: true })
      .eq("active", true),
    (async () => {
      let clientToUse: any = supabase;
      const fullSelect =
        "id, loyalty_formula_mode, peso_per_point, void_auth_code_hash, sms_confirmation_template, allow_walkin_claims, spa_name, logo_url, accent_color, font_family, font_scale, table_density";

      let res = await clientToUse
        .from("app_settings")
        .select(fullSelect)
        .limit(1)
        .maybeSingle();

      if ((res.error || !res.data) && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const serviceClient = createServiceClient();
          const sRes = await (serviceClient as any)
            .from("app_settings")
            .select(fullSelect)
            .limit(1)
            .maybeSingle();
          if (!sRes.error && sRes.data) {
            res = sRes;
            clientToUse = serviceClient;
          }
        } catch {
          // ignore
        }
      }

      if (res.error) {
        // Fallback in case newly added columns are not yet in PostgREST schema cache
        const fallbackRes = await clientToUse
          .from("app_settings")
          .select("loyalty_formula_mode, peso_per_point, void_auth_code_hash")
          .limit(1)
          .maybeSingle();

        return {
          data: {
            ...(fallbackRes.data ?? {}),
            sms_confirmation_template: null,
            allow_walkin_claims: false,
            spa_name: "NXS Spa",
            logo_url: null,
            accent_color: "gold",
            font_family: "sans",
            font_scale: "normal",
            table_density: "comfortable",
          },
        };
      }

      return res;
    })(),
  ]);

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gold animate-fade-in">
          Settings
        </h1>
        <a
          href="/settings/master-qr"
          className="text-sm rounded-md border border-border px-3 py-1.5 hover:bg-white/5"
        >
          Master QR
        </a>
      </div>

      <SettingsBrowser
        initialServices={services ?? []}
        initialPromos={promos ?? []}
        promosError={!!promosError}
        initialAddons={addons ?? []}
        initialWeekendSlots={(weekendSlots ?? [])
          .map((s) => ({
            id: s.id,
            slot_time: s.slot_time.slice(0, 5),
          }))
          .sort((a, b) => compareSlotTimes(a.slot_time, b.slot_time))}
        initialLockersCount={lockersCount ?? 100}
        initialRoomsCount={roomsCount ?? 18}
        initialLoyaltyFormulaMode={
          (appSettings?.loyalty_formula_mode as "uniform" | "proportional" | null) ?? null
        }
        initialPesoPerPoint={appSettings?.peso_per_point ?? null}
        initialVoidAuthCodeConfigured={!!appSettings?.void_auth_code_hash}
        initialSmsTemplate={appSettings?.sms_confirmation_template ?? null}
        initialAllowWalkinClaims={appSettings?.allow_walkin_claims ?? false}
        initialSpaName={appSettings?.spa_name ?? "NXS Spa"}
        initialLogoUrl={appSettings?.logo_url ?? null}
        initialAccentColor={appSettings?.accent_color ?? "gold"}
        initialFontFamily={appSettings?.font_family ?? "sans"}
        initialFontScale={appSettings?.font_scale ?? "normal"}
        initialTableDensity={appSettings?.table_density ?? "comfortable"}
      />
    </div>
  );
}
