"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#0a0705] text-[#ece3d1]">
      <p>Redirecting to NXS Spa Dashboard...</p>
    </div>
  );
}
