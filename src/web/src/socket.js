// Socket.IO client singleton + bus
import { io } from 'socket.io-client';
import { reactive } from 'vue';

export const socketState = reactive({
  connected: false,
  lastError: null,
});

let socket = null;
const listeners = new Map(); // event -> Set<fn>

export function connectSocket(token) {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  if (!token) return;

  socket = io('/', {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => { socketState.connected = true; socketState.lastError = null; });
  socket.on('disconnect', () => { socketState.connected = false; });
  socket.on('connect_error', (err) => { socketState.lastError = err.message; });

  // Re-bind tất cả listener đã đăng ký
  for (const [event, fns] of listeners.entries()) {
    for (const fn of fns) socket.on(event, fn);
  }
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  socketState.connected = false;
}

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  socket?.on(event, fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  listeners.get(event)?.delete(fn);
  socket?.off(event, fn);
}

export function emit(event, ...args) {
  socket?.emit(event, ...args);
}

export function subscribeTicket(ticketId) {
  emit('ticket:subscribe', ticketId);
}
export function unsubscribeTicket(ticketId) {
  emit('ticket:unsubscribe', ticketId);
}
