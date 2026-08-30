import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Publish commands only after every module has imported and validated. */
export async function loadCommandModules(commandsPath) {
  const commands = new Map();
  const files = (await readdir(commandsPath)).filter((file) => file.endsWith('.js')).sort();
  for (const file of files) {
    const command = await import(pathToFileURL(join(commandsPath, file)).href);
    if (!command.data?.name || typeof command.data.toJSON !== 'function' || typeof command.execute !== 'function') {
      throw new Error(`Command file ${file} thiếu 'data' hợp lệ hoặc 'execute'`);
    }
    // Slash-command serialization can fail even when the import succeeded.
    command.data.toJSON();
    if (commands.has(command.data.name)) {
      throw new Error(`Command /${command.data.name} bị trùng trong ${file}`);
    }
    commands.set(command.data.name, command);
  }
  return commands;
}

export function logRuntimeError(logger, context, error) {
  const message = error instanceof Error ? error.message
    : error !== null && (typeof error === 'object' || typeof error === 'function')
      ? 'Non-Error rejection'
      : String(error);
  logger.error(context, message);
  if (error instanceof Error && error.stack) logger.debug(error.stack);
}

/** EventEmitter does not await handlers; contain both sync throws and rejections. */
export function createEventHandler(event, logger) {
  return (...args) => {
    try {
      return Promise.resolve(event.execute(...args)).catch((error) => {
        logRuntimeError(logger, `Lỗi event ${event.name}:`, error);
      });
    } catch (error) {
      logRuntimeError(logger, `Lỗi event ${event.name}:`, error);
    }
  };
}
