"use client";

import { useState } from "react";

type Client = {
  id: string;
  codename: string;
  username: string;
  member_code: string;
  points_balance: number;
};

const REWARD_THRESHOLD = 100;

export function ClientBrowser({ clients }: { clients: Client[] }) {
  const [selectedId, setSelectedId] = useState<string>(clients[0].id);
  const selected = clients.find((client) => client.id === selectedId) ?? clients[0];

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-wrap gap-2">
        {clients.map((client) => {
          const active = client.id === selected.id;
          return (
            <button
              key={client.id}
              type="button"
              onClick={() => setSelectedId(client.id)}
              className={`rounded-full border px-4 py-2 text-left text-sm transition-colors ${
                active
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border bg-surface text-foreground hover:border-gold/30"
              }`}
            >
              <span className="font-medium">{client.codename}</span>
              <span className="ml-2 text-muted">@{client.username}</span>
              <span className="ml-2 text-muted">· {client.points_balance} pts</span>
            </button>
          );
        })}
      </div>

      <div className="h-fit rounded-lg border border-border bg-surface p-5">
        <h2 className="text-sm font-medium text-muted uppercase tracking-wide">
          Client Details
        </h2>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-muted">Codename</p>
            <p className="text-lg font-semibold text-gold">{selected.codename}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Username</p>
            <p className="text-sm text-foreground">@{selected.username}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Member Code</p>
            <p className="text-sm text-foreground">{selected.member_code}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Points Balance</p>
            <p className="text-sm text-foreground">{selected.points_balance}</p>
          </div>

          {selected.points_balance >= REWARD_THRESHOLD && (
            <span className="inline-block rounded-full border border-gold bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
              Eligible for Reward
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
