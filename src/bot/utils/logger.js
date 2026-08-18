// ========================
// Logger Utility
// Log ra console với màu sắc và timestamp
// ========================

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Lấy timestamp hiện tại theo định dạng [HH:MM:SS]
function getTimestamp() {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');
  const s = now.getSeconds().toString().padStart(2, '0');
  return `[${h}:${m}:${s}]`;
}

const logger = {
  // Log thông tin thường
  info(message, ...args) {
    console.log(
      `${colors.cyan}${getTimestamp()}${colors.reset} ${colors.bright}[INFO]${colors.reset} ${message}`,
      ...args
    );
  },

  // Log thành công
  success(message, ...args) {
    console.log(
      `${colors.green}${getTimestamp()}${colors.reset} ${colors.bright}${colors.green}[OK]${colors.reset} ${message}`,
      ...args
    );
  },

  // Log cảnh báo
  warn(message, ...args) {
    console.warn(
      `${colors.yellow}${getTimestamp()}${colors.reset} ${colors.bright}${colors.yellow}[WARN]${colors.reset} ${message}`,
      ...args
    );
  },

  // Log lỗi
  error(message, ...args) {
    console.error(
      `${colors.red}${getTimestamp()}${colors.reset} ${colors.bright}${colors.red}[ERROR]${colors.reset} ${message}`,
      ...args
    );
  },

  // Log debug (chỉ hiện trong môi trường dev)
  debug(message, ...args) {
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `${colors.magenta}${getTimestamp()}${colors.reset} ${colors.bright}[DEBUG]${colors.reset} ${message}`,
        ...args
      );
    }
  },

  // Log sự kiện ticket
  ticket(action, ticketNum, extra = '') {
    console.log(
      `${colors.blue}${getTimestamp()}${colors.reset} ${colors.bright}${colors.blue}[TICKET]${colors.reset} ${action} #${ticketNum} ${extra}`
    );
  },
};

export default logger;
