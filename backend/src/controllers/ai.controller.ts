import { Request, Response } from 'express';
import { aiService } from '../services/ai/aiService.js';
import { portalFallback } from '../services/ai/portalFallback.js';

export const getMsmeInsight = async (req: Request, res: Response): Promise<void> => {
  try {
    const { question, dashboardData } = req.body;

    if (!question || typeof question !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Question is required and must be a string.'
      });
      return;
    }

    if (!dashboardData || typeof dashboardData !== 'object') {
      res.status(400).json({
        success: false,
        error: 'Dashboard data is required and must be an object.'
      });
      return;
    }

    const result = await aiService.generateInsight({
      question,
      dashboardData,
      user: req.user
    });

    res.json({
      success: true,
      answer: result.answer,
      provider: result.provider,
      model: result.model,
      fallback: result.fallback || false
    });
  } catch (error: any) {
    console.error('[AIController] Error generating insight:', error);
    const fallback = await portalFallback.answer({
      question: typeof req.body?.question === 'string' ? req.body.question : 'Analyze this MSME dashboard and give important insights.',
      dashboardData: req.body?.dashboardData && typeof req.body.dashboardData === 'object' ? req.body.dashboardData : {},
      user: req.user
    });
    res.json({
      success: true,
      answer: fallback.answer,
      provider: fallback.provider,
      model: fallback.model,
      fallback: true
    });
  }
};
