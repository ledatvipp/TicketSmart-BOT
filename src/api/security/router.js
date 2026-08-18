import { Router } from 'express';

const WRAPPED = Symbol('is7.asyncRouteWrapped');
const METHODS = ['all', 'get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'use'];

/**
 * Express 4 không tự chuyển Promise rejection từ async handler sang error middleware.
 * Router này bọc toàn bộ middleware/handler để mọi throw/rejection đều đi qua next(error).
 */
export function asyncRoute(handler) {
  if (typeof handler !== 'function' || handler[WRAPPED] || handler.length === 4) return handler;
  const wrapped = function wrappedAsyncRoute(req, res, next) {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.then === 'function') result.catch(next);
    } catch (error) {
      next(error);
    }
  };
  Object.defineProperty(wrapped, WRAPPED, { value: true });
  return wrapped;
}

function wrapArguments(args) {
  return args.map((arg) => {
    if (Array.isArray(arg)) return arg.map(asyncRoute);
    return asyncRoute(arg);
  });
}

export function createSafeRouter(options) {
  const router = Router(options);
  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...wrapArguments(args));
  }
  return router;
}
