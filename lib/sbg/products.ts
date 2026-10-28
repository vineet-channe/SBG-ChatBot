/**
 * SBG Funding's product catalog as data. The eligibility engine reads the numeric
 * fields; the UI shows the text fields. Values come from each product page and its
 * schema.org data on sbgfunding.com (October 2026). Change a number here and both the
 * rules and the cards follow.
 */
export type ProductId =
  | "rbf"
  | "term_loan"
  | "line_of_credit"
  | "working_capital"
  | "sba_7a"
  | "equipment"
  | "invoice"
  | "bridge"
  | "heloc";

export interface Product {
  id: ProductId;
  name: string;
  /** What it is, in one line. */
  summary: string;
  amountLabel: string;
  minAmount?: number;
  maxAmount?: number;
  termLabel: string;
  speedLabel: string;
  /** Rough days from application to funds; only used to rank against the timeline. */
  daysToFund: number;
  collateralLabel: string;
  costLabel: string;
  minFico: number;
  /** Extra condition the engine checks, if any. */
  requires?: "b2b_invoices" | "repayment_event" | "home_equity";
  /** SBG lists no $150K revenue minimum for this product (it is secured by a home). */
  skipsRevenueMinimum?: boolean;
  url: string;
}

export const PRODUCTS: Record<ProductId, Product> = {
  rbf: {
    id: "rbf",
    name: "Revenue-Based Financing",
    summary: "A lump sum repaid as a share of future sales - SBG's direct product.",
    amountLabel: "Sized to your monthly revenue",
    termLabel: "No set term; repaid from sales",
    speedLabel: "Decision same day, funds in ~24 hours",
    daysToFund: 1,
    collateralLabel: "None",
    costLabel: "Factor rate (total repayment fixed upfront)",
    minFico: 500,
    url: "https://sbgfunding.com/resources/unlock-business-potential-with-mca-loans/",
  },
  term_loan: {
    id: "term_loan",
    name: "Small Business Term Loan",
    summary: "A lump sum repaid on a fixed weekly or monthly schedule.",
    amountLabel: "$5K - $10M",
    minAmount: 5_000,
    maxAmount: 10_000_000,
    termLabel: "6 - 48 months",
    speedLabel: "Decision same day, funds in ~24 hours",
    daysToFund: 1,
    collateralLabel: "None",
    costLabel: "Rates from 1.25%/month",
    minFico: 500,
    url: "https://sbgfunding.com/business-financing/small-business-term-loan/",
  },
  line_of_credit: {
    id: "line_of_credit",
    name: "Business Line of Credit",
    summary: "Revolving credit: draw, repay and draw again; pay only on what you use.",
    amountLabel: "$5K - $500K limit",
    minAmount: 5_000,
    maxAmount: 500_000,
    termLabel: "Revolving, no fixed end date",
    speedLabel: "Same-day draws once approved",
    daysToFund: 1,
    collateralLabel: "None",
    costLabel: "Interest on drawn balance; draw fee up to 2%",
    minFico: 500,
    url: "https://sbgfunding.com/business-financing/business-line-of-credit/",
  },
  working_capital: {
    id: "working_capital",
    name: "Working Capital",
    summary: "A fixed amount for one defined operating gap, repaid on a set schedule.",
    amountLabel: "$5K - $10M",
    minAmount: 5_000,
    maxAmount: 10_000_000,
    termLabel: "3 - 24 months",
    speedLabel: "Decision same day, funds in ~24 hours",
    daysToFund: 1,
    collateralLabel: "None",
    costLabel: "Fixed weekly or monthly payments",
    minFico: 500,
    url: "https://sbgfunding.com/business-financing/working-capital-loans/",
  },
  sba_7a: {
    id: "sba_7a",
    name: "SBA 7(a) Financing",
    summary: "Government-backed financing with long terms and prime-based rates.",
    amountLabel: "Up to $5M",
    maxAmount: 5_000_000,
    termLabel: "10 - 25 years",
    speedLabel: "Typically 30 - 90 days to close",
    daysToFund: 60,
    collateralLabel: "May be required",
    costLabel: "Prime-based with SBA rate caps",
    minFico: 500,
    url: "https://sbgfunding.com/business-financing/sba-loans/",
  },
  equipment: {
    id: "equipment",
    name: "Equipment Financing",
    summary: "Finance machinery, vehicles or technology; the equipment secures it.",
    amountLabel: "Up to 90% of equipment value",
    termLabel: "24 - 60 months",
    speedLabel: "Decision same day, funds in ~24 hours",
    daysToFund: 1,
    collateralLabel: "The equipment itself",
    costLabel: "Fixed weekly or monthly payments",
    minFico: 500,
    url: "https://sbgfunding.com/business-financing/equipment-financing/",
  },
  invoice: {
    id: "invoice",
    name: "Invoice Financing",
    summary: "Advance cash against unpaid invoices from business customers.",
    amountLabel: "Up to 90% of invoice value",
    termLabel: "Per invoice",
    speedLabel: "Decision same day, funds in ~24 hours",
    daysToFund: 1,
    collateralLabel: "The invoices",
    costLabel: "0.5% - 5% per month + 0-2% origination",
    minFico: 500,
    requires: "b2b_invoices",
    url: "https://sbgfunding.com/business-financing/invoice-financing/",
  },
  bridge: {
    id: "bridge",
    name: "Bridge Capital",
    summary: "Short-term capital until a known closing, payout or financing arrives.",
    amountLabel: "$5K - $10M",
    minAmount: 5_000,
    maxAmount: 10_000_000,
    termLabel: "Weeks to several months",
    speedLabel: "Decision same day, funds in ~24 hours",
    daysToFund: 1,
    collateralLabel: "None",
    costLabel: "Short-term pricing tied to the repayment event",
    minFico: 500,
    requires: "repayment_event",
    url: "https://sbgfunding.com/business-financing/bridge-capital/",
  },
  heloc: {
    id: "heloc",
    name: "Business HELOC",
    summary: "A line of credit secured by your home's equity, usually at lower rates.",
    amountLabel: "Up to 85% of home value minus mortgage",
    termLabel: "Revolving",
    speedLabel: "Can take longer than other products",
    daysToFund: 21,
    collateralLabel: "Your home",
    costLabel: "Variable, typically prime-based",
    minFico: 600,
    requires: "home_equity",
    skipsRevenueMinimum: true,
    url: "https://sbgfunding.com/business-financing/home-equity-line-of-credit-heloc/",
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCTS) as ProductId[];
