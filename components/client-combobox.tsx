"use client";

import { useState, useRef, useEffect, useMemo, KeyboardEvent } from "react";
import type { Client } from "@/components/booking-browser";

interface ClientComboboxProps {
  id?: string;
  clients: Client[];
  value: string; // "__walkin__" or client id
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ClientCombobox({
  id = "bClient",
  clients,
  value,
  onChange,
  placeholder = "Search member or leave as No Account...",
}: ClientComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 1. Ensure only active members with a portal account appear in the dropdown
  const activeMembers = useMemo(() => {
    return (clients ?? []).filter((c) => c.has_portal_account);
  }, [clients]);

  // Selected member object
  const selectedMember = useMemo(() => {
    if (!value || value === "__walkin__") return null;
    return activeMembers.find((c) => c.id === value) ?? null;
  }, [activeMembers, value]);

  // Filtered members based on query
  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeMembers;
    return activeMembers.filter(
      (c) =>
        c.codename.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        (c.member_code && c.member_code.toLowerCase().includes(q))
    );
  }, [activeMembers, query]);

  // Combined options list (Option 0 is always Walk-in / No Account)
  const options = useMemo(() => {
    return [
      { id: "__walkin__", label: "— Walk-in / No account —", memberCode: undefined as string | undefined, isWalkin: true },
      ...filteredMembers.map((c) => ({
        id: c.id,
        label: `${c.codename} (@${c.username})`,
        memberCode: c.member_code,
        isWalkin: false,
      })),
    ];
  }, [filteredMembers]);

  // Reset highlighted index when options change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [options.length, query]);

  // Handle click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleSelect(optionId: string) {
    onChange(optionId);
    setQuery("");
    setIsOpen(false);
  }

  function handleClear() {
    onChange("__walkin__");
    setQuery("");
    setIsOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : prev));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (options[highlightedIndex]) {
        handleSelect(options[highlightedIndex].id);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  }

  // Value to display in input when unfocused vs when open and typing
  const displayInputText = isOpen
    ? query
    : selectedMember
    ? `${selectedMember.codename} (@${selectedMember.username})`
    : "No Account";

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center">
        <input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          value={displayInputText}
          placeholder={
            isOpen
              ? selectedMember
                ? `${selectedMember.codename} (@${selectedMember.username})`
                : placeholder
              : undefined
          }
          onFocus={() => {
            setIsOpen(true);
            setQuery("");
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 pr-9 text-sm text-foreground focus:border-gold outline-none"
        />

        {/* Clear button or dropdown arrow indicator */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 mt-0.5">
          {selectedMember || query ? (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-muted hover:text-foreground p-1"
              title="Clear selection (reset to No Account)"
            >
              ✕
            </button>
          ) : (
            <span className="text-xs text-muted pointer-events-none">▼</span>
          )}
        </div>
      </div>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-xl shadow-black/60">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted italic">No active members found</div>
          ) : (
            options.map((option, index) => {
              const isSelected = value === option.id;
              const isHighlighted = highlightedIndex === index;

              return (
                <div
                  key={option.id}
                  onClick={() => handleSelect(option.id)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex items-center justify-between px-3 py-2 text-sm rounded cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-gold/20 text-gold font-medium"
                      : isHighlighted
                      ? "bg-gold/10 text-gold"
                      : "text-foreground"
                  } ${option.isWalkin ? "italic text-muted hover:text-foreground" : ""}`}
                >
                  <span className="truncate">{option.label}</span>
                  {option.memberCode && (
                    <span className="text-xs text-muted font-mono ml-2">#{option.memberCode}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
