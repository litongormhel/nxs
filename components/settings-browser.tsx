"use client";

import { useState, useEffect } from "react";
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
  addLockerBatch,
  updateRoomCount,
} from "@/app/(staff)/settings/actions";
import { compareSlotTimes } from "@/lib/bookings/slots";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useTheme } from "@/lib/theme-context";

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

export function SettingsBrowser({
  initialServices,
  initialPromos,
  initialAddons,
  initialWeekendSlots,
  initialLockersCount,
  initialRoomsCount,
}: {
  initialServices: Service[];
  initialPromos: Promo[];
  initialAddons: Addon[];
  initialWeekendSlots: WeekendSlot[];
  initialLockersCount: number;
  initialRoomsCount: number;
}) {
  const router = useRouter();

  // Theme state (global, see lib/theme-context.tsx)
  const { isLightMode, setIsLightMode } = useTheme();

  const { currentStaff, currentRole, sessionStaff } = useStaffSim();
  const selectedStaffId = sessionStaff?.id ?? "";

  const canEditServices =
    currentRole === "Supervisor" || currentRole === "Owner";
  const canEditPromos =
    currentRole === "Supervisor" || currentRole === "Owner";
  const canEditCatalog =
    currentRole === "Supervisor" || currentRole === "Owner";

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

  const [promos, setPromos] = useState<Promo[]>(() => {
    if (initialPromos && initialPromos.length > 0) return initialPromos;
    return [
      { id: "amba2", label: "AMBA · NXSKD100", discount: 100 },
      { id: "birthmonth", label: "Birthmonth", discount: 200 },
      { id: "birthmonth_exact", label: "Birthmonth Exact Date", discount: 500 },
      { id: "squad3", label: "Squad Goals 3pax", discount: 150 },
      { id: "squad4", label: "Squad Goals 4pax", discount: 200 },
      { id: "earlybird", label: "Early Bird 4/5:30PM", discount: 200 },
    ];
  });

  const [weekendSlots, setWeekendSlots] = useState<WeekendSlot[]>(
    initialWeekendSlots ?? []
  );

  const [addons, setAddons] = useState<Addon[]>(() => {
    if (initialAddons && initialAddons.length > 0) return initialAddons;
    return [{ id: "1", name: "Towel", price: 50 }];
  });

  const [lockerCount, setLockerCount] = useState<number>(
    initialLockersCount || 100
  );
  const [roomCount, setRoomCount] = useState<number>(initialRoomsCount || 18);
  const [roomCountDraft, setRoomCountDraft] = useState<string>(
    String(initialRoomsCount || 18)
  );

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
  const handleUpdatePromoDiscount = async (index: number, val: string) => {
    const num = parseInt(val, 10) || 0;
    const promo = promos[index];
    const updated = [...promos];
    updated[index] = { ...updated[index], discount: num };
    setPromos(updated);
    const res = await updatePromoDiscount(promo.id, num, selectedStaffId);
    if (!res.ok) {
      showToast(`Failed to update ${promo.label} discount: ${res.error}`);
      return;
    }
    showToast(`${promo.label} discount updated to -₱${num}`);
    router.refresh();
  };

  const handleAddPromo = () => {
    setPromptDialog({
      type: "promo",
      title: "Add New Promo Code",
      fields: [
        { name: "label", label: "Promo Name / Label", defaultValue: "" },
        { name: "discount", label: "Discount Amount (₱)", defaultValue: "100", type: "number" },
      ],
      onConfirm: async (values) => {
        const label = values.label.trim();
        if (!label) return;
        const discount = parseInt(values.discount, 10) || 100;
        const res = await addPromo(label, discount, selectedStaffId);
        if (!res.ok) {
          showToast(`Failed to add ${label}: ${res.error}`);
          return;
        }
        const newPromo: Promo = {
          id: res.id!,
          label,
          discount,
        };
        setPromos((prev) => [...prev, newPromo]);
        showToast(`${label} added`);
        router.refresh();
      },
    });
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
  const handleUpdateAddonPrice = async (index: number, val: string) => {
    const num = parseInt(val, 10) || 0;
    const addon = addons[index];
    const updated = [...addons];
    updated[index] = { ...updated[index], price: num };
    setAddons(updated);
    const res = await updateAddonPrice(addon.id, num, selectedStaffId);
    if (!res.ok) {
      showToast(`Failed to update ${addon.name} price: ${res.error}`);
      return;
    }
    showToast(`${addon.name} price updated to ₱${num}`);
    router.refresh();
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
  const handleAddLockers = async () => {
    const res = await addLockerBatch(selectedStaffId);
    if (!res.ok) {
      showToast(`Failed to add lockers: ${res.error}`);
      return;
    }
    const updated = lockerCount + 10;
    setLockerCount(updated);
    showToast(`Locker count increased to ${updated}`);
    router.refresh();
  };

  const handleUpdateRoomCount = async (val: string) => {
    const num = parseInt(val, 10) || 18;
    if (num === roomCount) return;
    const res = await updateRoomCount(num, selectedStaffId);
    if (!res.ok) {
      showToast(`Failed to update room count: ${res.error}`);
      setRoomCountDraft(String(roomCount));
      return;
    }
    setRoomCount(num);
    showToast(`Room/bed count set to ${num}`);
    router.refresh();
  };

  return (
    <div className="max-w-4xl space-y-6">
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

      {/* SECTION: Promo Codes */}
      <div>
        <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2.5">
          <div className="text-[10.5px] font-bold tracking-[0.13em] uppercase text-muted">
            Promo Codes
          </div>
          {canEditPromos && (
            <button
              onClick={handleAddPromo}
              className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10"
            >
              + Add Promo
            </button>
          )}
        </div>
        <div className="text-[11px] text-muted mb-2.5">
          {canEditPromos
            ? "You can add, edit, or delete promos in this role."
            : "Read-only for Front Desk. Only Supervisor or Owner roles can edit."}
        </div>
        <div className="space-y-2">
          {promos.map((p, idx) => (
            <div
              key={p.id || idx}
              className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <div className="flex-1 text-[12px] font-bold text-foreground">
                {p.label}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted">-₱</span>
                <input
                  type="number"
                  disabled={!canEditPromos}
                  defaultValue={p.discount}
                  key={`${p.id}-discount-${p.discount}`}
                  onBlur={(e) => handleUpdatePromoDiscount(idx, e.target.value)}
                  className="w-[70px] rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none disabled:opacity-50 focus:border-gold"
                />
              </div>
              {canEditPromos && (
                <button
                  onClick={() => handleDeletePromo(idx)}
                  className="rounded-lg border border-[#5e3c3c] px-2 py-1 text-[10px] font-bold text-accent-red hover:brightness-125"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

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
          {addons.map((a, idx) => (
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
                  defaultValue={a.price}
                  key={`${a.id}-price-${a.price}`}
                  onBlur={(e) => handleUpdateAddonPrice(idx, e.target.value)}
                  disabled={!canEditCatalog}
                  className="w-[70px] rounded-lg border border-border bg-surface px-2 py-1.5 font-mono text-[11.5px] text-foreground outline-none focus:border-gold disabled:opacity-50"
                />
              </div>
              {canEditCatalog && (
                <button
                  onClick={() => handleDeleteAddon(idx)}
                  className="rounded-lg border border-[#5e3c3c] px-2 py-1 text-[10px] font-bold text-accent-red hover:brightness-125"
                >
                  Delete
                </button>
              )}
            </div>
          ))}
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
              <div className="text-[11px] text-muted mt-0.5">{lockerCount} total</div>
            </div>
            {canEditCatalog && (
              <button
                onClick={handleAddLockers}
                className="rounded-lg border border-[#a97e2e] bg-surface px-3 py-1.5 text-[11px] font-bold text-accent-gold transition hover:bg-[#c89b3c]/10"
              >
                + Add 10 Lockers
              </button>
            )}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4 flex-wrap gap-2.5">
            <div>
              <div className="text-[13px] font-bold text-foreground">
                Rooms / Beds
              </div>
              <div className="text-[11px] text-muted mt-0.5">
                Editable — e.g. after a renovation
              </div>
            </div>
            <input
              type="number"
              value={roomCountDraft}
              onChange={(e) => setRoomCountDraft(e.target.value)}
              onBlur={(e) => handleUpdateRoomCount(e.target.value)}
              disabled={!canEditCatalog}
              className="w-20 rounded-lg border border-border bg-surface px-2.5 py-2 font-mono text-xs text-foreground outline-none focus:border-gold disabled:opacity-50"
            />
          </div>
        </div>
      </div>

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
