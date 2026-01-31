import { Injectable, LoggerService } from '@nestjs/common';

interface LogEntry {
  timestamp: number;
  level: 'log' | 'error' | 'warn' | 'debug' | 'verbose';
  context: string;
  message: string;
  data?: any;
}

@Injectable()
export class SimulationLogger implements LoggerService {
  private logs: LogEntry[] = [];
  private enabled = true;

  /**
   * Log a message
   */
  log(message: string, context?: string, data?: any) {
    this.addLog('log', message, context || 'Simulator', data);
  }

  /**
   * Log an error
   */
  error(message: string, trace?: string, context?: string) {
    this.addLog('error', message, context || 'Simulator', { trace });
  }

  /**
   * Log a warning
   */
  warn(message: string, context?: string, data?: any) {
    this.addLog('warn', message, context || 'Simulator', data);
  }

  /**
   * Log debug information
   */
  debug(message: string, context?: string, data?: any) {
    this.addLog('debug', message, context || 'Simulator', data);
  }

  /**
   * Log verbose information
   */
  verbose(message: string, context?: string, data?: any) {
    this.addLog('verbose', message, context || 'Simulator', data);
  }

  /**
   * Add log entry
   */
  private addLog(
    level: 'log' | 'error' | 'warn' | 'debug' | 'verbose',
    message: string,
    context: string,
    data?: any,
  ) {
    if (!this.enabled) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      context,
      message,
      data,
    };

    this.logs.push(entry);

    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console[level === 'log' ? 'log' : level](`[${context}] ${message}`, data || '');
    }
  }

  /**
   * Get all logs
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get logs filtered by level
   */
  getLogsByLevel(level: string): LogEntry[] {
    return this.logs.filter(log => log.level === level);
  }

  /**
   * Get logs filtered by context
   */
  getLogsByContext(context: string): LogEntry[] {
    return this.logs.filter(log => log.context === context);
  }

  /**
   * Export logs as JSON
   */
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get log count by level
   */
  getLogStats() {
    return {
      total: this.logs.length,
      log: this.logs.filter(l => l.level === 'log').length,
      error: this.logs.filter(l => l.level === 'error').length,
      warn: this.logs.filter(l => l.level === 'warn').length,
      debug: this.logs.filter(l => l.level === 'debug').length,
      verbose: this.logs.filter(l => l.level === 'verbose').length,
    };
  }
}