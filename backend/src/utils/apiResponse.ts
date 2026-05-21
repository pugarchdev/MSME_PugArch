import type { Response } from 'express';

const getErrorInstruction = (statusCode: number, message: string, code?: string): string => {
  const msg = message.toLowerCase();
  const c = code?.toUpperCase() || '';

  if (c === 'VALIDATION_ERROR') {
    return 'Please review the input fields for any validation constraints, correct the red-highlighted fields, and try again.';
  }
  if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('unique constraint')) {
    return 'This record (such as GSTIN, PAN, or email) is already registered in our system. Please try using a different one or sign in to the existing account.';
  }
  if (statusCode === 401 || c.startsWith('AUTH_') || c === 'SESSION_INVALID') {
    return 'Your login session is invalid or has expired. Please sign out and sign back in to establish a secure connection.';
  }
  if (statusCode === 403 || c === 'ACCESS_DENIED' || c === 'PERMISSION_DENIED' || c.includes('UNAUTHORIZED')) {
    return 'Your account role (e.g., Buyer, Seller, Admin) does not have authorization to access this resource. Please contact your administrator if you need access.';
  }
  if (statusCode === 404 || c.includes('NOT_FOUND')) {
    return 'The requested record or endpoint could not be found. Please refresh your page, verify the ID or URL, and try again.';
  }
  if (statusCode === 429 || c === 'RATE_LIMITED') {
    return 'You are making too many requests too quickly. Please wait 30-60 seconds before trying your action again.';
  }
  if (statusCode >= 500) {
    return 'A server-side technical difficulty occurred. Our engineering team has been notified. Please try again in a few minutes.';
  }
  if (msg.includes('required') || msg.includes('missing')) {
    return 'One or more required fields are empty. Please fill out all mandatory inputs before proceeding.';
  }
  if (msg.includes('invalid') || msg.includes('incorrect')) {
    return 'The provided value is incorrect or formatted improperly. Please verify your input data and try again.';
  }

  return 'Please double-check your inputs, ensure you have a stable network connection, and retry the action.';
};

export const apiResponse = {
  success<T>(res: Response, data: T, statusCode = 200, message = 'OK') {
    return res.status(statusCode).json({ success: true, message, data });
  },

  created<T>(res: Response, data: T, message = 'Created') {
    return this.success(res, data, 201, message);
  },

  error(res: Response, statusCode: number, message: string, code?: string, details?: unknown) {
    const instruction = getErrorInstruction(statusCode, message, code);
    const fullMessage = `${message} (Guidance: ${instruction})`;
    return res.status(statusCode).json({
      success: false,
      message: fullMessage,
      ...(code ? { code } : {}),
      ...(details ? { details } : {}),
      instruction
    });
  }
};
