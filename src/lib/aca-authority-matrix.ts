/**
 * Authority Matrix for Authority to Conduct Activity (ACA).
 * Seeded from GD-01-002 / Annex III (Rev. Feb 2026). Structured for later config UI.
 */

export const ACA_ALL_EXECOM_SEAT_COUNT = 6;
export const ACA_FOUR_EXECOM_SEAT_COUNT = 4;

export type AcaRecommendingLevel = "RA_1" | "RA_2" | "RA_3" | "RA_4" | "EXECOM";

export type AcaApprovingPath =
  | "AP_1"
  | "AP_2"
  | "AP_3"
  | "AP_4"
  | "FOUR_EXECOMS"
  | "ALL_EXECOM";

export type AcaAmountBand = {
  /** Inclusive lower bound in PHP; null = open/unbounded below (use with regardless or 0). */
  minInclusive: number | null;
  /** Inclusive upper bound; null = open-ended above. */
  maxInclusive: number | null;
  regardlessOfAmount?: boolean;
  approvingPath: AcaApprovingPath;
};

export type AcaMatrixRow = {
  category: string;
  natureOfRequest: string;
  recommendingApprover: AcaRecommendingLevel;
  bands: AcaAmountBand[];
  /** Amounts strictly below this do not require an ACA. */
  noAcaBelow?: number;
  remarks?: string;
};

export const ACA_RECOMMENDING_LABELS: Record<AcaRecommendingLevel, string> = {
  RA_1: "RA 1 — Store/Branch Head/Supervisor",
  RA_2: "RA 2 — Regional/Area Manager/SBU Head",
  RA_3: "RA 3 — General Sales Manager/Department Head",
  RA_4: "RA 4 — Any ExeCom",
  EXECOM: "ExeCom (recommending)",
};

export const ACA_APPROVING_PATH_LABELS: Record<AcaApprovingPath, string> = {
  AP_1: "AP 1 — Store/Branch Head/Supervisor",
  AP_2: "AP 2 — Regional/Area Manager/SBU Head",
  AP_3: "AP 3 — General Sales Manager/Department Head",
  AP_4: "AP 4 — ExeCom",
  FOUR_EXECOMS: "4 ExeComs",
  ALL_EXECOM: "All ExeCom",
};

function band(
  minInclusive: number | null,
  maxInclusive: number | null,
  approvingPath: AcaApprovingPath,
  regardlessOfAmount?: boolean,
): AcaAmountBand {
  return { minInclusive, maxInclusive, approvingPath, regardlessOfAmount };
}

function row(
  category: string,
  natureOfRequest: string,
  recommendingApprover: AcaRecommendingLevel,
  bands: AcaAmountBand[],
  opts?: { noAcaBelow?: number; remarks?: string },
): AcaMatrixRow {
  return {
    category,
    natureOfRequest,
    recommendingApprover,
    bands,
    noAcaBelow: opts?.noAcaBelow,
    remarks: opts?.remarks,
  };
}

/** Full Annex III seed (categories + natures + thresholds).
 * Column rule (verified against PDF):
 * - AP 1 has no amount conditions (column always empty).
 * - Amount bands start at the AP column matching the recommending level
 *   (RA1→AP2 because AP1 is unused; RA2→AP2; RA3→AP3; then fill rightward).
 * - "Regardless" usually sits one column to the right of that start (RA2→AP3,
 *   RA3→AP4, RA4→All ExeCom), except strategic store/company-wide rows that
 *   sit under 4 ExeComs / All ExeCom in the PDF.
 * OCR omits empty AP 1 cells — never left-align into AP_1.
 */
