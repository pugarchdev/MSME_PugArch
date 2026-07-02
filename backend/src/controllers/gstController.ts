import { Request, Response } from 'express';
import { GstService } from '../services/gstService.js';

export class GstController {
  /**
   * POST /api/gst/verify
   * Verify GSTIN from request body.
   */
  static async verify(req: Request, res: Response) {
    try {
      const { gstNumber } = req.body;

      // 1. Validation
      if (!gstNumber) {
        return res.status(400).json({ success: false, message: 'GST number is required' });
      }

      if (gstNumber.length !== 15) {
        return res.status(400).json({ success: false, message: 'GST number must be 15 characters long' });
      }

      // Basic Regex for GSTIN
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
      if (!gstRegex.test(gstNumber.toUpperCase())) {
        return res.status(400).json({ success: false, message: 'Invalid GST number format' });
      }

      // 2. Call Service
      const data = await GstService.verifyGstin(gstNumber.toUpperCase());

      // 3. Success Response
      return res.status(200).json({
        success: true,
        data
      });
    } catch (error: any) {
      console.error(`[GstController] Error: ${error.message}`);
      return res.status(error?.statusCode || 500).json({
        success: false,
        message: error?.message || 'GST verification failed',
        ...(error?.code ? { code: error.code, errorCode: error.code } : {})
      });
    }
  }
}
