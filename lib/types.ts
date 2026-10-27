export type SessionUser = {
  userId: string;
  email: string;
  name: string;
  departmentId: string;
  role: "Admin" | "Super Admin" | "Department User";
};

export type Department = { id: string; name: string; order: number; backDateEditDays?: number };
export type Category = { id: string; deptId: string; name: string; order: number };
export type Item = { id: string; deptId: string; catId: string; name: string; unit: string; order: number };
export type Section = {
  id: string; name: string; order: number; deptId: string;
  movementSign?: "PLUS" | "MINUS"; includeInReconciliation?: boolean;
};
export type DeptSection = { id: string; name: string; displayName: string; order: number };

export type MasterData = {
  departments: Department[];
  categories: Category[];
  items: Item[];
  sections: Section[];
};

export type EntryHistoryItem = {
  entryId: string;
  qty: number;
  enteredBy: string;
  createdAt: string;
  status: "Active" | "Void";
  voidReason: string;
};

export type EntryRow = {
  entryId: string;
  itemName: string;
  category: string;
  sectionName: string;
  qty: number;
  enteredBy: string;
  createdAt: string;
  updatedAt?: string;
  hasActive: boolean;
  isCorrection: boolean;
  history: EntryHistoryItem[];
  locked: boolean;
};

export const SECTION_COLORS: Record<string, string> = {
  Opening: "#D9752E",
  Production: "#3E8E5B",
  "KOT Transfer": "#2E6DAE",
  Transfer: "#7A4FB0",
  "Other Transfer": "#B08A1E",
  "In Hand": "#1E7F72",
  Wastage: "#C0463F",
};

export const SECTION_ICONS: Record<string, string> = {
  Opening: "\u2600",
  Production: "\u2699",
  "KOT Transfer": "\u2192",
  Transfer: "\u21c6",
  "Other Transfer": "\u22ee",
  "In Hand": "\u25a1",
  Wastage: "\u26a0",
};


// ---------------- Stock Reconciliation ----------------
export type MovementDef = { id: string; name: string; sign: "PLUS" | "MINUS"; order: number };

export type ReconciliationRow = {
  itemId: string;
  itemName: string;
  categoryId: string;
  categoryName: string;
  departmentId: string;
  departmentName: string;
  unit: string;
  opening: number;
  movements: Record<string, number>;
  actual: number;
  expected: number;
  variance: number;
  status: "MATCHED" | "SHORT" | "EXCESS";
};

export type ReconciliationSummary = {
  totalItems: number;
  expected: number;
  actual: number;
  variance: number;
  matched: number;
  short: number;
  excess: number;
};

// ---------------- Access Menu ----------------
export type SpecialAccessGrant = {
  id: string;
  departmentId: string;
  departmentName: string;
  itemId: string;
  itemName: string;
  dateKey: string;
  grantedBy: string;
  grantedAt: string;
  active: boolean;
};