export const ACA_AUTHORITY_MATRIX: AcaMatrixRow[] = [
  // Office Supplies
  row("Office Supplies", "Office supplies", "RA_1", [
    band(3001, 5000, "AP_2"),
    band(5000.01, null, "AP_3"),
  ], { noAcaBelow: 3000, remarks: "P3,000 and below — no need for ACA" }),

  // Travel and Meals
  row("Travel and Meals", "Local", "RA_3", [band(null, null, "AP_4", true)]),
  row("Travel and Meals", "International", "RA_4", [band(null, null, "ALL_EXECOM", true)]),

  // Repairs & Maintenance
  row("Repairs & Maintenance", "Office Equipment", "RA_1", [
    band(3001, 5000, "AP_2"),
    band(5001, 10000, "AP_3"),
    band(10000.01, null, "AP_4"),
  ], { noAcaBelow: 3000 }),
  row("Repairs & Maintenance", "Service Vehicle", "RA_1", [
    band(3001, 5000, "AP_2"),
    band(5001, 10000, "AP_3"),
    band(10000.01, null, "AP_4"),
  ], { noAcaBelow: 3000 }),
  row("Repairs & Maintenance", "ICT Equipment with parts rqmt", "RA_1", [
    band(3001, 5000, "AP_2"),
    band(5001, 10000, "AP_3"),
    band(10000.01, null, "AP_4"),
  ], { noAcaBelow: 3000 }),
  row("Repairs & Maintenance", "Delivery Vehicle - labor & parts", "RA_1", [
    band(3001, 5000, "AP_2"),
    band(5001, 10000, "AP_3"),
    band(10000.01, null, "AP_4"),
  ], { noAcaBelow: 3000 }),
  row("Repairs & Maintenance", "Elevators & Escalators", "RA_1", [
    band(3001, 5000, "AP_2"),
    band(5001, 10000, "AP_3"),
    band(10000.01, null, "AP_4"),
  ], { noAcaBelow: 3000 }),

  // CAPEX - Property
  row("CAPEX - Property", "Purchase of Land", "RA_4", [band(null, null, "ALL_EXECOM", true)]),
  row("CAPEX - Property", "Store Construction", "RA_4", [band(null, null, "ALL_EXECOM", true)]),
  row("CAPEX - Property", "Major Store Renovation", "RA_4", [band(null, null, "ALL_EXECOM", true)]),
  row("CAPEX - Property", "Purchase of Land & Building", "RA_4", [band(null, null, "ALL_EXECOM", true)]),
  row("CAPEX - Property", "Billboard", "RA_4", [band(null, null, "ALL_EXECOM", true)]),

  // CAPEX - Vehicle
  row("CAPEX - Vehicle", "Delivery Vehicle", "RA_3", [
    band(0, 500000, "AP_3"),
    band(500000.01, null, "AP_4"),
  ]),
  row("CAPEX - Vehicle", "Car Plan Service Vehicle", "RA_4", [band(null, null, "ALL_EXECOM", true)]),
  row("CAPEX - Vehicle", "Motorcycle Plan Service Vehicle", "RA_2", [band(null, null, "AP_3", true)]),
  row("CAPEX - Vehicle", "Car Company Service Vehicle", "RA_4", [band(null, null, "ALL_EXECOM", true)]),
  row("CAPEX - Vehicle", "Motorcycle Company Service Vehicle", "RA_2", [band(null, null, "AP_3", true)]),

  // CAPEX - Furnitures & Fixtures
  row("CAPEX - Furnitures & Fixtures", "Office Furniture", "RA_2", [
    band(0, 5000, "AP_2"),
    band(5000.01, null, "AP_3"),
  ]),

  // CAPEX - Tools & Equipment
  row("CAPEX - Tools & Equipment", "Forklift/Lifter", "RA_3", [band(null, null, "AP_4", true)]),
  row("CAPEX - Tools & Equipment", "Tools & Equipment", "RA_2", [
    band(0, 5000, "AP_2"),
    band(5000.01, null, "AP_3"),
  ]),
  row("CAPEX - Tools & Equipment", "Racks", "RA_2", [band(null, null, "AP_3", true)]),
  row("CAPEX - Tools & Equipment", "Service Vehicle", "RA_2", [band(null, null, "AP_3", true)]),

  // Disposal
  row("Disposal", "Transfer of Service Vehicle", "RA_3", [band(null, null, "AP_4", true)]),
  row("Disposal", "Opening New Store", "RA_2", [band(null, null, "FOUR_EXECOMS", true)]),
  row("Disposal", "Closing Store", "RA_2", [band(null, null, "FOUR_EXECOMS", true)]),
  row("Disposal", "Transfer of store location", "RA_2", [band(null, null, "FOUR_EXECOMS", true)]),
  row("Disposal", "Sales Incentive", "RA_4", [band(null, null, "ALL_EXECOM", true)]),
  row("Disposal", "Price reduction - company wide", "RA_2", [band(null, null, "FOUR_EXECOMS", true)]),
  row("Disposal", "Disposal program - Store Based (per unit)", "RA_1", [
    band(0, 5000, "AP_2"),
    band(5000.01, null, "AP_3"),
  ]),
  row("Disposal", "Disposal program - Store Based", "RA_2", [
    band(0, 50000, "AP_2"),
    band(50001, 100000, "AP_3"),
    band(100000.01, null, "AP_4"),
  ]),
  row("Disposal", "Disposal program - company wide", "RA_2", [band(null, null, "FOUR_EXECOMS", true)]),

  // Store & Service Operations
  row("Store & Service Operations", "Penalty for apprehensions", "RA_2", [
    band(0, 5000, "AP_2"),
    band(5001, 10000, "AP_3"),
    band(10000.01, null, "AP_4"),
  ]),
  row("Store & Service Operations", "Sales & Service Activities Budget", "RA_2", [
    band(0, 15000, "AP_2"),
    band(15000.01, null, "AP_3"),
  ]),
  row("Store & Service Operations", "Special activities with supplier", "RA_2", [
    band(0, 50000, "AP_2"),
    band(50001, 100000, "AP_3"),
    band(100000.01, null, "AP_4"),
  ]),
  row("Store & Service Operations", "Charging of Uncollected AR to Employee", "RA_2", [
    band(0, 15000, "AP_2"),
    band(15000.01, null, "AP_3"),
  ]),
  row("Store & Service Operations", "Trip incentive", "RA_3", [band(null, null, "AP_4", true)]),
  row("Store & Service Operations", "Write off of Obsolete Inventory", "RA_3", [band(null, null, "AP_4", true)]),
  row("Store & Service Operations", "Write off Spare parts", "RA_3", [band(null, null, "AP_4", true)]),
  row("Store & Service Operations", "Write off Defective Inventory", "RA_3", [band(null, null, "AP_4", true)]),
  row("Store & Service Operations", "Write off Accounts Receivable", "RA_3", [band(null, null, "AP_4", true)]),
  row("Store & Service Operations", "Redemption of Impounded vehicle", "RA_2", [
    band(0, 5000, "AP_2"),
    band(5001, 10000, "AP_3"),
    band(10000.01, null, "AP_4"),
  ]),
  row("Store & Service Operations", "Additional Product line", "RA_3", [band(null, null, "AP_4", true)]),
  row("Store & Service Operations", "Accreditation of Supplier", "RA_2", [band(null, null, "AP_3", true)]),
  row("Store & Service Operations", "Repair of the store", "RA_1", [
    band(3001, 50000, "AP_2"),
    band(50001, 100000, "AP_3"),
    band(100000.01, null, "AP_4"),
  ]),
  row("Store & Service Operations", "Releasing AR / Institutional Sales", "RA_2", [
    band(null, null, "AP_3", true),
  ]),

  // Sponsorship / Donation
  row("Sponsorship", "Solicitation Cash or items", "RA_1", [
    band(1501, 3000, "AP_2"),
    band(3000.01, null, "AP_3"),
  ], { noAcaBelow: 1500, remarks: "Below P1,500 — no need for ACA" }),
  row("Donation", "Prizes", "RA_1", [
    band(0, 3000, "AP_2"),
    band(3001, 5000, "AP_3"),
    band(5000.01, null, "AP_4"),
  ]),
  row("Donation", "Tournaments", "RA_3", [band(null, null, "AP_4", true)]),
  row("Disposal", "Brand new appliance & parts", "RA_1", [
    band(0, 5000, "AP_2"),
    band(5001, 20000, "AP_3"),
    band(20000.01, null, "AP_4"),
  ]),
  row("Disposal", "Used assets", "RA_1", [
    band(0, 5000, "AP_2"),
    band(5001, 20000, "AP_3"),
    band(20000.01, null, "AP_4"),
  ]),

  // Litigation / Financed Sales
  row("Litigation", "Collection cases", "RA_1", [
    band(10001, 50000, "AP_2"),
    band(50000.01, null, "AP_3"),
  ], { noAcaBelow: 10000, remarks: "Below P10k — no need to file a case" }),
  row("Financed Sales Operations", "Collection Incentive", "RA_3", [band(null, null, "AP_4", true)]),
  row("Financed Sales Operations", "Redemption of Impounded vehicle", "RA_2", [
    band(0, 5000, "AP_2"),
    band(5001, 10000, "AP_3"),
    band(10000.01, null, "AP_4"),
  ]),
  row("Financed Sales Operations", "Write off Notes Receivable", "RA_2", [band(null, null, "AP_3", true)]),
  row("Financed Sales Operations", "Restructuring of accounts", "RA_1", [band(null, null, "AP_2", true)]),
  row("Financed Sales Operations", "Compromise Discount", "RA_1", [band(null, null, "AP_2", true)]),
  row("Financed Sales Operations", "Moratorium of accounts - Regular", "RA_1", [
    band(null, null, "AP_2", true),
  ]),
  row("Financed Sales Operations", "Moratorium of accounts - Calamities", "RA_1", [
    band(null, null, "AP_2", true),
  ]),
  row("Financed Sales Operations", "Financing of new products", "RA_3", [band(null, null, "AP_4", true)]),
  row("Financed Sales Operations", "Double Accounts or more than 2 accounts", "RA_2", [
    band(null, null, "AP_3", true),
  ]),
  row("Financed Sales Operations", "More than two accounts", "RA_2", [band(null, null, "AP_3", true)]),
  row("Financed Sales Operations", "Trip incentive", "RA_3", [band(null, null, "AP_4", true)]),
  row("Financed Sales Operations", "Redemption of Pawned Units", "RA_2", [
    band(0, 10000, "AP_2"),
    band(10000.01, null, "AP_3"),
  ]),
  row("Financed Sales Operations", "Assumption of accounts", "RA_1", [band(null, null, "AP_2", true)]),
  row("Financed Sales Operations", "Year-end employees awards", "RA_3", [band(null, null, "AP_4", true)]),
  row("Financed Sales Operations", "Refinancing of accounts", "RA_1", [band(null, null, "AP_2", true)]),

  // Marketing Programs
  row("Marketing Programs", "Advertising - Company-wide", "RA_3", [band(null, null, "AP_4", true)]),
  row("Marketing Programs", "Printing of Newsletter", "RA_3", [band(null, null, "AP_4", true)]),
  row("Marketing Programs", "Signages & Billboards", "RA_3", [band(null, null, "AP_4", true)]),
  row("Marketing Programs", "Ads & Promos", "RA_3", [band(null, null, "AP_4", true)]),
  row("Marketing Programs", "In-house Racks", "RA_3", [band(null, null, "AP_4", true)]),
  row("Marketing Programs", "Printing of Customer Service Survey Form", "RA_3", [
    band(null, null, "AP_4", true),
  ]),
  row("Marketing Programs", "Repair & Maintenance of Video Wall", "RA_3", [
    band(null, null, "AP_4", true),
  ]),
  row("Marketing Programs", "Promotional Giveaways", "RA_3", [band(null, null, "AP_4", true)]),
  row("Marketing Programs", "RE Revolution", "RA_3", [band(null, null, "AP_4", true)]),
  row("Marketing Programs", "RE Fiesta", "RA_3", [band(null, null, "AP_4", true)]),
  row("Marketing Programs", "CaREvan", "RA_3", [band(null, null, "AP_4", true)]),
  row("Marketing Programs", "Calendars", "RA_3", [band(null, null, "AP_4", true)]),
  row("Marketing Programs", "In-house Activities and other LSM", "RA_2", [
    band(0, 30000, "AP_2"),
    band(30001, 100000, "AP_3"),
    band(100000.01, null, "AP_4"),
  ]),
  row("Marketing Programs", "Field Activities and Other Service Campaigns", "RA_2", [
    band(0, 30000, "AP_2"),
    band(30001, 100000, "AP_3"),
    band(100000.01, null, "AP_4"),
  ]),
  row("Marketing Programs", "Major Company Promotions", "RA_3", [band(null, null, "AP_4", true)]),

  // Personnel
  row("Personnel", "Additional - Operations", "RA_2", [band(null, null, "AP_3", true)]),
  row("Personnel", "Replacement - Operations", "RA_2", [band(null, null, "AP_3", true)]),
  row("Personnel", "Additional - Head Office", "RA_3", [band(null, null, "AP_4", true)]),
  row("Personnel", "Replacement - Head Office", "RA_3", [band(null, null, "AP_4", true)]),
  row("Personnel", "Promotion to Supervisor", "RA_2", [band(null, null, "AP_3", true)]),
  row("Personnel", "Promotion to Manager", "RA_2", [band(null, null, "AP_3", true)]),
  row(
    "Personnel",
    "Promotion to Regional/Area Manager up to Territorial/Operations Manager/Dept Heads",
    "RA_4",
    [band(null, null, "ALL_EXECOM", true)],
  ),
  row("Personnel", "Promotion to AVP/VP", "EXECOM", [band(null, null, "ALL_EXECOM", true)]),
  row("Personnel", "Training Budget", "RA_1", [
    band(0, 10000, "AP_2"),
    band(10000.01, null, "AP_3"),
  ]),
  row("Personnel", "BDI Exams", "RA_1", [band(null, null, "AP_2", true)]),
  row("Personnel", "Bonuses", "RA_3", [band(null, null, "AP_4", true)]),
  row("Personnel", "Salary Adjustment - Company-wide", "RA_3", [band(null, null, "AP_4", true)]),
  row("Personnel", "Salary Adjustment - with wage order", "RA_3", [band(null, null, "AP_4", true)]),
  row("Personnel", "Salary Adjustment", "RA_3", [band(null, null, "AP_4", true)]),
  row("Personnel", "Sick Leave Conversion", "RA_3", [band(null, null, "AP_4", true)]),
  row("Personnel", "Join sports tournament", "RA_3", [band(null, null, "AP_4", true)]),

  // Training
  row("Training", "workshop or seminars - local or national", "RA_3", [
    band(null, null, "AP_4", true),
  ]),
  row("Training", "in-house / out source seminars & trainings", "RA_3", [
    band(null, null, "AP_4", true),
  ]),
  row("Training", "International", "RA_3", [band(null, null, "AP_4", true)]),

  // Manpower Agency / Employee Loan / Benefits
  row("Manpower Agency", "Security Guard", "RA_2", [band(null, null, "AP_3", true)]),
  row("Manpower Agency", "Janitor/Helper", "RA_2", [band(null, null, "AP_3", true)]),
  row("Manpower Agency", "ISP", "RA_2", [band(null, null, "AP_3", true)]),
  row("Employee Loan", "Emergency Loan - more than 1 month salary", "RA_3", [
    band(null, null, "AP_4", true),
  ]),
  row("Employee Loan", "Calamity Loan - more than 1 month salary", "RA_3", [
    band(null, null, "AP_4", true),
  ]),
  row("Benefits", "Annual Medical Check-up", "RA_3", [band(null, null, "AP_4", true)]),
  row("Benefits", "Company Uniforms", "RA_3", [band(null, null, "AP_4", true)]),

  // Corporate Activities
  row("Corporate Activities", "Business Conference Requirements", "RA_3", [
    band(null, null, "AP_4", true),
  ]),
  row("Corporate Activities", "Summer Outing", "RA_3", [band(null, null, "AP_4", true)]),
  row("Corporate Activities", "Sports Fest", "RA_3", [band(null, null, "AP_4", true)]),
  row("Corporate Activities", "Christmas Party", "RA_3", [band(null, null, "AP_4", true)]),
  row("Corporate Activities", "Cash Raffle prizes - Christmas Party/ABC", "RA_3", [
    band(null, null, "AP_4", true),
  ]),
  row("Corporate Activities", "Mobility Allowance", "RA_3", [band(null, null, "AP_4", true)]),
  row("Corporate Activities", "Despedida / farewell party for retirees", "RA_2", [
    band(0, 5000, "AP_2"),
    band(5000.01, 20000, "AP_3"),
    band(20000.01, null, "AP_4"),
  ]),
  row("Corporate Activities", "Write-off uncollected employees accountability", "RA_3", [
    band(null, null, "AP_4", true),
  ]),

  // Taxes / Revolving Fund
  row("Taxes Related", "Deficiency tax by CTO", "RA_1", [
    band(0, 3000, "AP_2"),
    band(3000.01, null, "AP_3"),
  ]),
  row("Revolving Fund", "MC Fund", "RA_1", [band(null, null, "AP_2", true)]),
  row("Revolving Fund", "New/Additional Petty Cash Fund", "RA_1", [
    band(0, 3000, "AP_2"),
    band(3001, 5000, "AP_3"),
    band(5000.01, null, "AP_4"),
  ]),
  row("Revolving Fund", "New/Additional Advances Fund", "RA_1", [
    band(0, 3000, "AP_2"),
    band(3001, 5000, "AP_3"),
    band(5000.01, null, "AP_4"),
  ]),
  row("Revolving Fund", "New/Additional Revolving Fund", "RA_1", [
    band(0, 3000, "AP_2"),
    band(3001, 5000, "AP_3"),
    band(5000.01, null, "AP_4"),
  ]),

  // ICT Requirements
  row("ICT Requirements", "Internet", "RA_3", [band(null, null, "AP_4", true)]),
  row("ICT Requirements", "Communication Lines", "RA_3", [band(null, null, "AP_4", true)]),
  row("ICT Requirements", "CCTV", "RA_3", [band(null, null, "AP_4", true)]),
  row("ICT Requirements", "Laptop", "RA_3", [band(null, null, "AP_4", true)]),
  row("ICT Requirements", "Desktop", "RA_3", [band(null, null, "AP_4", true)]),
  row("ICT Requirements", "Computer Peripherals", "RA_2", [
    band(0, 5000, "AP_2"),
    band(5001, 50000, "AP_3"),
    band(50000.01, null, "AP_4"),
  ]),
  row("ICT Requirements", "Office IT Equipment", "RA_2", [
    band(0, 5000, "AP_2"),
    band(5001, 50000, "AP_3"),
    band(50000.01, null, "AP_4"),
  ]),
  row("ICT Requirements", "Software licenses", "RA_3", [band(null, null, "AP_4", true)]),
  row("ICT Requirements", "Globe or smart recontracting", "RA_3", [band(null, null, "AP_4", true)]),
  row("ICT Requirements", "Mobile Plan", "RA_3", [band(null, null, "AP_4", true)]),
  row("ICT Requirements", "Barcode Equipment", "RA_3", [
    band(0, 5000, "AP_3"),
    band(5001, 50000, "AP_4"),
    band(50000.01, null, "FOUR_EXECOMS"),
  ]),
  row("ICT Requirements", "Outsource IT Services", "RA_3", [band(null, null, "AP_4", true)]),
];

