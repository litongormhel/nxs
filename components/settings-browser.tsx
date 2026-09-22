"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useStaffSim } from "@/lib/staff-context";
import {
  updateServicePrice,
  updateServicePoints,
  addService,
  deleteService,
  addPromo,
  updatePromoDiscount,
  deletePromo,
  addWeekendSlot,
  deleteWeekendSlot,
  addAddon,
  updateAddonPrice,
  deleteAddon,
  addLockers,
  updateRoomCount,
  updateSmsTemplate,
  resetSmsTemplate,
  updateWalkinClaimsSetting,
  updateBrandingSettings,
  uploadBrandLogo,
  updateAppearanceSettings,
  updatePromo,
} from "@/app/(staff)/settings/actions";
import {
  ACCENT_PALETTES,
  broadcastBrandingChange,
  broadcastAppearanceChange,
} from "@/components/sidebar";
import { compareSlotTimes } from "@/lib/bookings/slots";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useTheme } from "@/lib/theme-context";
import {
  STANDARD_SHIFT_SLOTS,
  DAYS_OF_WEEK,
  formatPromoRuleSummary,
} from "@/lib/promos/validation";
import { LoyaltyFormulaSettings } from "@/components/loyalty-formula-settings";
import { VoidAuthCodeSettings } from "@/components/void-auth-code-settings";
import { DEFAULT_SMS_TEMPLATE, DEFAULT_SMS_CONFIRMATION_TEMPLATE, SMS_TEMPLATE_VARIABLES } from "@/lib/sms";

export type Service = {
  id: string;
  name: string;
  price: number;
  points_earned: number;
};

export type Promo = {
  id: string;
  label: string;
  discount: number;
  applicable_days?: string[] | null;
  applicable_slots?: string[] | null;
  min_pax?: number;
};

export type Addon = {
  id: string;
  name: string;
  price: number;
};

export type WeekendSlot = {
  id: string;
  slot_time: string;
};

function fmtTime(t: string): string {
  if (!t || !t.includes(":")) return t;
  const [h, m] = t.split(":");
  const hr = ((+h + 11) % 12) + 1;
  return `${hr}:${m} ${+h < 12 ? "AM" : "PM"}`;
}

type SettingsTab =
  | "general"
  | "appearance-branding"
  | "services-loyalty"
  | "promos-security"
  | "scheduling-capacity";

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
        active
          ? "border border-[#a97e2e] bg-surface text-accent-gold"
          : "border border-transparent text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}

