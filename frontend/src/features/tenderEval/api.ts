/**
 * Tender Evaluation API client.
 */
import { getApi, postApi } from '../shared/apiClient';

export interface CriterionDto {
    id: number;
    tenderId: number;
    name: string;
    description?: string | null;
    maxScore: string | number;
    weightage?: string | number | null;
    isMandatory: boolean;
}

export interface BidDto {
    id: number;
    tenderId: number;
    sellerId: number;
    unitPrice: string | number;
    quantity: number;
    deliveryDays: number;
    seller?: { id: number; name: string; email: string };
}

export interface TechnicalEvalResultDto {
    id: number;
    bidId: number;
    criteriaId: number;
    score: string | number;
    remarks?: string | null;
    evaluator?: { id: number; name: string };
    evaluatedAt?: string | null;
}

export interface BidScoreDto {
    bid: BidDto;
    results: TechnicalEvalResultDto[];
    totalScore: number;
    maxScore: number;
    percent: number;
    qualified: boolean;
    isFullyEvaluated: boolean;
}

export interface FinancialBidDto {
    bid: BidDto;
    quotedAmount: number;
    evaluatedAmount: number;
    technicalScore: number;
    technicalPercent: number;
    financialEvaluation?: {
        id: number;
        rank?: number | null;
        evaluatedAmount: string | number;
        evaluator?: { id: number; name: string };
    };
}

export interface RankedBidDto extends FinancialBidDto {
    rank: number;
    label: string;
    qualified: boolean;
}

export interface ComparativeStatementDto {
    id: number;
    tenderId: number;
    bidId?: number | null;
    version: number;
    summary: any;
    recommended: boolean;
    createdAt: string;
}

export const fetchCriteria = (tenderId: number) =>
    getApi<CriterionDto[]>(`/api/tender-eval/${tenderId}/criteria`);

export const createCriterion = (tenderId: number, data: {
    name: string; description?: string; maxScore: number; weightage?: number; isMandatory?: boolean
}) => postApi<CriterionDto>(`/api/tender-eval/${tenderId}/criteria`, data);

export const fetchTechnicalEvaluation = (tenderId: number) =>
    getApi<{ criteria: CriterionDto[]; bidScores: BidScoreDto[] }>(`/api/tender-eval/${tenderId}/technical`);

export const submitTechnicalScores = (tenderId: number, bidId: number, scores: Array<{ criteriaId: number; score: number; remarks?: string }>) =>
    postApi<{ success: boolean }>(`/api/tender-eval/${tenderId}/technical/${bidId}`, { scores });

export const openFinancialBids = (tenderId: number) =>
    postApi<{ id: number; status: string }>(`/api/tender-eval/${tenderId}/open-financial`, {});

export const fetchFinancialBids = (tenderId: number) =>
    getApi<FinancialBidDto[]>(`/api/tender-eval/${tenderId}/financial`);

export const submitFinancialEvaluation = (tenderId: number, bidId: number, data: { evaluatedAmount?: number; remarks?: string }) =>
    postApi(`/api/tender-eval/${tenderId}/financial/${bidId}`, data);

export const fetchRanking = (tenderId: number) =>
    getApi<RankedBidDto[]>(`/api/tender-eval/${tenderId}/ranking`);

export const generateComparativeStatement = (tenderId: number) =>
    postApi<ComparativeStatementDto>(`/api/tender-eval/${tenderId}/comparative`, {});

export const fetchComparativeStatement = (tenderId: number) =>
    getApi<ComparativeStatementDto | null>(`/api/tender-eval/${tenderId}/comparative`);