export function listAcaCategories(): string[] {
  return [...new Set(ACA_AUTHORITY_MATRIX.map((r) => r.category))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function listAcaNaturesForCategory(category: string): string[] {
  return ACA_AUTHORITY_MATRIX.filter((r) => r.category === category).map((r) => r.natureOfRequest);
}

export function findAcaMatrixRow(
  category: string,
  natureOfRequest: string,
): AcaMatrixRow | null {
  return (
    ACA_AUTHORITY_MATRIX.find(
      (r) => r.category === category && r.natureOfRequest === natureOfRequest,
    ) ?? null
  );
}

function amountInBand(amount: number, b: AcaAmountBand): boolean {
  if (b.regardlessOfAmount) return true;
  const min = b.minInclusive ?? Number.NEGATIVE_INFINITY;
  const max = b.maxInclusive ?? Number.POSITIVE_INFINITY;
  return amount >= min && amount <= max;
}

export type AcaAuthorityResolution = {
  ok: boolean;
  requiresAca: boolean;
  category: string;
  natureOfRequest: string;
  estimatedCost: number;
  recommendingLevel: AcaRecommendingLevel | null;
  recommendingLabel: string | null;
  approvingPath: AcaApprovingPath | null;
  approvingLabel: string | null;
  approvingSeatCount: number;
  guidance: string;
  remarks: string | null;
  error: string | null;
};

export function approvingSeatCountForPath(path: AcaApprovingPath): number {
  if (path === "FOUR_EXECOMS") return ACA_FOUR_EXECOM_SEAT_COUNT;
  if (path === "ALL_EXECOM") return ACA_ALL_EXECOM_SEAT_COUNT;
  return 1;
}

export function resolveAcaAuthority(opts: {
  category: string;
  natureOfRequest: string;
  estimatedCost: number;
}): AcaAuthorityResolution {
  const category = opts.category.trim();
  const natureOfRequest = opts.natureOfRequest.trim();
  const estimatedCost = opts.estimatedCost;

  const base = {
    category,
    natureOfRequest,
    estimatedCost,
    recommendingLevel: null as AcaRecommendingLevel | null,
    recommendingLabel: null as string | null,
    approvingPath: null as AcaApprovingPath | null,
    approvingLabel: null as string | null,
    approvingSeatCount: 0,
    remarks: null as string | null,
  };

  if (!category || !natureOfRequest) {
    return {
      ...base,
      ok: false,
      requiresAca: false,
      guidance: "Select a category and nature of request.",
      error: "Category and nature of request are required.",
    };
  }
  if (!Number.isFinite(estimatedCost) || estimatedCost < 0) {
    return {
      ...base,
      ok: false,
      requiresAca: false,
      guidance: "Enter a valid estimated cost.",
      error: "Estimated cost must be a non-negative number.",
    };
  }

  const matrixRow = findAcaMatrixRow(category, natureOfRequest);
  if (!matrixRow) {
    return {
      ...base,
      ok: false,
      requiresAca: false,
      guidance: "No Authority Matrix row matches this category and nature.",
      error: "Unknown category / nature of request combination.",
    };
  }

  if (matrixRow.noAcaBelow != null && estimatedCost <= matrixRow.noAcaBelow) {
    return {
      ...base,
      ok: true,
      requiresAca: false,
      recommendingLevel: matrixRow.recommendingApprover,
      recommendingLabel: ACA_RECOMMENDING_LABELS[matrixRow.recommendingApprover],
      remarks: matrixRow.remarks ?? null,
      guidance:
        matrixRow.remarks?.trim() ||
        `Estimated cost is ₱${matrixRow.noAcaBelow.toLocaleString()} or below — ACA is not required.`,
      error: null,
    };
  }

  const matchedBand =
    matrixRow.bands.find((b) => amountInBand(estimatedCost, b)) ??
    matrixRow.bands.find((b) => b.regardlessOfAmount) ??
    null;

  if (!matchedBand) {
    return {
      ...base,
      ok: false,
      requiresAca: true,
      recommendingLevel: matrixRow.recommendingApprover,
      recommendingLabel: ACA_RECOMMENDING_LABELS[matrixRow.recommendingApprover],
      remarks: matrixRow.remarks ?? null,
      guidance: "No approving path matches this estimated cost in the Authority Matrix.",
      error: "Amount is outside configured approval bands for this nature of request.",
    };
  }

  const seatCount = approvingSeatCountForPath(matchedBand.approvingPath);
  const recommendingLabel = ACA_RECOMMENDING_LABELS[matrixRow.recommendingApprover];
  const approvingLabel = ACA_APPROVING_PATH_LABELS[matchedBand.approvingPath];
  const guidance = [
    `Required: ${recommendingLabel}`,
    "→ Finance Manager (budget validation)",
    `→ ${approvingLabel}${seatCount > 1 ? ` (${seatCount} seats)` : ""}`,
  ].join(" ");

  return {
    ok: true,
    requiresAca: true,
    category,
    natureOfRequest,
    estimatedCost,
    recommendingLevel: matrixRow.recommendingApprover,
    recommendingLabel,
    approvingPath: matchedBand.approvingPath,
    approvingLabel,
    approvingSeatCount: seatCount,
    guidance,
    remarks: matrixRow.remarks ?? null,
    error: null,
  };
}
