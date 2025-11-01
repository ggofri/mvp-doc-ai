import { getPIIMasker } from '../services/masking/PIIMasker';

const MASK_PII_DISABLE_VALUE = 'false';
const UNSAFE_LOG_PREFIX = '[UNSAFE]';

const masker = getPIIMasker();

function isMaskingEnabled(): boolean {
  return process.env.MASK_PII !== MASK_PII_DISABLE_VALUE;
}

function maskError(error: Error): { name: string; message: string; stack?: string } {
  return {
    name: error.name,
    message: masker.maskText(error.message),
    stack: error.stack ? masker.maskText(error.stack) : undefined,
  };
}

function maskArg(arg: any): any {
  if (!isMaskingEnabled()) {
    return arg;
  }

  if (typeof arg === 'string') {
    return masker.maskText(arg);
  }

  if (typeof arg === 'object' && arg !== null) {
    if (arg instanceof Error) {
      return maskError(arg);
    }

    return masker.maskObject(arg);
  }

  return arg;
}

export const logger = {
  log: (...args: any[]) => {
    const masked = args.map(maskArg);
    console.log(...masked);
  },

  info: (...args: any[]) => {
    const masked = args.map(maskArg);
    console.info(...masked);
  },

  error: (...args: any[]) => {
    const masked = args.map(maskArg);
    console.error(...masked);
  },

  warn: (...args: any[]) => {
    const masked = args.map(maskArg);
    console.warn(...masked);
  },

  debug: (...args: any[]) => {
    const masked = args.map(maskArg);
    console.debug(...masked);
  },

  unsafe: (...args: any[]) => {
    console.log(UNSAFE_LOG_PREFIX, ...args);
  },
};

export { getPIIMasker };
