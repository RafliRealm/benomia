import winston from 'winston';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

const logsDir = 'logs';
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const emoji = {
  info:  '🫘',
  warn:  '⚠️ ',
  error: '❌',
  debug: '🔍',
};

const consoleFormat = winston.format.printf(({ level, message, timestamp }) => {
  const icon = emoji[level] || '•';
  const ts = new Date(timestamp).toLocaleTimeString('id-ID');
  const colorMap = {
    info:  chalk.cyan,
    warn:  chalk.yellow,
    error: chalk.red,
    debug: chalk.gray,
  };
  const color = colorMap[level] || chalk.white;
  return `${chalk.gray(ts)} ${icon} ${color(message)}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp(),
        consoleFormat,
      ),
    }),
    new winston.transports.File({
      filename: process.env.LOG_FILE || 'logs/agent.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 3,
    }),
  ],
});

export default logger;
