import { run, get, all } from '../../db/connection';

const SUCCESS_FLAG = 1;
const DEFAULT_RECENT_LIMIT = 10;
const DEFAULT_DAYS_TO_KEEP = 30;
const DEFAULT_AVERAGE_DURATION = 0;
const DEFAULT_COUNT = 0;

const INSERT_TOOL_USAGE_LOG_QUERY = `
  INSERT INTO tool_usage_logs (
    document_id,
    tool_name,
    tool_args,
    tool_result,
    success,
    duration,
    timestamp
  ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
`;

const GET_LOGS_FOR_DOCUMENT_QUERY = `
  SELECT
    id,
    document_id as documentId,
    tool_name as toolName,
    tool_args as toolArgs,
    tool_result as toolResult,
    success,
    duration,
    timestamp
  FROM tool_usage_logs
  WHERE document_id = ?
  ORDER BY timestamp DESC
`;

const GET_TOOL_USAGE_STATS_QUERY = `
  SELECT
    tool_name as toolName,
    COUNT(*) as totalCalls,
    AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as successRate,
    AVG(duration) as averageDuration
  FROM tool_usage_logs
  GROUP BY tool_name
`;

const GET_TOTAL_CALLS_QUERY = 'SELECT COUNT(*) as count FROM tool_usage_logs';

const GET_RECENT_LOGS_QUERY = `
  SELECT
    id,
    document_id as documentId,
    tool_name as toolName,
    tool_args as toolArgs,
    tool_result as toolResult,
    success,
    duration,
    timestamp
  FROM tool_usage_logs
  ORDER BY timestamp DESC
  LIMIT ?
`;

const CLEAR_OLD_LOGS_QUERY = `
  DELETE FROM tool_usage_logs
  WHERE timestamp < datetime('now', '-' || ? || ' days')
`;

function mapRowToToolUsageLog(row: any): ToolUsageLog {
  return {
    id: row.id,
    documentId: row.documentId,
    toolName: row.toolName,
    toolArgs: row.toolArgs,
    toolResult: row.toolResult,
    success: row.success === SUCCESS_FLAG,
    timestamp: row.timestamp,
    duration: row.duration,
  };
}

function mapRowToToolUsageStats(row: any): ToolUsageStats {
  return {
    toolName: row.toolName,
    totalCalls: row.totalCalls,
    successRate: row.successRate,
    averageDuration: row.averageDuration || DEFAULT_AVERAGE_DURATION,
  };
}

export interface ToolUsageLog {
  id?: number;
  documentId: number;
  toolName: string;
  toolArgs: string;
  toolResult: string;
  success: boolean;
  timestamp: string;
  duration?: number;
}

export interface ToolUsageStats {
  toolName: string;
  totalCalls: number;
  successRate: number;
  averageDuration: number;
}

export class ToolUsageLogger {
  async log(log: Omit<ToolUsageLog, 'id' | 'timestamp'>): Promise<number> {
    const result = await run(INSERT_TOOL_USAGE_LOG_QUERY, [
      log.documentId,
      log.toolName,
      log.toolArgs,
      log.toolResult,
      log.success ? SUCCESS_FLAG : 0,
      log.duration || null,
    ]);

    return result.lastID;
  }

  async getLogsForDocument(documentId: number): Promise<ToolUsageLog[]> {
    const rows = await all<any>(GET_LOGS_FOR_DOCUMENT_QUERY, [documentId]);
    return rows.map(mapRowToToolUsageLog);
  }

  async getStats(): Promise<ToolUsageStats[]> {
    const rows = await all<any>(GET_TOOL_USAGE_STATS_QUERY, []);
    return rows.map(mapRowToToolUsageStats);
  }

  async getTotalCalls(): Promise<number> {
    const result = await get<{ count: number }>(GET_TOTAL_CALLS_QUERY, []);
    return result?.count || DEFAULT_COUNT;
  }

  async getRecent(limit: number = DEFAULT_RECENT_LIMIT): Promise<ToolUsageLog[]> {
    const rows = await all<any>(GET_RECENT_LOGS_QUERY, [limit]);
    return rows.map(mapRowToToolUsageLog);
  }

  async clearOldLogs(daysToKeep: number = DEFAULT_DAYS_TO_KEEP): Promise<number> {
    const result = await run(CLEAR_OLD_LOGS_QUERY, [daysToKeep]);
    return result.changes;
  }
}

let toolUsageLogger: ToolUsageLogger | null = null;

export function getToolUsageLogger(): ToolUsageLogger {
  if (!toolUsageLogger) {
    toolUsageLogger = new ToolUsageLogger();
  }
  return toolUsageLogger;
}
