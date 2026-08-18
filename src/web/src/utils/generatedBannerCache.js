const DB_NAME = 'discord-ticket-dashboard-cache';
const DB_VERSION = 1;
const STORE_NAME = 'generated-assets';
const LAST_BANNER_KEY = 'last-banner';
const MAX_BANNER_BYTES = 5 * 1024 * 1024;

let memoryBanner = null;

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Không mở được cache ảnh'));
    request.onblocked = () => reject(new Error('Cache ảnh đang bị khóa bởi tab khác'));
  });
}

function dataUrlToBlob(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(String(dataUrl || ''));
  if (!match) throw new Error('Ảnh tạo ra không đúng định dạng');
  const bytes = Uint8Array.from(atob(match[2].replace(/\s/g, '')), (char) => char.charCodeAt(0));
  if (!bytes.length || bytes.byteLength > MAX_BANNER_BYTES) throw new Error('Ảnh tạo ra vượt quá 5 MB');
  return new Blob([bytes], { type: match[1].toLowerCase().replace('image/jpg', 'image/jpeg') });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Không đọc được ảnh cache'));
    reader.readAsDataURL(blob);
  });
}

async function idbRequest(mode, operation) {
  const db = await openDatabase();
  if (!db) return null;
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try { result = operation(store); } catch (error) { reject(error); return; }
      if (result && typeof result === 'object' && 'onsuccess' in result) {
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error || new Error('Lỗi cache ảnh'));
      } else {
        tx.oncomplete = () => resolve(result ?? true);
      }
      tx.onerror = () => reject(tx.error || new Error('Lỗi giao dịch cache ảnh'));
      tx.onabort = () => reject(tx.error || new Error('Giao dịch cache ảnh bị hủy'));
    });
  } finally {
    db.close();
  }
}

export async function saveGeneratedBanner(dataUrl) {
  const blob = dataUrlToBlob(dataUrl);
  const record = { blob, createdAt: Date.now(), type: blob.type, size: blob.size };
  memoryBanner = record;
  try {
    await idbRequest('readwrite', (store) => store.put(record, LAST_BANNER_KEY));
  } catch (error) {
    // Cache trong bộ nhớ vẫn dùng được trong tab hiện tại khi IndexedDB bị chặn.
    console.warn('[BANNER CACHE WRITE]', error);
  }
  return { size: blob.size, type: blob.type };
}

export async function getGeneratedBannerDataUrl() {
  let record = memoryBanner;
  if (!record) {
    try { record = await idbRequest('readonly', (store) => store.get(LAST_BANNER_KEY)); }
    catch (error) { console.warn('[BANNER CACHE READ]', error); }
  }
  const blob = record?.blob;
  if (!(blob instanceof Blob) || !blob.type.startsWith('image/') || blob.size > MAX_BANNER_BYTES) return '';
  memoryBanner = record;
  return blobToDataUrl(blob);
}

export async function hasGeneratedBanner() {
  if (memoryBanner?.blob instanceof Blob) return true;
  try {
    const record = await idbRequest('readonly', (store) => store.get(LAST_BANNER_KEY));
    if (record?.blob instanceof Blob && record.blob.size <= MAX_BANNER_BYTES) {
      memoryBanner = record;
      return true;
    }
  } catch (error) {
    console.warn('[BANNER CACHE CHECK]', error);
  }
  return false;
}

export async function clearGeneratedBanner() {
  memoryBanner = null;
  try { await idbRequest('readwrite', (store) => store.delete(LAST_BANNER_KEY)); }
  catch (error) { console.warn('[BANNER CACHE DELETE]', error); }
}
