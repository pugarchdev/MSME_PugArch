export interface GenerateInsightInput {
  question: string;
  dashboardData: unknown;
  user?: {
    id: number;
    role: string;
    organizationId?: number | null;
    companyId?: number | null;
  };
}

export interface GenerateInsightResult {
  answer: string;
  provider: string;
  model: string;
  fallback?: boolean;
}

export interface AIProvider {
  name: string;
  model: string;
  generateInsight(input: GenerateInsightInput): Promise<GenerateInsightResult>;
}
