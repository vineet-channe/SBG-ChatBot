/**
 * Industries SBG Funding publishes dedicated pages for, with the products SBG
 * recommends for each and what they are typically used for ("best for").
 * Generated from sbgfunding.com/industries/* (October 2026).
 */
import type { ProductId } from "./products";

export type IndustryId =
  | "restaurants"
  | "retail"
  | "beauty_wellness"
  | "food_trucks"
  | "construction"
  | "hvac"
  | "plumbing"
  | "roofing"
  | "manufacturing"
  | "healthcare"
  | "dental"
  | "veterinary"
  | "trucking"
  | "automotive"
  | "gas_stations"
  | "other"
  | "gambling"
  | "adult_entertainment";

export interface Industry {
  id: IndustryId;
  label: string;
  group: string;
  /** Industries that usually bill business customers on net-30/60/90 terms. */
  invoiceHeavy: boolean;
  /** SBG's recommended products for this industry, in the order SBG lists them. */
  recommended: { product: ProductId; bestFor: string }[];
  url?: string;
}

export const INDUSTRIES: Industry[] = [
  {
    id: "restaurants",
    label: "Restaurant or bar",
    group: "Retail, food & hospitality",
    invoiceHeavy: false,
    url: "https://sbgfunding.com/industries/restaurants/",
    recommended: [
      { product: "term_loan", bestFor: "Dining room renovation, a patio build-out, a second location" },
      { product: "line_of_credit", bestFor: "Food and beverage inventory, payroll through slow weeks" },
      { product: "equipment", bestFor: "Commercial kitchen equipment, refrigeration, POS" },
      { product: "sba_7a", bestFor: "Buying an existing restaurant or a full build-out, up to $5M" },
      { product: "bridge", bestFor: "Closing on an acquisition before your SBA financing funds" }
    ],
  },
  {
    id: "retail",
    label: "Retail store",
    group: "Retail, food & hospitality",
    invoiceHeavy: false,
    url: "https://sbgfunding.com/industries/retail/",
    recommended: [
      { product: "term_loan", bestFor: "Store renovations, fixture upgrades, a seasonal inventory build" },
      { product: "line_of_credit", bestFor: "Inventory restocking, payroll, day-to-day operating costs" },
      { product: "equipment", bestFor: "POS systems, display fixtures, refrigeration, specialty equipment" },
      { product: "sba_7a", bestFor: "Acquiring a store, opening a second location, or buying your building, up to $5M" },
      { product: "working_capital", bestFor: "A post-peak dip, repaid before the next buying season" }
    ],
  },
  {
    id: "beauty_wellness",
    label: "Beauty, salon or fitness",
    group: "Retail, food & hospitality",
    invoiceHeavy: false,
    url: "https://sbgfunding.com/industries/beauty-wellness/",
    recommended: [
      { product: "term_loan", bestFor: "Salon renovations, adding treatment rooms, a second location build-out" },
      { product: "line_of_credit", bestFor: "Retail product inventory, stylist payroll, slow-season costs" },
      { product: "equipment", bestFor: "Salon chairs, treatment tables, laser equipment, washstations" },
      { product: "sba_7a", bestFor: "Salon acquisitions, spa build-outs, or a second location" },
      { product: "working_capital", bestFor: "A single post-build-out gap, sized upfront and repaid on schedule" }
    ],
  },
  {
    id: "food_trucks",
    label: "Food truck",
    group: "Retail, food & hospitality",
    invoiceHeavy: false,
    url: "https://sbgfunding.com/industries/food-trucks/",
    recommended: [
      { product: "term_loan", bestFor: "Kitchen build-out, commissary deposits, initial operating capital" },
      { product: "line_of_credit", bestFor: "Food inventory, commissary fees, and event supply costs" },
      { product: "equipment", bestFor: "The truck itself, generators, and commercial kitchen equipment" },
      { product: "sba_7a", bestFor: "Multi-truck expansion or transitioning into a brick-and-mortar location" },
      { product: "working_capital", bestFor: "One slow-season stretch, sized upfront with a fixed payoff date" }
    ],
  },
  {
    id: "construction",
    label: "Construction or contracting",
    group: "Construction & trades",
    invoiceHeavy: true,
    url: "https://sbgfunding.com/industries/construction/",
    recommended: [
      { product: "term_loan", bestFor: "Mobilizing on a new contract, crew expansion, a yard purchase" },
      { product: "line_of_credit", bestFor: "Materials and subcontractor payments between progress draws" },
      { product: "equipment", bestFor: "Excavators, cranes and fleet trucks, financed over the life of the asset" },
      { product: "invoice", bestFor: "Unlocking cash from approved progress draws and GC invoices" },
      { product: "working_capital", bestFor: "A known gap between projects, funded as one lump sum" }
    ],
  },
  {
    id: "hvac",
    label: "HVAC",
    group: "Construction & trades",
    invoiceHeavy: true,
    url: "https://sbgfunding.com/industries/hvac/",
    recommended: [
      { product: "term_loan", bestFor: "Expanding into new install territory, opening a second depot" },
      { product: "line_of_credit", bestFor: "Unit and parts inventory ahead of peak season, tech payroll" },
      { product: "equipment", bestFor: "HVAC systems, diagnostic tools, service vehicles" },
      { product: "invoice", bestFor: "Unlocking cash from unpaid commercial job invoices" },
      { product: "working_capital", bestFor: "A single large commercial install, sized upfront with a fixed payoff" }
    ],
  },
  {
    id: "plumbing",
    label: "Plumbing",
    group: "Construction & trades",
    invoiceHeavy: true,
    url: "https://sbgfunding.com/industries/plumbing/",
    recommended: [
      { product: "term_loan", bestFor: "Mobilizing crew and materials for a new construction subcontract" },
      { product: "line_of_credit", bestFor: "Payroll and supply runs between commercial draw payments" },
      { product: "equipment", bestFor: "Service vans, sewer cameras, hydro-jetting units" },
      { product: "invoice", bestFor: "Unpaid GC and property-manager invoices on net-30 to net-60" },
      { product: "working_capital", bestFor: "One slow residential stretch, sized upfront with a fixed payoff" }
    ],
  },
  {
    id: "roofing",
    label: "Roofing",
    group: "Construction & trades",
    invoiceHeavy: true,
    url: "https://sbgfunding.com/industries/roofing/",
    recommended: [
      { product: "term_loan", bestFor: "Bulk shingle and material buys, or a yard and storage build-out" },
      { product: "line_of_credit", bestFor: "Material drops and crew payroll before a job invoices" },
      { product: "equipment", bestFor: "Lift equipment, dump trucks, ladder racks, compressors" },
      { product: "invoice", bestFor: "Unlocking cash from insurance and GC invoices on closed jobs" },
      { product: "working_capital", bestFor: "A single large mobilization, sized upfront with a fixed payoff" }
    ],
  },
  {
    id: "manufacturing",
    label: "Manufacturing",
    group: "Construction & trades",
    invoiceHeavy: true,
    url: "https://sbgfunding.com/industries/manufacturing/",
    recommended: [
      { product: "term_loan", bestFor: "Plant expansion, facility build-out, a large tooling buy" },
      { product: "line_of_credit", bestFor: "Raw materials, payroll, recurring production costs" },
      { product: "equipment", bestFor: "CNC machines, industrial equipment, production line upgrades" },
      { product: "invoice", bestFor: "Unlocking cash from net-30/60/90 commercial invoices" },
      { product: "working_capital", bestFor: "One large production run, repaid when that order settles" }
    ],
  },
  {
    id: "healthcare",
    label: "Healthcare or medical practice",
    group: "Healthcare & professional",
    invoiceHeavy: true,
    url: "https://sbgfunding.com/industries/healthcare/",
    recommended: [
      { product: "term_loan", bestFor: "Build-outs, adding exam rooms, opening a second office" },
      { product: "line_of_credit", bestFor: "Payroll gaps between reimbursements, recurring operating costs" },
      { product: "equipment", bestFor: "Medical equipment, diagnostic tools, imaging systems" },
      { product: "sba_7a", bestFor: "Buying into or acquiring a practice, up to $5M" },
      { product: "invoice", bestFor: "Advancing payment on outstanding insurance and payer claims" }
    ],
  },
  {
    id: "dental",
    label: "Dental practice",
    group: "Healthcare & professional",
    invoiceHeavy: true,
    url: "https://sbgfunding.com/industries/dental/",
    recommended: [
      { product: "term_loan", bestFor: "Operatory build-outs, practice management software, working capital for a new hire" },
      { product: "line_of_credit", bestFor: "Bridging insurance reimbursement gaps and covering payroll" },
      { product: "equipment", bestFor: "Dental chairs, X-ray units, CBCT scanners, CAD/CAM systems" },
      { product: "sba_7a", bestFor: "Practice acquisition, major buildouts, and second locations" },
      { product: "invoice", bestFor: "Advancing payment on submitted insurance claims" }
    ],
  },
  {
    id: "veterinary",
    label: "Veterinary practice",
    group: "Healthcare & professional",
    invoiceHeavy: true,
    url: "https://sbgfunding.com/industries/veterinarian/",
    recommended: [
      { product: "term_loan", bestFor: "Adding exam or surgical suites, kennel expansion, a second location" },
      { product: "line_of_credit", bestFor: "Pharmacy and surgical supply restocking, technician payroll" },
      { product: "equipment", bestFor: "Surgical equipment, imaging systems, dental units, lab analyzers" },
      { product: "sba_7a", bestFor: "Acquiring a practice or buying out a retiring partner, up to $5M" },
      { product: "invoice", bestFor: "Advancing payment on pet insurance and third-party claims" }
    ],
  },
  {
    id: "trucking",
    label: "Trucking or transportation",
    group: "Transport & logistics",
    invoiceHeavy: true,
    url: "https://sbgfunding.com/industries/trucking-transportation/",
    recommended: [
      { product: "term_loan", bestFor: "Terminal or yard build-out, authority expansion, insurance and licensing costs" },
      { product: "line_of_credit", bestFor: "Fuel costs, driver payroll, recurring operating expenses" },
      { product: "equipment", bestFor: "Semi trucks, trailers, lift gates, specialty rigs" },
      { product: "invoice", bestFor: "Unlocking cash from unpaid freight invoices" },
      { product: "working_capital", bestFor: "A gap between contracts, sized upfront with a fixed payoff" }
    ],
  },
  {
    id: "automotive",
    label: "Auto repair or dealership",
    group: "Transport & logistics",
    invoiceHeavy: true,
    url: "https://sbgfunding.com/industries/automotive-services/",
    recommended: [
      { product: "term_loan", bestFor: "Adding a service bay, shop expansion, a second location" },
      { product: "line_of_credit", bestFor: "Parts inventory, payroll, day-to-day operating costs" },
      { product: "equipment", bestFor: "Lifts, diagnostic tools, tire equipment, paint booths" },
      { product: "invoice", bestFor: "Unlocking cash from fleet accounts and commercial clients" },
      { product: "working_capital", bestFor: "One large parts order or slow stretch, with a fixed payoff date" }
    ],
  },
  {
    id: "gas_stations",
    label: "Gas station or c-store",
    group: "Transport & logistics",
    invoiceHeavy: false,
    url: "https://sbgfunding.com/industries/gas-stations/",
    recommended: [
      { product: "term_loan", bestFor: "Canopy upgrades, c-store renovation, site improvements" },
      { product: "line_of_credit", bestFor: "Fuel inventory purchases, c-store restocking, utility and card-fee cycles" },
      { product: "equipment", bestFor: "Fuel dispensers, POS systems, car wash equipment" },
      { product: "sba_7a", bestFor: "Property acquisition, major renovations, franchise fees" },
      { product: "bridge", bestFor: "Closing on a site purchase before your SBA financing funds" }
    ],
  },
  {
    id: "other",
    label: "Something else",
    group: "Other",
    invoiceHeavy: false,
    recommended: [],
  },
  // SBG does not finance these (FAQ: "The main exceptions are adult entertainment and gambling").
  { id: "gambling", label: "Gambling", group: "Restricted", invoiceHeavy: false, recommended: [] },
  { id: "adult_entertainment", label: "Adult entertainment", group: "Restricted", invoiceHeavy: false, recommended: [] },
];

export const RESTRICTED_INDUSTRIES: IndustryId[] = ["gambling", "adult_entertainment"];

export function getIndustry(id: IndustryId | undefined): Industry | undefined {
  return INDUSTRIES.find((i) => i.id === id);
}

/** Industries offered as buttons in the guided flow (restricted ones are never shown). */
export const SELECTABLE_INDUSTRIES = INDUSTRIES.filter((i) => i.group !== "Restricted");
