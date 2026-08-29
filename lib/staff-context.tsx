"use client";

import { createContext, useContext } from "react";

export type SimStaffMember = {
  id: string;
  name: string;
  position: string;
};

type StaffSimContextValue = {
  currentStaff: SimStaffMember | null;
  currentRole: string | null;
  /** The real authenticated staff member for this session, or null on the
   * /login page before signing in. Every other route is guaranteed a
   * session by proxy.ts's login gate. */
  sessionStaff: SimStaffMember | null;
};

const StaffSimContext = createContext<StaffSimContextValue | null>(null);

export function StaffSimProvider({
  sessionStaff,
  children,
}: {
  sessionStaff: SimStaffMember | null;
  children: React.ReactNode;
}) {
  const currentRole = sessionStaff
    ? sessionStaff.position === "Receptionist"
      ? "Front Desk"
      : sessionStaff.position
    : null;

  return (
    <StaffSimContext.Provider
      value={{
        currentStaff: sessionStaff,
        currentRole,
        sessionStaff,
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
