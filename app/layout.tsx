import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/sidebar";
import { StaffSimProvider } from "@/lib/staff-context";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NXS",
  description: "NXS operations console",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: staff } = await supabase
    .from("staff")
    .select("id, name, position")
    .eq("active", true)
    .order("name", { ascending: true });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let sessionStaff = null;
  if (user) {
    const { data: staffRow } = await supabase
      .from("staff")
      .select("id, name, position")
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();
    sessionStaff = staffRow ?? null;
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex bg-background text-foreground">
        <StaffSimProvider initialStaff={staff ?? []} sessionStaff={sessionStaff}>
          <Sidebar />
          <main className="flex-1 min-h-full overflow-y-auto">{children}</main>
        </StaffSimProvider>
      </body>
    </html>
  );
}
