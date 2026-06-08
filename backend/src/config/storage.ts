import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'text/plain'
]);

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 1,
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(new ApiError(400, 'Unsupported file type'));
    }
    callback(null, true);
  }
});
