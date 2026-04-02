import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import {
  CONTACTS_DIRECTORY,
  type DirectoryContact,
} from "../../../data/contactsDirectory";

export type DirectoryCategory = "all" | "clients" | "vendors" | "venues";

export function matchesCategory(c: DirectoryContact, cat: DirectoryCategory): boolean {
  switch (cat) {
    case "all":
      return true;
    case "clients":
      return c.stakeholderGroup === "couple";
    case "vendors":
      return c.stakeholderGroup === "planning" || c.stakeholderGroup === "vendor";
    case "venues":
      return (
        c.role.toLowerCase().includes("venue") ||
        (c.logisticsRole?.toLowerCase().includes("venue") ?? false)
      );
  }
}

export function categoryLabel(cat: DirectoryCategory): string {
  switch (cat) {
    case "all": return "All Contacts";
    case "clients": return "Clients";
    case "vendors": return "Vendors";
    case "venues": return "Venues";
  }
}

export type SelectedRow =
  | { kind: "contact"; data: DirectoryContact }
  | null;

interface DirectoryModeState {
  selectedRow: SelectedRow;
  setSelectedRow: (row: SelectedRow) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  contacts: DirectoryContact[];
  activeCategory: DirectoryCategory;
  setActiveCategory: (cat: DirectoryCategory) => void;
  categoryCounts: Record<DirectoryCategory, number>;
}

const Ctx = createContext<DirectoryModeState | null>(null);

export function useDirectoryMode() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDirectoryMode must be used within DirectoryModeProvider");
  return ctx;
}

export function DirectoryModeProvider({ children }: { children: ReactNode }) {
  const [selectedRow, setSelectedRow] = useState<SelectedRow>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<DirectoryCategory>("all");

  const categoryCounts = useMemo<Record<DirectoryCategory, number>>(() => ({
    all: CONTACTS_DIRECTORY.length,
    clients: CONTACTS_DIRECTORY.filter((c) => matchesCategory(c, "clients")).length,
    vendors: CONTACTS_DIRECTORY.filter((c) => matchesCategory(c, "vendors")).length,
    venues: CONTACTS_DIRECTORY.filter((c) => matchesCategory(c, "venues")).length,
  }), []);

  return (
    <Ctx.Provider
      value={{
        selectedRow,
        setSelectedRow,
        searchQuery,
        setSearchQuery,
        contacts: CONTACTS_DIRECTORY,
        activeCategory,
        setActiveCategory,
        categoryCounts,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
