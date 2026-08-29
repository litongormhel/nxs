"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PortalRegisterPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/portal/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, pin, name }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Registration failed.");
        return;
      }

      router.push("/portal/confirmation");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-sm border border-border bg-surface rounded-lg p-8">
      <h1 className="text-lg font-semibold text-gold mb-1">Welcome to NXS</h1>
      <p className="text-sm text-muted mb-6">Register to start earning points.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-sm text-red-400 border border-red-900/50 bg-red-950/30 rounded-md px-3 py-2">
            {error}
          </p>
        )}
        <div>
          <label htmlFor="name" className="block text-xs text-muted mb-1">
            Name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </div>
        <div>
          <label htmlFor="phone" className="block text-xs text-muted mb-1">
            Phone number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            required
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </div>
        <div>
          <label htmlFor="pin" className="block text-xs text-muted mb-1">
            PIN (4-8 digits)
          </label>
          <input
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="\d{4,8}"
            required
            autoComplete="new-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-gold"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-gold hover:bg-gold-hover text-background font-medium py-2 text-sm disabled:opacity-50"
        >
          {submitting ? "Registering..." : "Register"}
        </button>
      </form>

      <p className="text-xs text-muted mt-4 text-center">
        Already registered?{" "}
        <a href="/portal/login" className="text-gold hover:text-gold-hover">
          Log in
        </a>
      </p>
    </div>
  );
}
