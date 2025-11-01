import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_NOT_FOUND = 404;
const HTTP_STATUS_INTERNAL_SERVER_ERROR = 500;
const NODE_ENV_DEVELOPMENT = 'development';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV === NODE_ENV_DEVELOPMENT;
}

function handleZodValidationError(err: ZodError, res: Response): void {
  res.status(HTTP_STATUS_BAD_REQUEST).json({
    error: 'Validation Error',
    message: 'Request validation failed',
    details: err.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    })),
  });
}

function handleAppError(err: AppError, res: Response): void {
  res.status(err.statusCode).json({
    error: err.message,
    ...(isDevelopmentEnvironment() && { stack: err.stack }),
  });
}

function handleDatabaseError(err: Error, res: Response): void {
  console.error('Database error:', err);
  res.status(HTTP_STATUS_INTERNAL_SERVER_ERROR).json({
    error: 'Database Error',
    message: isDevelopmentEnvironment()
      ? err.message
      : 'An internal database error occurred',
  });
}

function handleUnknownError(err: Error, res: Response): void {
  console.error('Unhandled error:', err);
  res.status(HTTP_STATUS_INTERNAL_SERVER_ERROR).json({
    error: 'Internal Server Error',
    message: isDevelopmentEnvironment()
      ? err.message
      : 'An unexpected error occurred',
    ...(isDevelopmentEnvironment() && { stack: err.stack }),
  });
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response
): void {
  if (err instanceof ZodError) {
    handleZodValidationError(err, res);
    return;
  }

  if (err instanceof AppError) {
    handleAppError(err, res);
    return;
  }

  if (err.message.includes('SQLITE')) {
    handleDatabaseError(err, res);
    return;
  }

  handleUnknownError(err, res);
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  const error = new AppError(HTTP_STATUS_NOT_FOUND, `Route not found: ${req.method} ${req.path}`);
  next(error);
}
