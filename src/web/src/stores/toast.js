import { defineStore } from 'pinia';

let nextId = 1;

export const useToast = defineStore('toast', {
  state: () => ({ items: [] }),
  actions: {
    push(message, type = 'info', duration = 3000) {
      const id = nextId++;
      this.items.push({ id, message, type });
      setTimeout(() => {
        this.items = this.items.filter((t) => t.id !== id);
      }, duration);
    },
    success(msg) { this.push(msg, 'success'); },
    error(msg)   { this.push(msg, 'error', 5000); },
    info(msg)    { this.push(msg, 'info'); },
  },
});
