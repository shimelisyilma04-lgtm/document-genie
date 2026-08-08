/** Client-safe analyst mode definitions (shared by UI and server). */

export const ANALYST_MODES = ["chat", "summarize", "key_info", "action_items", "explain"] as const;
export type AnalystMode = (typeof ANALYST_MODES)[number];

export type QuickAction = {
  mode: AnalystMode;
  label: string;
  description: string;
  prompt: string;
};

export const QUICK_ACTIONS: QuickAction[] = [
  {
    mode: "summarize",
    label: "Executive summary",
    description: "Overview, key points, obligations",
    prompt: "Summarise this document for a busy executive.",
  },
  {
    mode: "key_info",
    label: "Extract key info",
    description: "Names, dates, amounts, references",
    prompt: "Extract the key names, dates, numbers and references from this document.",
  },
  {
    mode: "action_items",
    label: "Action items",
    description: "Checklist with owners and deadlines",
    prompt: "What action items, obligations and deadlines does this document create?",
  },
  {
    mode: "explain",
    label: "Explain difficult parts",
    description: "Plain-language walkthrough",
    prompt: "Explain the most complex or ambiguous sections of this document in plain language.",
  },
];
