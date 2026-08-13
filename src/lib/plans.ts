/**
 * Plan definitions — single source of truth for all plan limits.
 * Used by both client (UI) and server (enforcement).
 */

export type PlanId = "free" | "starter" | "pro" | "business";

export type Plan = {
  id: PlanId;
  name: string;
  monthlyPrice: number; // USD cents
  documentsPerMonth: number;
  pagesPerDocument: number;
  aiMessagesPerMonth: number;
  storageBytes: number; // bytes
  maxWorkspaces: number; // -1 = unlimited
  teamMembers: number; // 0 = not supported
  features: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    documentsPerMonth: 10,
    pagesPerDocument: 20,
    aiMessagesPerMonth: 50,
    storageBytes: 100 * 1024 * 1024,          // 100 MB
    maxWorkspaces: 1,
    teamMembers: 0,
    features: [
      "10 documents/month",
      "20 pages/document",
      "50 AI messages/month",
      "100 MB storage",
      "1 workspace",
      "Document chat & analyst",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 900,
    documentsPerMonth: 100,
    pagesPerDocument: 50,
    aiMessagesPerMonth: 1000,
    storageBytes: 5 * 1024 * 1024 * 1024,    // 5 GB
    maxWorkspaces: 3,
    teamMembers: 0,
    features: [
      "100 documents/month",
      "50 pages/document",
      "1,000 AI messages/month",
      "5 GB storage",
      "3 workspaces",
      "All AI Employees",
      "Company Brain search",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 2400,
    documentsPerMonth: 500,
    pagesPerDocument: 200,
    aiMessagesPerMonth: 5000,
    storageBytes: 50 * 1024 * 1024 * 1024,   // 50 GB
    maxWorkspaces: 10,
    teamMembers: 0,
    features: [
      "500 documents/month",
      "200 pages/document",
      "5,000 AI messages/month",
      "50 GB storage",
      "10 workspaces",
      "All AI Employees",
      "Company Brain + multi-doc analysis",
      "Translation & exports",
    ],
  },
  business: {
    id: "business",
    name: "Business",
    monthlyPrice: 5900,
    documentsPerMonth: 2000,
    pagesPerDocument: 500,
    aiMessagesPerMonth: 20000,
    storageBytes: 250 * 1024 * 1024 * 1024,  // 250 GB
    maxWorkspaces: -1,                        // unlimited
    teamMembers: 10,
    features: [
      "2,000 documents/month",
      "500 pages/document",
      "20,000 AI messages/month",
      "250 GB storage",
      "Unlimited workspaces",
      "Up to 10 team members",
      "All AI Employees",
      "Advanced Company Brain",
      "Priority support",
    ],
  },
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(0)} GB`;
}
