import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ZodError } from 'zod';
import { apiResponse } from '../utils/apiResponse.js';

type RequestSchemas = {
  body?: ZodTypeAny;
  params?: ZodTypeAny;
  query?: ZodTypeAny;
};

export const validate = (schemas: RequestSchemas) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params) as any;
      if (schemas.query) req.query = schemas.query.parse(req.query) as any;
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.flatten();
        const fieldErrors = details.fieldErrors as Record<string, string[] | undefined>;
        const passwordErrors = fieldErrors.password;
        const message = passwordErrors?.length
          ? 'Password must be between 12 and 128 characters.'
          : 'Request validation failed';

        return apiResponse.error(res, 400, message, 'VALIDATION_ERROR', details);
      }
      return next(error);
    }
  };
};
