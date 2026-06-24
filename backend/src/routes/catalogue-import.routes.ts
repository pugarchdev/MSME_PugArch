import { Router, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize, type AuthRequest } from '../middleware/auth.js';
import { upload } from '../config/storage.js';
import { ApiError } from '../utils/ApiError.js';
import { catalogueImportService } from '../services/workflow/catalogue-import.service.js';

const router = Router();

const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });

const userId = (req: AuthRequest) => {
  if (!req.user?.id) throw new ApiError(401, 'Unauthorized');
  return req.user.id;
};

const actorFrom = (req: AuthRequest) => ({
  id: userId(req),
  role: String(req.user?.role || 'seller'),
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});

const batchIdParams = z.object({ batchId: z.coerce.number().int().positive() });

const wrap = (handler: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    void handler(req, res).catch(next);
  };

router.get('/catalogue/import/templates/products', authenticate, authorize('seller'), wrap(async (_req, res) => {
  const buffer = await catalogueImportService.generateProductTemplate();
  res.setHeader('Content-Disposition', 'attachment; filename="catalogue_products_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.end(buffer);
}));

router.get('/catalogue/import/templates/services', authenticate, authorize('seller'), wrap(async (_req, res) => {
  const buffer = await catalogueImportService.generateServiceTemplate();
  res.setHeader('Content-Disposition', 'attachment; filename="catalogue_services_template.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.end(buffer);
}));

router.post('/catalogue/import/products', authenticate, authorize('seller'), upload.single('file'), wrap(async (req: AuthRequest & { file?: Express.Multer.File }, res) => {
  if (!req.file) throw new ApiError(400, 'Excel file is required', 'FILE_REQUIRED');
  const result = await catalogueImportService.previewProductImport(actorFrom(req), req.file);
  ok(res, result, 201);
}));

router.post('/catalogue/import/services', authenticate, authorize('seller'), upload.single('file'), wrap(async (req: AuthRequest & { file?: Express.Multer.File }, res) => {
  if (!req.file) throw new ApiError(400, 'Excel file is required', 'FILE_REQUIRED');
  const result = await catalogueImportService.previewServiceImport(actorFrom(req), req.file);
  ok(res, result, 201);
}));

router.get('/catalogue/import/history', authenticate, authorize('seller'), wrap(async (req, res) => {
  const history = await catalogueImportService.listHistory(actorFrom(req));
  ok(res, history);
}));

router.get('/catalogue/import/:batchId/errors', authenticate, authorize('seller'), wrap(async (req, res) => {
  const { batchId } = batchIdParams.parse(req.params);
  const errors = await catalogueImportService.getErrors(actorFrom(req), batchId);
  ok(res, errors);
}));

router.get('/catalogue/import/:batchId/errors/download', authenticate, authorize('seller'), wrap(async (req, res) => {
  const { batchId } = batchIdParams.parse(req.params);
  const buffer = await catalogueImportService.exportErrorReport(actorFrom(req), batchId);
  res.setHeader('Content-Disposition', `attachment; filename="import_errors_${batchId}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.end(buffer);
}));

router.post('/catalogue/import/:batchId/confirm', authenticate, authorize('seller'), wrap(async (req, res) => {
  const { batchId } = batchIdParams.parse(req.params);
  const body = z.object({ publish: z.coerce.boolean().optional() }).parse(req.body || {});
  const result = await catalogueImportService.confirmImport(actorFrom(req), batchId, Boolean(body.publish));
  ok(res, result);
}));

export default router;