export function SettingsBrowser({
  initialServices,
  initialPromos,
  promosError,
  initialAddons,
  initialWeekendSlots,
  initialLockersCount,
  initialRoomsCount,
  initialLoyaltyFormulaMode,
  initialPesoPerPoint,
  initialVoidAuthCodeConfigured,
  initialSmsTemplate,
  initialAllowWalkinClaims = false,
  initialSpaName = "NXS Spa",
  initialLogoUrl = null,
  initialAccentColor = "gold",
  initialFontFamily = "sans",
  initialFontScale = "normal",
  initialTableDensity = "comfortable",
}: {
  initialServices: Service[];
  initialPromos: Promo[];
  promosError?: boolean;
  initialAddons: Addon[];
  initialWeekendSlots: WeekendSlot[];
  initialLockersCount: number;
  initialRoomsCount: number;
  initialLoyaltyFormulaMode: "uniform" | "proportional" | null;
  initialPesoPerPoint: number | null;
  initialVoidAuthCodeConfigured: boolean;
  initialSmsTemplate?: string | null;
  initialAllowWalkinClaims?: boolean;
  initialSpaName?: string;
  initialLogoUrl?: string | null;
  initialAccentColor?: string;
  initialFontFamily?: string;
  initialFontScale?: string;
  initialTableDensity?: string;
}) {
  const router = useRouter();

  const [tab, setTab] = useState<SettingsTab>("general");

  // Theme state (global, see lib/theme-context.tsx)
  const { isLightMode, setIsLightMode } = useTheme();

  const { currentStaff, currentRole, sessionStaff } = useStaffSim();
  const selectedStaffId = sessionStaff?.id ?? "";

  const isOwner = currentRole === "Owner";
  const canEditServices =
    currentRole === "Supervisor" || currentRole === "Owner";
  const canEditPromos = currentRole === "Owner";
  const canEditCatalog =
    currentRole === "Supervisor" || currentRole === "Owner";
  const canEditLoyaltyFormula = currentRole === "Owner";
  const canEditVoidAuthCode = currentRole === "Owner";

  // Branding states
  const [spaName, setSpaName] = useState<string>(initialSpaName || "NXS Spa");
  const [spaNameDraft, setSpaNameDraft] = useState<string>(initialSpaName || "NXS Spa");
  const [isSavingSpaName, setIsSavingSpaName] = useState(false);

  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl ?? null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(initialLogoUrl ?? null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [customLogoUrlInput, setCustomLogoUrlInput] = useState<string>("");
  const [isSavingDirectLogo, setIsSavingDirectLogo] = useState(false);

  // Appearance states
  const [accentColor, setAccentColor] = useState<string>(initialAccentColor || "gold");
  const [fontFamily, setFontFamily] = useState<string>(initialFontFamily || "sans");
  const [fontScale, setFontScale] = useState<string>(initialFontScale || "normal");
  const [tableDensity, setTableDensity] = useState<string>(initialTableDensity || "comfortable");

  // Synchronize branding/appearance with localStorage and initial props on mount
  useEffect(() => {
    try {
      const storedName = localStorage.getItem("nxs_spa_name");
      if (storedName) {
        setSpaName(storedName);
        setSpaNameDraft(storedName);
      } else if (initialSpaName) {
        setSpaName(initialSpaName);
        setSpaNameDraft(initialSpaName);
      }

      const storedLogo = localStorage.getItem("nxs_logo_url");
      if (storedLogo) {
        setLogoUrl(storedLogo);
        setLogoPreview(storedLogo);
      } else if (initialLogoUrl) {
        setLogoUrl(initialLogoUrl);
        setLogoPreview(initialLogoUrl);
      }

      const storedAccent = localStorage.getItem("nxs_accent_color");
      if (storedAccent) setAccentColor(storedAccent);
      else if (initialAccentColor) setAccentColor(initialAccentColor);

      const storedFont = localStorage.getItem("nxs_font_family");
      if (storedFont) setFontFamily(storedFont);
      else if (initialFontFamily) setFontFamily(initialFontFamily);

      const storedScale = localStorage.getItem("nxs_font_scale");
      if (storedScale) setFontScale(storedScale);
      else if (initialFontScale) setFontScale(initialFontScale);

      const storedDensity = localStorage.getItem("nxs_table_density");
      if (storedDensity) setTableDensity(storedDensity);
      else if (initialTableDensity) setTableDensity(initialTableDensity);
    } catch {
      // ignore
    }
  }, [initialSpaName, initialLogoUrl, initialAccentColor, initialFontFamily, initialFontScale, initialTableDensity]);

  // Walk-in Claims Toggle state
  const [allowWalkinClaims, setAllowWalkinClaims] = useState<boolean>(
    initialAllowWalkinClaims ?? false
  );
  const [isSavingWalkinToggle, setIsSavingWalkinToggle] = useState(false);

  useEffect(() => {
    if (typeof initialAllowWalkinClaims === "boolean") {
      setAllowWalkinClaims(initialAllowWalkinClaims);
    }
  }, [initialAllowWalkinClaims]);

  const handleToggleWalkinClaims = async (enabled: boolean) => {
    if (!isOwner) return;
    setIsSavingWalkinToggle(true);
    const prev = allowWalkinClaims;
    setAllowWalkinClaims(enabled);
    const res = await updateWalkinClaimsSetting(enabled, selectedStaffId);
    setIsSavingWalkinToggle(false);

    const isSuccess = ("success" in res && res.success) || ("ok" in res && res.ok);
    if (!isSuccess) {
      setAllowWalkinClaims(prev);
      const errMsg = ("error" in res && res.error) ? res.error : "Unknown error";
      showToast(`Failed to update setting: ${errMsg}`);
      return;
    }

    if ("enabled" in res && typeof res.enabled === "boolean") {
      setAllowWalkinClaims(res.enabled);
    }

    showToast(
      enabled
        ? "Walk-in visit claims enabled"
        : "Walk-in visit claims disabled"
    );
    router.refresh();
  };

  // Data states
  const [services, setServices] = useState<Service[]>(() => {
    if (initialServices && initialServices.length > 0) return initialServices;
    return [
      { id: "1", name: "Wet Area", price: 700, points_earned: 3 },
      { id: "2", name: "Combi Massage", price: 1100, points_earned: 5 },
      { id: "3", name: "Signature Massage", price: 1300, points_earned: 6 },
      { id: "4", name: "Scrub", price: 900, points_earned: 4 },
    ];
  });

  const [promos, setPromos] = useState<Promo[]>(initialPromos ?? []);
  const [promoDrafts, setPromoDrafts] = useState<Record<string, string>>({});

  const [weekendSlots, setWeekendSlots] = useState<WeekendSlot[]>(
    initialWeekendSlots ?? []
  );

  const [addons, setAddons] = useState<Addon[]>(() => {
    if (initialAddons && initialAddons.length > 0) return initialAddons;
    return [{ id: "1", name: "Towel", price: 50 }];
  });
  const [addonDrafts, setAddonDrafts] = useState<Record<string, string>>({});

  const [lockerCount, setLockerCount] = useState<number>(
    initialLockersCount || 100
  );
  const [lockerAddDraft, setLockerAddDraft] = useState<number>(0);
  const [roomCount, setRoomCount] = useState<number>(initialRoomsCount || 18);
  const [roomCountDraft, setRoomCountDraft] = useState<number>(
    initialRoomsCount || 18
  );

  const normalizeSmsVariables = (text?: string | null): string => {
    if (!text) return "";
    return text.replaceAll("{room_numner}", "{room_number}");
  };

  const cleanDefaultSmsTemplate = normalizeSmsVariables(
    DEFAULT_SMS_CONFIRMATION_TEMPLATE ?? DEFAULT_SMS_TEMPLATE
  );

  // SMS Template states
  const [smsTemplate, setSmsTemplate] = useState<string>(() =>
    normalizeSmsVariables(initialSmsTemplate ?? cleanDefaultSmsTemplate)
  );
  const [savedSmsTemplate, setSavedSmsTemplate] = useState<string>(() =>
    normalizeSmsVariables(initialSmsTemplate ?? cleanDefaultSmsTemplate)
  );
  const [isSavingSms, setIsSavingSms] = useState(false);
  const smsTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const nextTemplate = normalizeSmsVariables(initialSmsTemplate ?? cleanDefaultSmsTemplate);
    setSmsTemplate(nextTemplate);
    setSavedSmsTemplate(nextTemplate);
  }, [initialSmsTemplate, cleanDefaultSmsTemplate]);

  const isSmsDirty = smsTemplate !== savedSmsTemplate;
  const isDefaultSms =
    smsTemplate.trim() === cleanDefaultSmsTemplate.trim() &&
    savedSmsTemplate.trim() === cleanDefaultSmsTemplate.trim();

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => {
      setToastMessage(null);
    }, 2400);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // Modal dialog states for prompt replacements
  const [promptDialog, setPromptDialog] = useState<{
    type: "service" | "promo" | "slot" | "addon";
    title: string;
    fields: { name: string; label: string; defaultValue: string; type?: string }[];
    onConfirm: (values: Record<string, string>) => void | Promise<void>;
  } | null>(null);

  // Confirm dialog state for delete actions
  const [deleteConfirm, setDeleteConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  // Dedicated Promo Modal state (Add / Edit) with day, timeslot, and pax constraints
  const [promoModal, setPromoModal] = useState<{
    open: boolean;
    mode: "add" | "edit";
    promo?: Promo;
    label: string;
    discount: number;
    dayType: "any" | "weekdays" | "weekends" | "custom";
    selectedDays: string[];
    slotType: "any" | "custom";
    selectedSlots: string[];
    minPax: number;
    loading: boolean;
    error: string | null;
  }>({
    open: false,
    mode: "add",
    label: "",
    discount: 100,
    dayType: "any",
    selectedDays: [],
    slotType: "any",
    selectedSlots: [],
    minPax: 1,
    loading: false,
    error: null,
  });

  // Handlers for Services
  const handleUpdateServicePrice = async (index: number, val: string) => {
    const num = parseInt(val, 10) || 0;
    const svc = services[index];
    const updated = [...services];
    updated[index] = { ...updated[index], price: num };
    setServices(updated);
    const res = await updateServicePrice(svc.id, num, selectedStaffId);
    if (!res.ok) {
      showToast(`Failed to update ${svc.name} price: ${res.error}`);
      return;
    }
    showToast(`${svc.name} price updated to ₱${num}`);
    router.refresh();
  };

  const handleUpdateServicePoints = async (index: number, val: string) => {
    const num = parseInt(val, 10) || 0;
    const svc = services[index];
    const updated = [...services];
    updated[index] = { ...updated[index], points_earned: num };
    setServices(updated);
    const res = await updateServicePoints(svc.id, num, selectedStaffId);
    if (!res.ok) {
      showToast(`Failed to update ${svc.name} points: ${res.error}`);
      return;
    }
    showToast(`${svc.name} points updated to +${num}`);
    router.refresh();
  };

  const handleAddService = () => {
    setPromptDialog({
      type: "service",
      title: "Add New Service",
      fields: [
        { name: "name", label: "Service Name", defaultValue: "" },
        { name: "price", label: "Price (₱)", defaultValue: "200", type: "number" },
        { name: "points", label: "Points Earned", defaultValue: "2", type: "number" },
      ],
      onConfirm: async (values) => {
        const name = values.name.trim();
        if (!name) return;
        const price = parseInt(values.price, 10) || 200;
        const points = parseInt(values.points, 10) || 2;
        const res = await addService(name, price, points, selectedStaffId);
        if (!res.ok) {
          showToast(`Failed to add ${name}: ${res.error}`);
          return;
        }
        const newSvc: Service = {
          id: res.id!,
          name,
          price,
          points_earned: points,
        };
        setServices((prev) => [...prev, newSvc]);
        showToast(`${name} added to services`);
        router.refresh();
      },
    });
  };

  const handleDeleteService = (index: number) => {
    const svc = services[index];
    setDeleteConfirm({
      title: "Delete Service",
      message: `Are you sure you want to delete ${svc.name}?`,
      onConfirm: async () => {
        setDeleteConfirm(null);
        const res = await deleteService(svc.id, selectedStaffId);
        if (!res.ok) {
          showToast(`Failed to remove ${svc.name}: ${res.error}`);
          return;
        }
        setServices((prev) => prev.filter((_, i) => i !== index));
        showToast(`${svc.name} removed`);
        router.refresh();
      },
    });
  };

  // Handlers for Promos
  const handlePromoDraftChange = (promoId: string, val: string) => {
    setPromoDrafts((prev) => ({ ...prev, [promoId]: val }));
  };

  const handleSavePromoDiscount = async (promo: Promo) => {
    const draft = promoDrafts[promo.id];
    if (draft === undefined) return;
    const num = parseInt(draft, 10) || 0;
    const res = await updatePromoDiscount(promo.id, num, selectedStaffId);
    if (!res.ok) {
      showToast(`Failed to update ${promo.label} discount: ${res.error}`);
      return;
    }
    setPromos((prev) => prev.map((p) => (p.id === promo.id ? { ...p, discount: num } : p)));
    setPromoDrafts((prev) => {
      const next = { ...prev };
      delete next[promo.id];
      return next;
    });
    showToast(`${promo.label} discount updated to -₱${num}`);
    router.refresh();
  };

  const handleCancelPromoDraft = (promoId: string) => {
    setPromoDrafts((prev) => {
      const next = { ...prev };
      delete next[promoId];
      return next;
    });
  };

  const handleOpenAddPromo = () => {
    setPromoModal({
      open: true,
      mode: "add",
      label: "",
      discount: 100,
      dayType: "any",
      selectedDays: [],
      slotType: "any",
      selectedSlots: [],
      minPax: 1,
      loading: false,
      error: null,
    });
  };

  const handleOpenEditPromo = (promo: Promo) => {
    const days = promo.applicable_days ?? [];
    let dayType: "any" | "weekdays" | "weekends" | "custom" = "any";
    if (days.length === 5 && ["Mon", "Tue", "Wed", "Thu", "Fri"].every((d) => days.includes(d))) {
      dayType = "weekdays";
    } else if (days.length === 2 && ["Sat", "Sun"].every((d) => days.includes(d))) {
      dayType = "weekends";
    } else if (days.length > 0 && days.length < 7) {
      dayType = "custom";
    }

    const slots = promo.applicable_slots ?? [];
    const slotType: "any" | "custom" = slots.length > 0 ? "custom" : "any";

    setPromoModal({
      open: true,
      mode: "edit",
      promo,
      label: promo.label,
      discount: promo.discount,
      dayType,
      selectedDays: days,
      slotType,
      selectedSlots: slots,
      minPax: promo.min_pax ?? 1,
      loading: false,
      error: null,
    });
  };

  const handleSavePromoModal = async () => {
    const label = promoModal.label.trim();
    if (!label) {
      setPromoModal((prev) => ({ ...prev, error: "Please enter a promo name." }));
      return;
    }
    const discount = Number(promoModal.discount) || 0;
    const minPax = Math.max(1, Number(promoModal.minPax) || 1);

    let applicableDays: string[] | null = null;
    if (promoModal.dayType === "weekdays") {
      applicableDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    } else if (promoModal.dayType === "weekends") {
      applicableDays = ["Sat", "Sun"];
    } else if (promoModal.dayType === "custom") {
      applicableDays = promoModal.selectedDays.length > 0 ? promoModal.selectedDays : null;
    }

    let applicableSlots: string[] | null = null;
    if (promoModal.slotType === "custom") {
      applicableSlots = promoModal.selectedSlots.length > 0 ? promoModal.selectedSlots : null;
    }

    setPromoModal((prev) => ({ ...prev, loading: true, error: null }));

    if (promoModal.mode === "add") {
      const res = await addPromo(label, discount, selectedStaffId, {
        applicableDays,
        applicableSlots,
        minPax,
      });
      if (!res.ok) {
        setPromoModal((prev) => ({ ...prev, loading: false, error: res.error }));
        return;
      }
      const newPromo: Promo = {
        id: res.id!,
        label,
        discount,
        applicable_days: applicableDays,
        applicable_slots: applicableSlots,
        min_pax: minPax,
      };
      setPromos((prev) => [...prev, newPromo]);
      setPromoModal((prev) => ({ ...prev, open: false, loading: false }));
      showToast(`${label} added`);
      router.refresh();
    } else if (promoModal.promo) {
      const res = await updatePromo(
        promoModal.promo.id,
        {
          label,
          discount,
          applicableDays,
          applicableSlots,
          minPax,
        },
        selectedStaffId
      );
      if (!res.ok) {
        setPromoModal((prev) => ({ ...prev, loading: false, error: res.error }));
        return;
      }
      setPromos((prev) =>
        prev.map((p) =>
          p.id === promoModal.promo!.id
            ? {
                ...p,
                label,
                discount,
                applicable_days: applicableDays,
                applicable_slots: applicableSlots,
                min_pax: minPax,
              }
            : p
        )
      );
      setPromoModal((prev) => ({ ...prev, open: false, loading: false }));
      showToast(`${label} updated`);
      router.refresh();
    }
  };

  const handleDeletePromo = (index: number) => {
    const promo = promos[index];
    setDeleteConfirm({
      title: "Delete Promo",
      message: `Are you sure you want to delete ${promo.label}?`,
      onConfirm: async () => {
        setDeleteConfirm(null);
        const res = await deletePromo(promo.id, selectedStaffId);
        if (!res.ok) {
          showToast(`Failed to remove ${promo.label}: ${res.error}`);
          return;
        }
        setPromos((prev) => prev.filter((_, i) => i !== index));
        showToast(`${promo.label} removed`);
        router.refresh();
      },
    });
  };

  // Handlers for Weekend Slots
  const handleAddSlot = () => {
    setPromptDialog({
      type: "slot",
      title: "Add Weekend Time Slot",
      fields: [
        { name: "slot", label: "Time Slot (24-hr HH:MM, e.g. 15:00)", defaultValue: "" },
      ],
      onConfirm: async (values) => {
        const val = values.slot.trim();
        if (!val || !/^\d{1,2}:\d{2}$/.test(val)) {
          alert("Please use HH:MM format, e.g. 15:00");
          return;
        }
        const [h, m] = val.split(":");
        const formatted = `${String(h).padStart(2, "0")}:${m}`;
        if (weekendSlots.some((s) => s.slot_time === formatted)) {
          alert("Slot already exists");
          return;
        }
        const res = await addWeekendSlot(formatted, selectedStaffId);
        if (!res.ok) {
          showToast(`Failed to add slot: ${res.error}`);
          return;
        }
        const updated = [...weekendSlots, { id: res.id!, slot_time: formatted }].sort((a, b) =>
          compareSlotTimes(a.slot_time, b.slot_time)
        );
        setWeekendSlots(updated);
        showToast(`${fmtTime(formatted)} added to weekend slots`);
        router.refresh();
      },
    });
  };

  const handleDeleteSlot = (index: number) => {
    const slot = weekendSlots[index];
    setDeleteConfirm({
      title: "Delete Weekend Slot",
      message: `Are you sure you want to remove ${fmtTime(slot.slot_time)} from weekend slots?`,
      onConfirm: async () => {
        setDeleteConfirm(null);
        const res = await deleteWeekendSlot(slot.id, selectedStaffId);
        if (!res.ok) {
          showToast(`Failed to remove slot: ${res.error}`);
          return;
        }
        setWeekendSlots((prev) => prev.filter((_, i) => i !== index));
        showToast(`${fmtTime(slot.slot_time)} removed`);
        router.refresh();
      },
    });
  };

  // Handlers for Add-ons
  const handleAddonDraftChange = (addonId: string, val: string) => {
    setAddonDrafts((prev) => ({ ...prev, [addonId]: val }));
  };

  const handleSaveAddonPrice = async (addon: Addon) => {
    const draft = addonDrafts[addon.id];
    if (draft === undefined) return;
    const num = parseInt(draft, 10) || 0;
    const res = await updateAddonPrice(addon.id, num, selectedStaffId);
    if (!res.ok) {
      showToast(`Failed to update ${addon.name} price: ${res.error}`);
      return;
    }
    setAddons((prev) => prev.map((a) => (a.id === addon.id ? { ...a, price: num } : a)));
    setAddonDrafts((prev) => {
      const next = { ...prev };
      delete next[addon.id];
      return next;
    });
    showToast(`${addon.name} price updated to ₱${num}`);
    router.refresh();
  };

  const handleCancelAddonDraft = (addonId: string) => {
    setAddonDrafts((prev) => {
      const next = { ...prev };
      delete next[addonId];
      return next;
    });
  };

  const handleAddAddon = () => {
    setPromptDialog({
      type: "addon",
      title: "Add New Add-on",
      fields: [
        { name: "name", label: "Add-on Name", defaultValue: "" },
        { name: "price", label: "Price (₱)", defaultValue: "50", type: "number" },
      ],
      onConfirm: async (values) => {
        const name = values.name.trim();
        if (!name) return;
        const price = parseInt(values.price, 10) || 50;
        const res = await addAddon(name, price, selectedStaffId);
        if (!res.ok) {
          showToast(`Failed to add ${name}: ${res.error}`);
          return;
        }
        const newAddon: Addon = {
          id: res.id!,
          name,
          price,
        };
        setAddons((prev) => [...prev, newAddon]);
        showToast(`${name} added to add-ons`);
        router.refresh();
      },
    });
  };

  const handleDeleteAddon = (index: number) => {
    if (addons.length <= 1) {
      alert("At least one add-on must remain.");
      return;
    }
    const addon = addons[index];
    setDeleteConfirm({
      title: "Delete Add-on",
      message: `Are you sure you want to delete ${addon.name}?`,
      onConfirm: async () => {
        setDeleteConfirm(null);
        const res = await deleteAddon(addon.id, selectedStaffId);
        if (!res.ok) {
          showToast(`Failed to remove ${addon.name}: ${res.error}`);
          return;
        }
        setAddons((prev) => prev.filter((_, i) => i !== index));
        showToast(`${addon.name} removed`);
        router.refresh();
      },
    });
  };

  // Handlers for Capacity
  const handleSaveLockers = async () => {
    if (lockerAddDraft <= 0) return;
    const res = await addLockers(lockerAddDraft, selectedStaffId);
    if (!res.ok) {
      showToast(`Failed to add lockers: ${res.error}`);
      return;
    }
    const updated = lockerCount + lockerAddDraft;
    setLockerCount(updated);
    setLockerAddDraft(0);
    showToast(`Locker count increased to ${updated}`);
    router.refresh();
  };

  const handleSaveRoomCount = async () => {
    if (roomCountDraft === roomCount) return;
    const res = await updateRoomCount(roomCountDraft, selectedStaffId);
    if (!res.ok) {
      showToast(`Failed to update room count: ${res.error}`);
      setRoomCountDraft(roomCount);
      return;
    }
    setRoomCount(roomCountDraft);
    showToast(`Room/bed count set to ${roomCountDraft}`);
    router.refresh();
  };

  const handleInsertVariable = (variableKey: string) => {
    const token = normalizeSmsVariables(variableKey);
    if (!smsTextareaRef.current) {
      setSmsTemplate((prev) => prev + token);
      return;
    }
    const textarea = smsTextareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const val = textarea.value;
    const newVal = val.substring(0, start) + token + val.substring(end);
    setSmsTemplate(newVal);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }, 0);
  };

  const handleSaveSmsTemplate = async () => {
    setIsSavingSms(true);
    const cleanedTemplate = normalizeSmsVariables(smsTemplate);
    const res = await updateSmsTemplate(cleanedTemplate, selectedStaffId);
    setIsSavingSms(false);
    if (!res.ok) {
      const errorMsg =
        typeof res.error === "string"
          ? res.error
          : (res.error as any)?.message || JSON.stringify(res.error) || "Unknown error";
      showToast(`Failed to save SMS template: ${errorMsg}`);
      return;
    }
    setSmsTemplate(cleanedTemplate);
    setSavedSmsTemplate(cleanedTemplate);
    showToast("SMS confirmation template saved successfully");
    router.refresh();
  };

  const handleResetSmsTemplate = async () => {
    setIsSavingSms(true);
    const res = await resetSmsTemplate(selectedStaffId);
    setIsSavingSms(false);
    if (!res.ok) {
      const errorMsg =
        typeof res.error === "string"
          ? res.error
          : (res.error as any)?.message || JSON.stringify(res.error) || "Unknown error";
      showToast(`Failed to reset SMS template: ${errorMsg}`);
      return;
    }
    setSmsTemplate(cleanDefaultSmsTemplate);
    setSavedSmsTemplate(cleanDefaultSmsTemplate);
    showToast("SMS confirmation template reset to default");
    router.refresh();
  };

  // Handlers for Branding
  const handleSaveSpaName = async () => {
    if (!isOwner) return;
    const trimmed = spaNameDraft.trim();
    if (!trimmed) {
      showToast("Spa name cannot be empty");
      return;
    }
    setIsSavingSpaName(true);
    const res = await updateBrandingSettings({ spaName: trimmed }, selectedStaffId);
    setIsSavingSpaName(false);
    if (!res.ok) {
      showToast(`Failed to update spa name: ${res.error}`);
      return;
    }
    setSpaName(trimmed);
    broadcastBrandingChange({ spaName: trimmed });
    showToast("Spa name updated successfully");
    router.refresh();
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isOwner) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Image size must be 5MB or less");
      return;
    }
    setLogoFile(file);
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
  };

  const handleUploadLogo = async () => {
    if (!isOwner || !logoFile) return;
    setIsUploadingLogo(true);
    const formData = new FormData();
    formData.append("file", logoFile);

    const res = await uploadBrandLogo(formData, selectedStaffId);
    if (!res.ok) {
      setIsUploadingLogo(false);
      showToast(`Failed to upload logo: ${res.error || "Unknown error"}`);
      return;
    }
    if (!res.url) {
      setIsUploadingLogo(false);
      showToast("Failed to upload logo: No URL returned");
      return;
    }

    // Update app_settings with uploaded URL
    const updateRes = await updateBrandingSettings({ logoUrl: res.url }, selectedStaffId);
    setIsUploadingLogo(false);

    if (!updateRes.ok) {
      showToast(`Uploaded but failed to save setting: ${updateRes.error}`);
      return;
    }

    setLogoUrl(res.url);
    setLogoPreview(res.url);
    setLogoFile(null);
    broadcastBrandingChange({ logoUrl: res.url });
    showToast("Brand logo uploaded and applied");
    router.refresh();
  };

  const handleSaveDirectLogoUrl = async () => {
    if (!isOwner) return;
    const trimmed = customLogoUrlInput.trim();
    setIsSavingDirectLogo(true);
    const res = await updateBrandingSettings({ logoUrl: trimmed || null }, selectedStaffId);
    setIsSavingDirectLogo(false);
    if (!res.ok) {
      showToast(`Failed to update logo URL: ${res.error}`);
      return;
    }
    setLogoUrl(trimmed || null);
    setLogoPreview(trimmed || null);
    setCustomLogoUrlInput("");
    broadcastBrandingChange({ logoUrl: trimmed || null });
    showToast(trimmed ? "Logo URL updated" : "Logo reset to default");
    router.refresh();
  };

  const handleResetLogo = async () => {
    if (!isOwner) return;
    setIsSavingDirectLogo(true);
    const res = await updateBrandingSettings({ logoUrl: null }, selectedStaffId);
    setIsSavingDirectLogo(false);
    if (!res.ok) {
      showToast(`Failed to reset logo: ${res.error}`);
      return;
    }
    setLogoUrl(null);
    setLogoPreview(null);
    setLogoFile(null);
    broadcastBrandingChange({ logoUrl: null });
    showToast("Logo reset to default");
    router.refresh();
  };

  // Handlers for Appearance (Typography, Accent, Density)
  const handleSelectAccentColor = async (newAccent: string) => {
    setAccentColor(newAccent);
    broadcastAppearanceChange({ accentColor: newAccent });
    await updateAppearanceSettings({ accentColor: newAccent }, selectedStaffId);
    showToast(`Accent color set to ${ACCENT_PALETTES[newAccent]?.name || newAccent}`);
  };

  const handleSelectFontFamily = async (newFont: string) => {
    setFontFamily(newFont);
    broadcastAppearanceChange({ fontFamily: newFont });
    await updateAppearanceSettings({ fontFamily: newFont }, selectedStaffId);
    const label =
      newFont === "jakarta"
        ? "Plus Jakarta Sans (Balanced)"
        : newFont === "serif"
        ? "Playfair / Cinzel (Luxury Serif)"
        : "Inter / Geist (Modern Sans)";
    showToast(`Font family set to ${label}`);
  };

  const handleSelectFontScale = async (newScale: string) => {
    setFontScale(newScale);
    broadcastAppearanceChange({ fontScale: newScale });
    await updateAppearanceSettings({ fontScale: newScale }, selectedStaffId);
    showToast(
      `Font scale set to ${
        newScale === "compact"
          ? "Compact (90%)"
          : newScale === "large"
          ? "Large (110%)"
          : "Normal (100%)"
      }`
    );
  };

  const handleSelectTableDensity = async (newDensity: string) => {
    setTableDensity(newDensity);
    broadcastAppearanceChange({ tableDensity: newDensity });
    await updateAppearanceSettings({ tableDensity: newDensity }, selectedStaffId);
    showToast(`Table density set to ${newDensity === "dense" ? "Dense (Compact)" : "Comfortable"}`);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <TabButton active={tab === "general"} onClick={() => setTab("general")}>
          General
        </TabButton>
        <TabButton
          active={tab === "appearance-branding"}
          onClick={() => setTab("appearance-branding")}
        >
          Appearance & Branding
        </TabButton>
        <TabButton
          active={tab === "services-loyalty"}
          onClick={() => setTab("services-loyalty")}
        >
          Services & Loyalty
        </TabButton>
        <TabButton
          active={tab === "promos-security"}
          onClick={() => setTab("promos-security")}
        >
          Promos & Security
        </TabButton>
        <TabButton
          active={tab === "scheduling-capacity"}
          onClick={() => setTab("scheduling-capacity")}
        >
          Scheduling & Capacity
        </TabButton>
      </div>

      {tab === "appearance-branding" && (
        <div className="space-y-6">
          {/* SECTION 1: Branding (Owner Only) */}
          <div>
            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2.5">
              <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
                Branding Controls
              </div>
              <span
                className={`text-[10px] font-mono font-semibold uppercase px-2.5 py-0.5 rounded-full border ${
                  isOwner
                    ? "border-[#a97e2e] bg-gold/10 text-accent-gold"
                    : "border-border bg-surface-2 text-muted"
                }`}
              >
                {isOwner ? "Owner Editable" : "Owner Only (Read-Only)"}
              </span>
            </div>
            <div className="text-[11px] text-muted mb-3">
              Configure the public identity, business name, and official brand logo for NXS Spa.
              Updates propagate across the sidebar navigation, layout header, and dashboard.
            </div>

            <div className="rounded-xl border border-border bg-surface p-5 space-y-5">
              {/* Spa Name Field */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1.5">
                  Business / Spa Name
                </label>
                <div className="flex items-center gap-2.5 max-w-md">
                  <input
                    type="text"
                    disabled={!isOwner}
                    value={spaNameDraft}
                    onChange={(e) => setSpaNameDraft(e.target.value)}
                    placeholder="NXS Spa"
                    className="flex-1 rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground outline-none focus:border-gold disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  {isOwner && (
                    <button
                      type="button"
                      disabled={isSavingSpaName || spaNameDraft.trim() === spaName}
                      onClick={handleSaveSpaName}
                      className="rounded-lg bg-gold px-4 py-2 text-xs font-bold text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
                    >
                      {isSavingSpaName ? "Saving..." : "Save Name"}
                    </button>
                  )}
                </div>
              </div>

              {/* Logo Uploader */}
              <div className="border-t border-border pt-4">
                <label className="block text-[11px] font-semibold text-foreground mb-1.5">
                  Brand Logo & Live Preview
                </label>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  {/* Live Preview Box */}
                  <div className="w-16 h-16 rounded-xl border border-border bg-surface-2 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/logo.jpeg";
                        }}
                      />
                    ) : (
                      <img
                        src="/logo.jpeg"
                        alt="Default logo"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  {/* Actions & File Picker */}
                  <div className="flex-1 space-y-2.5">
                    {isOwner ? (
                      <>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <label className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-xs font-semibold text-foreground hover:border-gold transition cursor-pointer">
                            <span>{logoFile ? logoFile.name : "Choose Image File"}</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif"
                              className="hidden"
                              onChange={handleLogoFileChange}
                            />
                          </label>
                          {logoFile && (
                            <button
                              type="button"
                              onClick={handleUploadLogo}
                              disabled={isUploadingLogo}
                              className="rounded-lg bg-gold px-3.5 py-2 text-xs font-bold text-black hover:brightness-110 disabled:opacity-50 transition"
                            >
                              {isUploadingLogo ? "Uploading..." : "Upload Logo"}
                            </button>
                          )}
                          {(logoUrl || logoFile) && (
                            <button
                              type="button"
                              onClick={handleResetLogo}
                              disabled={isSavingDirectLogo || isUploadingLogo}
                              className="rounded-lg border border-[#5e3c3c] px-3 py-2 text-xs font-semibold text-accent-red hover:brightness-125 transition"
                            >
                              Reset to Default
                            </button>
                          )}
                        </div>

                        {/* Direct Image URL input */}
                        <div className="flex items-center gap-2 max-w-md pt-1">
                          <input
                            type="url"
                            value={customLogoUrlInput}
                            onChange={(e) => setCustomLogoUrlInput(e.target.value)}
                            placeholder="Or enter direct image URL (https://...)"
                            className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground outline-none focus:border-gold"
                          />
                          <button
                            type="button"
                            onClick={handleSaveDirectLogoUrl}
                            disabled={isSavingDirectLogo || !customLogoUrlInput.trim()}
                            className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-semibold text-muted hover:text-foreground hover:border-gold disabled:opacity-40 transition shrink-0"
                          >
                            Set URL
                          </button>
                        </div>
                        <div className="text-[10px] text-muted">
                          Supports PNG, JPEG, SVG, WebP up to 5MB. Uploaded logos are saved to Supabase Storage.
                        </div>
                      </>
                    ) : (
                      <div className="text-[11px] text-muted">
                        Only the Owner role can upload or change the brand logo.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Typography (Font & Size Scale) */}
          <div>
            <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted mb-1.5">
              Typography Settings
            </div>
            <div className="text-[11px] text-muted mb-3">
              Select font family and size scaling for readability across the console.
            </div>

            <div className="rounded-xl border border-border bg-surface p-5 space-y-5">
              {/* Font Family Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-2">
                  Font Family
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Option 1: Modern Sans */}
                  <button
                    type="button"
                    onClick={() => handleSelectFontFamily("sans")}
                    className={`rounded-xl border p-3.5 text-left transition flex flex-col justify-between ${
                      fontFamily === "sans"
                        ? "border-[#a97e2e] bg-gold/10"
                        : "border-border bg-surface-2 hover:border-gold/50"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-foreground font-sans">
                        Inter / Geist
                      </div>
                      <div className="text-[10.5px] text-muted mt-0.5">
                        Modern Sans — Clean, geometric & contemporary
                      </div>
                    </div>
                    <div className="mt-3 text-[13px] font-sans font-medium text-accent-gold">
                      Aa Bb Gg 123
                    </div>
                  </button>

                  {/* Option 2: Balanced Sans */}
                  <button
                    type="button"
                    onClick={() => handleSelectFontFamily("jakarta")}
                    className={`rounded-xl border p-3.5 text-left transition flex flex-col justify-between ${
                      fontFamily === "jakarta"
                        ? "border-[#a97e2e] bg-gold/10"
                        : "border-border bg-surface-2 hover:border-gold/50"
                    }`}
                  >
                    <div>
                      <div
                        className="text-xs font-bold text-foreground"
                        style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                      >
                        Plus Jakarta Sans
                      </div>
                      <div className="text-[10.5px] text-muted mt-0.5">
                        Balanced — Warm, humanistic & high legibility
                      </div>
                    </div>
                    <div
                      className="mt-3 text-[13px] font-medium text-accent-gold"
                      style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}
                    >
                      Aa Bb Gg 123
                    </div>
                  </button>

                  {/* Option 3: Luxury Serif */}
                  <button
                    type="button"
                    onClick={() => handleSelectFontFamily("serif")}
                    className={`rounded-xl border p-3.5 text-left transition flex flex-col justify-between ${
                      fontFamily === "serif"
                        ? "border-[#a97e2e] bg-gold/10"
                        : "border-border bg-surface-2 hover:border-gold/50"
                    }`}
                  >
                    <div>
                      <div
                        className="text-xs font-bold text-foreground"
                        style={{ fontFamily: '"Playfair Display", "Cinzel", serif' }}
                      >
                        Playfair / Cinzel
                      </div>
                      <div className="text-[10.5px] text-muted mt-0.5">
                        Luxury Serif — Classic elegance & spa atmosphere
                      </div>
                    </div>
                    <div
                      className="mt-3 text-[13px] font-medium text-accent-gold"
                      style={{ fontFamily: '"Playfair Display", "Cinzel", serif' }}
                    >
                      Aa Bb Gg 123
                    </div>
                  </button>
                </div>
              </div>

              {/* Font Size Scale */}
              <div className="border-t border-border pt-4">
                <label className="block text-[11px] font-semibold text-foreground mb-2">
                  Font Size Scale
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSelectFontScale("compact")}
                    className={`rounded-xl border p-3 text-center transition ${
                      fontScale === "compact"
                        ? "border-[#a97e2e] bg-gold/10"
                        : "border-border bg-surface-2 hover:border-gold/50"
                    }`}
                  >
                    <div className="text-xs font-bold text-foreground">Compact (90%)</div>
                    <div className="text-[10px] text-muted mt-0.5">Information dense</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectFontScale("normal")}
                    className={`rounded-xl border p-3 text-center transition ${
                      fontScale === "normal"
                        ? "border-[#a97e2e] bg-gold/10"
                        : "border-border bg-surface-2 hover:border-gold/50"
                    }`}
                  >
                    <div className="text-xs font-bold text-foreground">Normal (100%)</div>
                    <div className="text-[10px] text-muted mt-0.5">Standard balance</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectFontScale("large")}
                    className={`rounded-xl border p-3 text-center transition ${
                      fontScale === "large"
                        ? "border-[#a97e2e] bg-gold/10"
                        : "border-border bg-surface-2 hover:border-gold/50"
                    }`}
                  >
                    <div className="text-xs font-bold text-foreground">Large (110%)</div>
                    <div className="text-[10px] text-muted mt-0.5">Enhanced clarity</div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: Theme & Display (Accent Color, Table Density, Light/Dark) */}
          <div>
            <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted mb-1.5">
              Theme & Display
            </div>
            <div className="text-[11px] text-muted mb-3">
              Choose the accent color palette and table density comfort levels.
            </div>

            <div className="rounded-xl border border-border bg-surface p-5 space-y-5">
              {/* Accent Color Palette */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-2">
                  Accent Color Palette
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {Object.entries(ACCENT_PALETTES).map(([key, item]) => {
                    const isSelected = accentColor === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleSelectAccentColor(key)}
                        className={`rounded-xl border p-3 flex items-center gap-3 text-left transition ${
                          isSelected
                            ? "border-[#a97e2e] bg-gold/10 shadow-sm"
                            : "border-border bg-surface-2 hover:border-gold/50"
                        }`}
                      >
                        <span
                          className="w-5 h-5 rounded-full shrink-0 shadow"
                          style={{ backgroundColor: item.preview }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-foreground truncate">
                            {item.name}
                          </div>
                          {isSelected && (
                            <div className="text-[9.5px] text-accent-gold font-mono uppercase">
                              Active
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Table Density */}
              <div className="border-t border-border pt-4">
                <label className="block text-[11px] font-semibold text-foreground mb-2">
                  Table Layout Density
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSelectTableDensity("comfortable")}
                    className={`rounded-xl border p-3.5 text-left transition ${
                      tableDensity === "comfortable"
                        ? "border-[#a97e2e] bg-gold/10"
                        : "border-border bg-surface-2 hover:border-gold/50"
                    }`}
                  >
                    <div className="text-xs font-bold text-foreground">Comfortable (Default)</div>
                    <div className="text-[10.5px] text-muted mt-0.5">
                      Spacious padding optimal for tablet use and touchscreen operations.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectTableDensity("dense")}
                    className={`rounded-xl border p-3.5 text-left transition ${
                      tableDensity === "dense"
                        ? "border-[#a97e2e] bg-gold/10"
                        : "border-border bg-surface-2 hover:border-gold/50"
                    }`}
                  >
                    <div className="text-xs font-bold text-foreground">Dense (Compact)</div>
                    <div className="text-[10.5px] text-muted mt-0.5">
                      Tight padding allowing more rows and transactions to be visible simultaneously.
                    </div>
                  </button>
                </div>
              </div>

              {/* Dark / Light Toggle */}
              <div className="border-t border-border pt-4 flex items-center justify-between flex-wrap gap-2.5">
                <div>
                  <div className="text-[12px] font-bold text-foreground">Color Mode</div>
                  <div className="text-[11px] text-muted mt-0.5">
                    {isLightMode ? "Light mode active" : "Dark mode active"}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <label className="relative inline-block w-11 h-[25px] shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      className="opacity-0 w-0 h-0"
                      checked={isLightMode}
                      onChange={(e) => setIsLightMode(e.target.checked)}
                    />
                    <span
                      className={`absolute inset-0 rounded-full border transition-colors ${
                        isLightMode
                          ? "bg-gradient-to-br from-[#c89b3c] to-[#a97e2e] border-[#a97e2e]"
                          : "bg-[#1d1610] border-border"
                      }`}
                    >
                      <span
                        className={`absolute top-[2px] left-[2px] w-[19px] h-[19px] rounded-full transition-transform ${
                          isLightMode
                            ? "translate-x-[19px] bg-background"
                            : "bg-muted"
                        }`}
                      />
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "general" && (
      <div className="space-y-6">
      {/* SECTION: Display */}
      <div>
        <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted mb-2.5">
          Display
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 flex-wrap gap-2.5">
          <div>
            <div className="text-[13px] font-bold text-foreground">Appearance</div>
            <div className="text-[11px] text-muted mt-0.5">
              {isLightMode
                ? "Light mode — brighter for daytime front-desk use"
                : "Dark mode — easier on the eyes for late shifts"}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Sun Icon */}
            <svg
              className="w-4 h-4 text-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
            {/* Switch */}
            <label className="relative inline-block w-11 h-[25px] shrink-0 cursor-pointer">
              <input
                type="checkbox"
                className="opacity-0 w-0 h-0"
                checked={isLightMode}
                onChange={(e) => setIsLightMode(e.target.checked)}
              />
              <span
                className={`absolute inset-0 rounded-full border transition-colors ${
                  isLightMode
                    ? "bg-gradient-to-br from-[#c89b3c] to-[#a97e2e] border-[#a97e2e]"
                    : "bg-[#1d1610] border-border"
                }`}
              >
                <span
                  className={`absolute top-[2px] left-[2px] w-[19px] h-[19px] rounded-full transition-transform ${
                    isLightMode
                      ? "translate-x-[19px] bg-background"
                      : "bg-muted"
                  }`}
                />
              </span>
            </label>
            {/* Moon Icon */}
            <svg
              className="w-4 h-4 text-muted"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M20.4 14.5A8.5 8.5 0 019.5 3.6a8.5 8.5 0 1010.9 10.9z" />
            </svg>
          </div>
        </div>
      </div>

      {/* SECTION: Account */}
      <div>
        <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted mb-2.5">
          Account
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 flex-wrap gap-2.5">
            <div>
              <div className="text-[13px] font-bold text-foreground">
                {currentStaff?.name ?? "—"}
              </div>
              <div className="text-[11px] text-muted mt-0.5">
                {currentStaff?.position} · {currentRole}
              </div>
            </div>
            <span className="text-[10.5px] text-muted">Signed in</span>
          </div>
        </div>
      </div>

      {/* SECTION: SMS Confirmation Template */}
      <div>
        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2.5">
          <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
            SMS Confirmation Template
          </div>
          {canEditCatalog && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetSmsTemplate}
                disabled={isSavingSms || isDefaultSms}
                className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold text-muted hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Reset to Default
              </button>
              <button
                type="button"
                onClick={handleSaveSmsTemplate}
                disabled={isSavingSms || !isSmsDirty}
                className="rounded-lg bg-gold px-3 py-1.5 text-[11px] font-bold text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {isSavingSms ? "Saving..." : "Save Template"}
              </button>
            </div>
          )}
        </div>
        <div className="text-[11px] text-muted mb-3">
          {canEditCatalog
            ? "Configure the official SMS booking confirmation copy sent to registered clients. Click placeholder chips to insert them into your message."
            : "Read-only for Front Desk. Only Supervisor or Owner roles can edit."}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <div>
            <div className="text-[11px] font-semibold text-foreground mb-1.5">
              Available Variables <span className="text-muted font-normal">(click to insert at cursor)</span>:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SMS_TEMPLATE_VARIABLES.map((v) => {
                const normalizedKey = normalizeSmsVariables(v.key);
                const normalizedLabel = normalizeSmsVariables(v.label);
                return (
                  <button
                    key={normalizedKey}
                    type="button"
                    disabled={!canEditCatalog}
                    onClick={() => handleInsertVariable(normalizedKey)}
                    title={v.description}
                    className="rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-[11px] text-accent-gold hover:border-gold/60 transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {normalizedLabel}
                    {v.isOptional && <span className="ml-1 text-[9.5px] text-muted font-sans">(optional)</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <textarea
              ref={smsTextareaRef}
              rows={11}
              disabled={!canEditCatalog}
              value={smsTemplate}
              onChange={(e) => setSmsTemplate(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2.5 font-mono text-[12px] text-foreground focus:border-gold outline-none disabled:opacity-60 disabled:cursor-not-allowed leading-relaxed resize-y"
              placeholder={cleanDefaultSmsTemplate}
            />
          </div>
        </div>
      </div>
      </div>
      )}

      {tab === "services-loyalty" && (
      <div className="space-y-6">
      {/* SECTION: Services & Pricing */}
      <div>
        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2.5">
          <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
            Services & Pricing
          </div>
          {canEditServices && (
            <button
              onClick={handleAddService}
              className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10"
            >
              + Add Service
            </button>
          )}
        </div>
        <div className="text-[11px] text-muted mb-2.5">
          {canEditServices
            ? "You can edit prices, points, and add new services in this role."
            : "Prices and points are read-only for Front Desk. Only Supervisor or Owner roles can edit."}
        </div>
        <div className="space-y-2">
          {services.map((s, idx) => (
            <div
              key={s.id || idx}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 flex-wrap"
            >
              <div className="flex-1 text-[12.5px] font-bold text-foreground min-w-[120px]">
                {s.name}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted">Pts</span>
                <input
                  type="number"
                  disabled={!canEditServices}
                  defaultValue={s.points_earned}
                  key={`${s.id}-pts-${s.points_earned}`}
                  onBlur={(e) => handleUpdateServicePoints(idx, e.target.value)}
                  className="w-[70px] rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none disabled:opacity-50 disabled:cursor-not-allowed focus:border-gold"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted">₱</span>
                <input
                  type="number"
                  disabled={!canEditServices}
                  defaultValue={s.price}
                  key={`${s.id}-price-${s.price}`}
                  onBlur={(e) => handleUpdateServicePrice(idx, e.target.value)}
                  className="w-[70px] rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none disabled:opacity-50 disabled:cursor-not-allowed focus:border-gold"
                />
              </div>
              {canEditServices && (
                <button
                  onClick={() => handleDeleteService(idx)}
                  className="rounded-lg border border-[#5e3c3c] px-2 py-1 text-[10px] font-bold text-accent-red hover:brightness-125"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION: Loyalty Points Formula */}
      <LoyaltyFormulaSettings
        initialMode={initialLoyaltyFormulaMode}
        initialPesoPerPoint={initialPesoPerPoint}
        services={services}
        canEdit={canEditLoyaltyFormula}
        staffId={selectedStaffId}
      />
      </div>
      )}

      {tab === "promos-security" && (
      <div className="space-y-6">
      {/* SECTION: Void Authorization Code */}
      <VoidAuthCodeSettings
        initialConfigured={initialVoidAuthCodeConfigured}
        canEdit={canEditVoidAuthCode}
        staffId={selectedStaffId}
      />

      {/* SECTION: Walk-in Visit Claims */}
      <div>
        <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted mb-2.5">
          Walk-in Visit Claims
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 flex-wrap gap-2.5">
          <div>
            <div className="text-[13px] font-bold text-foreground">
              Allow Walk-in Visit Claims
            </div>
            <div className="text-[11px] text-muted mt-0.5">
              Allow receptionists to initiate claims for unlinked past walk-in visits from Member Profile drawers.
            </div>
            {!isOwner && (
              <div className="text-[10.5px] text-accent-gold/80 mt-1">
                Owner-only setting. Only the Owner role can modify this setting.
              </div>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <label
              className={`relative inline-block w-11 h-[25px] shrink-0 ${
                isOwner ? "cursor-pointer" : "cursor-not-allowed opacity-50"
              }`}
              title={!isOwner ? "Only the Owner role can change this setting" : undefined}
            >
              <input
                type="checkbox"
                className="opacity-0 w-0 h-0"
                checked={allowWalkinClaims}
                disabled={!isOwner || isSavingWalkinToggle}
                onChange={(e) => handleToggleWalkinClaims(e.target.checked)}
              />
              <span
                className={`absolute inset-0 rounded-full border transition-colors ${
                  allowWalkinClaims
                    ? "bg-gradient-to-br from-[#c89b3c] to-[#a97e2e] border-[#a97e2e]"
                    : "bg-[#1d1610] border-border"
                }`}
              >
                <span
                  className={`absolute top-[2px] left-[2px] w-[19px] h-[19px] rounded-full transition-transform ${
                    allowWalkinClaims
                      ? "translate-x-[19px] bg-background"
                      : "bg-muted"
                  }`}
                />
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* SECTION: Promo Codes */}
      <div>
        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2.5">
          <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
            Promo Codes
          </div>
          {canEditPromos && (
            <button
              onClick={handleOpenAddPromo}
              className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10"
            >
              + Add Promo
            </button>
          )}
        </div>
        <div className="text-[11px] text-muted mb-2.5">
          {canEditPromos
            ? "You can add, edit, or delete promos in this role."
            : "Read-only. Only the Owner role can edit promos."}
        </div>
        {promosError ? (
          <div className="rounded-xl border border-[#5e3c3c] bg-surface px-4 py-3 text-[11.5px] text-accent-red">
            Couldn&apos;t load promos. Try refreshing the page.
          </div>
        ) : promos.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface px-4 py-3 text-[11.5px] text-muted">
            {canEditPromos
              ? "No promos configured yet."
              : "No promos configured."}
          </div>
        ) : (
          <div className="space-y-2">
            {promos.map((p, idx) => {
              const draft = promoDrafts[p.id];
              const isDirty = draft !== undefined && parseInt(draft, 10) !== p.discount;
              const ruleSummary = formatPromoRuleSummary(p);
              return (
                <div
                  key={p.id || idx}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 flex-wrap"
                >
                  <div className="flex-1 min-w-[140px]">
                    <div className="text-[12px] font-bold text-foreground">
                      {p.label}
                    </div>
                    <div className="mt-0.5 text-[10.5px] font-medium text-accent-gold/90 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-gold/10 border border-gold/20 text-[10px]">
                        {ruleSummary}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-muted">-₱</span>
                    <input
                      type="number"
                      disabled={!canEditPromos}
                      value={draft ?? String(p.discount)}
                      onChange={(e) => handlePromoDraftChange(p.id, e.target.value)}
                      className="w-[70px] rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none disabled:opacity-50 focus:border-gold"
                    />
                  </div>
                  {canEditPromos && isDirty && (
                    <>
                      <button
                        onClick={() => handleCancelPromoDraft(p.id)}
                        className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold text-muted hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSavePromoDiscount(p)}
                        className="rounded-lg bg-gold px-2 py-1 text-[10px] font-bold text-black hover:brightness-110"
                      >
                        Save
                      </button>
                    </>
                  )}
                  {canEditPromos && (
                    <button
                      onClick={() => handleOpenEditPromo(p)}
                      className="rounded-lg border border-border px-2.5 py-1 text-[10px] font-bold text-foreground hover:border-gold hover:text-accent-gold"
                    >
                      Edit
                    </button>
                  )}
                  {canEditPromos && (
                    <button
                      onClick={() => handleDeletePromo(idx)}
                      className="rounded-lg border border-[#5e3c3c] px-2 py-1 text-[10px] font-bold text-accent-red hover:brightness-125"
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
      )}

      {tab === "scheduling-capacity" && (
      <div className="space-y-6">
      {/* SECTION: Weekend Fixed Time Slots */}
      <div>
        <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2.5">
          <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
            Weekend Fixed Time Slots
          </div>
          {canEditCatalog && (
            <button
              onClick={handleAddSlot}
              className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10"
            >
              + Add Slot
            </button>
          )}
        </div>
        {!canEditCatalog && (
          <div className="text-[10.5px] text-muted mb-2">
            Read-only for Front Desk. Only Supervisor or Owner roles can edit.
          </div>
        )}
        <div className="space-y-2">
          {weekendSlots.map((slot, idx) => (
            <div
              key={slot.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-2.5"
            >
              <div className="flex-1 font-mono text-xs font-semibold text-accent-gold">
                {fmtTime(slot.slot_time)}
              </div>
              {canEditCatalog && (
                <button
                  onClick={() => handleDeleteSlot(idx)}
                  className="rounded-lg border border-[#5e3c3c] px-2 py-1 text-[10px] font-bold text-accent-red hover:brightness-125"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* SECTION: Add-ons */}
      <div>
        <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2.5">
          <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
            Add-ons
          </div>
          {canEditCatalog && (
            <button
              onClick={handleAddAddon}
              className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10"
            >
              + Add Add-on
            </button>
          )}
        </div>
        {!canEditCatalog && (
          <div className="text-[10.5px] text-muted mb-2">
            Read-only for Front Desk. Only Supervisor or Owner roles can edit.
          </div>
        )}
        <div className="space-y-2">
          {addons.map((a, idx) => {
            const draft = addonDrafts[a.id];
            const isDirty = draft !== undefined && (parseInt(draft, 10) || 0) !== a.price;
            return (
              <div
                key={a.id || idx}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <div className="flex-1 text-[12.5px] font-bold text-foreground">
                  {a.name}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted">₱</span>
                  <input
                    type="number"
                    disabled={!canEditCatalog}
                    value={draft ?? String(a.price)}
                    onChange={(e) => handleAddonDraftChange(a.id, e.target.value)}
                    className="w-[70px] rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none disabled:opacity-50 focus:border-gold"
                  />
                </div>
                {canEditCatalog && isDirty && (
                  <>
                    <button
                      onClick={() => handleCancelAddonDraft(a.id)}
                      className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold text-muted hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveAddonPrice(a)}
                      className="rounded-lg bg-gold px-2 py-1 text-[10px] font-bold text-black hover:brightness-110"
                    >
                      Save
                    </button>
                  </>
                )}
                {canEditCatalog && (
                  <button
                    onClick={() => handleDeleteAddon(idx)}
                    className="rounded-lg border border-[#5e3c3c] px-2 py-1 text-[10px] font-bold text-accent-red hover:brightness-125"
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* SECTION: Capacity */}
      <div>
        <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted mb-2.5">
          Capacity
        </div>
        {!canEditCatalog && (
          <div className="text-[10.5px] text-muted mb-2">
            Read-only for Front Desk. Only Supervisor or Owner roles can edit.
          </div>
        )}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 flex-wrap gap-2.5">
            <div>
              <div className="text-[13px] font-bold text-foreground">Lockers</div>
              <div className="text-[11px] text-muted mt-0.5">
                {lockerCount} total — lockers can only be added, not removed
              </div>
            </div>
            {canEditCatalog && (
              <div className="flex items-center gap-2">
                <span className="w-10 text-center font-mono text-xs text-foreground">
                  +{lockerAddDraft}
                </span>
                <button
                  onClick={() => setLockerAddDraft((n) => Math.max(0, n - 1))}
                  disabled={lockerAddDraft === 0}
                  title="Lockers can only be added, not removed"
                  className="w-7 h-7 rounded-lg border border-border text-sm font-bold text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  −
                </button>
                <button
                  onClick={() => setLockerAddDraft((n) => n + 1)}
                  className="w-7 h-7 rounded-lg border border-border text-sm font-bold text-foreground hover:border-gold"
                >
                  +
                </button>
                <button
                  onClick={handleSaveLockers}
                  disabled={lockerAddDraft === 0}
                  className="rounded-lg bg-gold px-3 py-1.5 text-[11px] font-bold text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 flex-wrap gap-2.5">
            <div>
              <div className="text-[13px] font-bold text-foreground">
                Rooms / Beds
              </div>
              <div className="text-[11px] text-muted mt-0.5">
                {roomCount} total — editable, e.g. after a renovation
              </div>
            </div>
            {canEditCatalog ? (
              <div className="flex items-center gap-2">
                <span className="w-10 text-center font-mono text-xs text-foreground">
                  {roomCountDraft}
                </span>
                <button
                  onClick={() => setRoomCountDraft((n) => Math.max(0, n - 1))}
                  disabled={roomCountDraft === 0}
                  className="w-7 h-7 rounded-lg border border-border text-sm font-bold text-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  −
                </button>
                <button
                  onClick={() => setRoomCountDraft((n) => n + 1)}
                  className="w-7 h-7 rounded-lg border border-border text-sm font-bold text-foreground hover:border-gold"
                >
                  +
                </button>
                <button
                  onClick={handleSaveRoomCount}
                  disabled={roomCountDraft === roomCount}
                  className="rounded-lg bg-gold px-3 py-1.5 text-[11px] font-bold text-black hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            ) : (
              <span className="font-mono text-xs text-muted">{roomCount}</span>
            )}
          </div>
        </div>
      </div>
      </div>
      )}

      {/* Prompt / Modal Dialog */}
      {promptDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const values: Record<string, string> = {};
              promptDialog.fields.forEach((f) => {
                values[f.name] = (formData.get(f.name) as string) || "";
              });
              promptDialog.onConfirm(values);
              setPromptDialog(null);
            }}
            className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-2xl space-y-4"
          >
            <h3 className="text-base font-bold text-foreground">
              {promptDialog.title}
            </h3>
            <div className="space-y-3">
              {promptDialog.fields.map((f) => (
                <div key={f.name}>
                  <label className="block text-[10px] font-bold tracking-wider uppercase text-muted mb-1">
                    {f.label}
                  </label>
                  <input
                    type={f.type || "text"}
                    name={f.name}
                    defaultValue={f.defaultValue}
                    autoFocus={f === promptDialog.fields[0]}
                    required
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-foreground outline-none focus:border-gold"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPromptDialog(null)}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 rounded-lg bg-gold py-2 text-xs font-bold text-black hover:brightness-110"
              >
                Confirm
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Dedicated Promo Configuration Modal (Add / Edit) */}
      {promoModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-base font-bold text-foreground">
                  {promoModal.mode === "add" ? "Add New Promo Code" : "Edit Promo Code"}
                </h3>
                <p className="text-[11px] text-muted mt-0.5">
                  Set promo discount, day restrictions, shifts, and guest count requirements.
                </p>
              </div>
              <span className="rounded-md bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-accent-gold uppercase tracking-wider border border-gold/20">
                {promoModal.mode === "add" ? "New" : "Config"}
              </span>
            </div>

            {promoModal.error && (
              <div className="rounded-lg border border-[#5e3c3c] bg-surface-2 p-2.5 text-xs text-accent-red">
                {promoModal.error}
              </div>
            )}

            <div className="space-y-4">
              {/* Promo Name / Label */}
              <div>
                <label className="block text-[10.5px] font-bold tracking-wider uppercase text-muted mb-1">
                  Promo Name / Label
                </label>
                <input
                  type="text"
                  value={promoModal.label}
                  placeholder="e.g. Early Bird Special or Barkada Pass"
                  onChange={(e) =>
                    setPromoModal((prev) => ({ ...prev, label: e.target.value, error: null }))
                  }
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-gold"
                />
              </div>

              {/* Discount Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10.5px] font-bold tracking-wider uppercase text-muted mb-1">
                    Discount Amount (₱)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={promoModal.discount}
                    onChange={(e) =>
                      setPromoModal((prev) => ({
                        ...prev,
                        discount: Number(e.target.value) || 0,
                      }))
                    }
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-gold"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-bold tracking-wider uppercase text-muted mb-1">
                    Minimum Guests (Pax)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={promoModal.minPax}
                    onChange={(e) =>
                      setPromoModal((prev) => ({
                        ...prev,
                        minPax: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-gold"
                  />
                  <div className="text-[10px] text-muted mt-1">Default 1 guest</div>
                </div>
              </div>

              {/* Day Restriction Selector */}
              <div className="border-t border-border pt-3">
                <label className="block text-[10.5px] font-bold tracking-wider uppercase text-muted mb-2">
                  Day Restriction
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2.5">
                  {(
                    [
                      { id: "any", label: "Any Day" },
                      { id: "weekdays", label: "Weekdays (Mon-Fri)" },
                      { id: "weekends", label: "Weekends (Sat-Sun)" },
                      { id: "custom", label: "Custom Days" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setPromoModal((prev) => ({
                          ...prev,
                          dayType: opt.id,
                          selectedDays:
                            opt.id === "weekdays"
                              ? ["Mon", "Tue", "Wed", "Thu", "Fri"]
                              : opt.id === "weekends"
                              ? ["Sat", "Sun"]
                              : opt.id === "any"
                              ? []
                              : prev.selectedDays,
                        }))
                      }
                      className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold transition text-center ${
                        promoModal.dayType === opt.id
                          ? "border-[#a97e2e] bg-gold/15 text-accent-gold"
                          : "border-border bg-surface-2 text-muted hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Custom Multi-select Day Pills */}
                {promoModal.dayType === "custom" && (
                  <div className="p-2.5 rounded-xl border border-border bg-surface-2 space-y-1.5">
                    <div className="text-[10px] text-muted">Select applicable operating days:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {DAYS_OF_WEEK.map((d) => {
                        const isSelected = promoModal.selectedDays.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() =>
                              setPromoModal((prev) => {
                                const next = isSelected
                                  ? prev.selectedDays.filter((item) => item !== d)
                                  : [...prev.selectedDays, d];
                                return { ...prev, selectedDays: next };
                              })
                            }
                            className={`px-2.5 py-1 rounded-md border text-xs font-semibold transition ${
                              isSelected
                                ? "border-gold bg-gold text-black font-bold shadow-sm"
                                : "border-border bg-surface text-muted hover:text-foreground"
                            }`}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Timeslot Restriction Selector */}
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10.5px] font-bold tracking-wider uppercase text-muted">
                    Timeslot Restriction
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setPromoModal((prev) => ({
                        ...prev,
                        slotType: prev.slotType === "any" ? "custom" : "any",
                        selectedSlots: prev.slotType === "any" ? [...STANDARD_SHIFT_SLOTS] : [],
                      }))
                    }
                    className="text-[11px] text-accent-gold underline hover:brightness-110"
                  >
                    {promoModal.slotType === "any" ? "Restrict to specific slots" : "Toggle Any Slot"}
                  </button>
                </div>

                {promoModal.slotType === "any" ? (
                  <div className="rounded-lg border border-border bg-surface-2 p-2.5 text-xs text-muted">
                    ✓ Valid during any operating shift time slot (Any Slot).
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl border border-border bg-surface-2 space-y-2">
                    <div className="text-[10px] text-muted">
                      Select all standard shift slots where this promo applies:
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {STANDARD_SHIFT_SLOTS.map((slot) => {
                        const isSelected = promoModal.selectedSlots.includes(slot);
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() =>
                              setPromoModal((prev) => {
                                const next = isSelected
                                  ? prev.selectedSlots.filter((s) => s !== slot)
                                  : [...prev.selectedSlots, slot];
                                return { ...prev, selectedSlots: next };
                              })
                            }
                            className={`px-2 py-1.5 rounded-md border font-mono text-[11px] transition text-center ${
                              isSelected
                                ? "border-gold bg-gold text-black font-bold shadow-sm"
                                : "border-border bg-surface text-muted hover:text-foreground"
                            }`}
                          >
                            {slot.replace(/^0/, "")}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex gap-2.5 pt-3 border-t border-border">
              <button
                type="button"
                disabled={promoModal.loading}
                onClick={() => setPromoModal((prev) => ({ ...prev, open: false }))}
                className="flex-1 rounded-lg border border-border py-2 text-xs font-bold text-muted hover:text-foreground transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={promoModal.loading}
                onClick={handleSavePromoModal}
                className="flex-1 rounded-lg bg-gold py-2 text-xs font-bold text-black hover:brightness-110 transition disabled:opacity-50"
              >
                {promoModal.loading ? "Saving..." : promoModal.mode === "add" ? "Create Promo" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {deleteConfirm && (
        <ConfirmDialog
          title={deleteConfirm.title}
          message={deleteConfirm.message}
          confirmLabel="Confirm Delete"
          onConfirm={deleteConfirm.onConfirm}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl border border-[#a97e2e] bg-surface-2 px-5 py-2.5 font-mono text-xs font-semibold text-accent-gold shadow-2xl animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
