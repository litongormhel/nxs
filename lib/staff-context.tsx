"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type SimStaffMember = {
  id: string;
  name: string;
  position: string;
};

type StaffSimContextValue = {
  staffList: SimStaffMember[];
  loginableStaff: SimStaffMember[];
  selectedStaffId: string;
  setSelectedStaffId: (id: string) => void;
  currentStaff: SimStaffMember;
  currentRole: string;
};

const STORAGE_KEY = "nxs_sim_staff_id";

const FALLBACK_STAFF: SimStaffMember[] = [
  { id: "1", name: "J. Cruz", position: "Owner" },
  { id: "2", name: "Ana", position: "Receptionist" },
];

const StaffSimContext = createContext<StaffSimContextValue | null>(null);

export function StaffSimProvider({
  initialStaff,
  children,
}: {
  initialStaff: SimStaffMember[];
  children: React.ReactNode;
}) {
  const staffList = initialStaff.length > 0 ? initialStaff : FALLBACK_STAFF;

  const loginableStaff = staffList.filter(
    (s) =>
      s.position === "Receptionist" ||
      s.position === "Supervisor" ||
      s.position === "Owner"
  );

  const [selectedStaffId, setSelectedStaffIdState] = useState<string>(() => {
    const ana = loginableStaff.find((s) => s.name === "Ana");
    return ana ? ana.id : loginableStaff[0]?.id ?? staffList[0]?.id ?? "2";
  });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && loginableStaff.some((s) => s.id === stored)) {
        setSelectedStaffIdState(stored);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    } catch {
      // localStorage unavailable — stay on the default selection
    }
  }, []);

  const setSelectedStaffId = (id: string) => {
    setSelectedStaffIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // localStorage unavailable — selection stays in-memory only
    }
  };

  const currentStaff =
    loginableStaff.find((s) => s.id === selectedStaffId) ||
    loginableStaff[0] || { id: "2", name: "Ana", position: "Receptionist" };

  const currentRole =
    currentStaff.position === "Receptionist"
      ? "Front Desk"
      : currentStaff.position;

  return (
    <StaffSimContext.Provider
      value={{
        staffList,
        loginableStaff,
        selectedStaffId,
        setSelectedStaffId,
        currentStaff,
        currentRole,
      }}
    >
      {children}
    </StaffSimContext.Provider>
  );
}

export function useStaffSim() {
  const ctx = useContext(StaffSimContext);
  if (!ctx) {
    throw new Error("useStaffSim must be used within a StaffSimProvider");
  }
  return ctx;
}
