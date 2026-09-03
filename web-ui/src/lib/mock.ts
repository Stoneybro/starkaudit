/**
 * Mock data for UI-only replica.
 * No blockchain reads — all data is static and visual.
 */

export const MOCK_WALLET = "0x1234567890123456789012345678901234567890" as `0x${string}`;
export const MOCK_AUDIT_REGISTRY = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" as `0x${string}`;
export const MOCK_REVIEW_REGISTRY = "0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" as `0x${string}`;
export const MOCK_BUSINESS = MOCK_WALLET;

export const MOCK_BALANCE_RAW = 12_500_000000n; // 12,500 USDC (6 decimals)
export const MOCK_BALANCE_FORMATTED = "12,500.00";

export type MockAuditor = {
  address: `0x${string}`;
  access: 1 | 2 | 3;
  ens?: string;
};

export const MOCK_AUDITORS: MockAuditor[] = [
  { address: "0x1111111111111111111111111111111111111111", access: 3 },
  { address: "0x2222222222222222222222222222222222222222", access: 2 },
  { address: "0x3333333333333333333333333333333333333333", access: 2 },
];

export type MockPayment = {
  paymentId: number;
  blockNumber: number;
  timestamp: Date;
  sender: `0x${string}`;
  recipient: `0x${string}`;
  approver: `0x${string}`;
  invoiceHash: `0x${string}`;
  poHash: `0x${string}`;
  approved: boolean;
  findingCount: number;
  maxSeverity: number | null;
  amountMock: string;
};

export const MOCK_TRANSACTIONS: MockPayment[] = [
  {
    paymentId: 42,
    blockNumber: 8123456,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    sender: MOCK_WALLET,
    recipient: "0xAbCdEf123456789012345678901234567890AbCd" as `0x${string}`,
    approver: "0x0000000000000000000000000000000000000000" as `0x${string}`,
    invoiceHash: ("0x" + "11".repeat(32)) as `0x${string}`,
    poHash: ("0x" + "22".repeat(32)) as `0x${string}`,
    approved: true,
    findingCount: 1,
    maxSeverity: 2,
    amountMock: "1,250.00 USDC",
  },
  {
    paymentId: 41,
    blockNumber: 8123000,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    sender: MOCK_WALLET,
    recipient: "0x9876543210987654321098765432109876543210" as `0x${string}`,
    approver: MOCK_WALLET,
    invoiceHash: ("0x" + "33".repeat(32)) as `0x${string}`,
    poHash: ("0x" + "00".repeat(32)) as `0x${string}`,
    approved: false,
    findingCount: 0,
    maxSeverity: null,
    amountMock: "5,000.00 USDC",
  },
  {
    paymentId: 40,
    blockNumber: 8121000,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48),
    sender: MOCK_WALLET,
    recipient: "0xDeaDbeefDeaDbeefDeaDbeefDeaDbeefDeaDbeef" as `0x${string}`,
    approver: "0x1111111111111111111111111111111111111111" as `0x${string}`,
    invoiceHash: ("0x" + "ab".repeat(32)) as `0x${string}`,
    poHash: ("0x" + "cd".repeat(32)) as `0x${string}`,
    approved: true,
    findingCount: 2,
    maxSeverity: 3,
    amountMock: "850.50 USDC",
  },
];

export type MockFinding = {
  paymentId: number;
  testType: number;
  severity: number;
  timestamp: Date;
  reviewer: `0x${string}`;
  amount: string;
  category: string;
};

export const MOCK_FINDINGS: MockFinding[] = [
  {
    paymentId: 42,
    testType: 0,
    severity: 2,
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    reviewer: "0x1111111111111111111111111111111111111111" as `0x${string}`,
    amount: "1,250.00 USDC",
    category: "Marketing",
  },
  {
    paymentId: 40,
    testType: 3,
    severity: 3,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 5),
    reviewer: "0x2222222222222222222222222222222222222222" as `0x${string}`,
    amount: "850.50 USDC",
    category: "Operations",
  },
];

export type MockTestConfig = {
  id: number;
  name: string;
  description: string;
  priority: number;
  enabled: boolean;
  scope?: string;
  thresholdMock: string;
};

export const MOCK_TESTS: MockTestConfig[] = [
  {
    id: 0,
    name: "Materiality",
    description: "Flags any payment above the configured threshold.",
    priority: 2,
    enabled: true,
    thresholdMock: "10,000 USDC",
  },
  {
    id: 3,
    name: "Missing Evidence",
    description: "Flags payments above the threshold that lack a supporting invoice or document hash.",
    priority: 2,
    enabled: true,
    thresholdMock: "1,000 USDC",
  },
  {
    id: 4,
    name: "Category Concentration",
    description: "Flags when cumulative spend in a specific category exceeds the threshold.",
    priority: 1,
    enabled: false,
    scope: "Marketing",
    thresholdMock: "25,000 USDC",
  },
  {
    id: 5,
    name: "Recipient Concentration",
    description: "Flags when cumulative spend to a single recipient exceeds the threshold.",
    priority: 3,
    enabled: true,
    thresholdMock: "15,000 USDC",
  },
];

export const MOCK_ANALYTICS = {
  totalPayments: 42,
  flagged: 5,
  passRate: 88,
  byCategory: [
    { label: "Marketing", value: 12_500 },
    { label: "Operations", value: 8_200 },
    { label: "R&D", value: 5_400 },
    { label: "Legal", value: 2_100 },
  ],
};
