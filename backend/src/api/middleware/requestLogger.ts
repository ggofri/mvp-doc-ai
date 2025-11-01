import { Request, Response, NextFunction } from 'express';

const HTTP_ERROR_THRESHOLD = 400;
const COLOR_RED = '\x1b[31m';
const COLOR_GREEN = '\x1b[32m';
const COLOR_RESET = '\x1b[0m';
const NODE_ENV_DEVELOPMENT = 'development';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function getStatusColor(statusCode: number): string {
  return statusCode >= HTTP_ERROR_THRESHOLD ? COLOR_RED : COLOR_GREEN;
}

function formatStatusCode(statusCode: number): string {
  const color = getStatusColor(statusCode);
  return `${color}${statusCode}${COLOR_RESET}`;
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  console.log(`[${formatTimestamp()}] ${req.method} ${req.path}`);

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const formattedStatus = formatStatusCode(res.statusCode);

    console.log(
      `[${formatTimestamp()}] ${req.method} ${req.path} ${formattedStatus} - ${duration}ms`
    );
  });

  next();
}

export function requestBodyLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (process.env.NODE_ENV === NODE_ENV_DEVELOPMENT && req.body) {
    console.log('Request body:', JSON.stringify(req.body, null, 2));
  }
  next();
}
