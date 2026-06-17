import { Request, Response } from 'express';
import { aiService } from '../services/ai/aiService.js';

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
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to generate AI insight from all configured providers.'
    });
  }
};
