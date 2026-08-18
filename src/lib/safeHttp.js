import dns from 'dns/promises';
import https from 'https';
import net from 'net';
import { ValidationError } from '../api/security/validation.js';

function ipv4Number(address) {
  return address.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}
function inV4Range(value, network, prefix) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (ipv4Number(network) & mask);
}
function isPublicIpv4(address) {
  const value = ipv4Number(address);
  const blocked = [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ];
  return !blocked.some(([network, prefix]) => inV4Range(value, network, prefix));
}
function normalizeIpv6(address) { return address.toLowerCase().split('%')[0]; }
function isPublicIpv6(address) {
  const value = normalizeIpv6(address);
  if (value === '::' || value === '::1') return false;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice(7);
    return net.isIP(mapped) === 4 && isPublicIpv4(mapped);
  }
  if (value.startsWith('fc') || value.startsWith('fd') || /^fe[89ab]/.test(value) || value.startsWith('ff')) return false;
  if (value.startsWith('2001:db8:')) return false;
  // Chỉ cho global unicast 2000::/3.
  return /^[23][0-9a-f]{0,3}:/.test(value);
}
export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

export async function resolveSafeHttpsUrl(value) {
  const raw = String(value || '');
  if (/[\r\n\t]/.test(raw)) throw new ValidationError('Webhook URL chứa ký tự không hợp lệ');
  let url;
  try { url = new URL(raw); } catch { throw new ValidationError('Webhook URL không hợp lệ'); }
  if (url.protocol !== 'https:') throw new ValidationError('Webhook URL bắt buộc dùng HTTPS');
  if (url.username || url.password) throw new ValidationError('Webhook URL không được chứa thông tin đăng nhập');
  if (url.hash) throw new ValidationError('Webhook URL không được chứa fragment');
  if (url.port && url.port !== '443') throw new ValidationError('Webhook chỉ được dùng cổng HTTPS 443');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new ValidationError('Webhook hostname không được phép');
  }
  let addresses;
  if (net.isIP(hostname)) addresses = [{ address: hostname, family: net.isIP(hostname) }];
  else {
    try { addresses = await dns.lookup(hostname, { all: true, verbatim: true }); }
    catch { throw new ValidationError('Không phân giải được webhook hostname'); }
  }
  const unique = [...new Map(addresses.map((row) => [row.address, row])).values()];
  if (!unique.length || unique.some((row) => !isPublicAddress(row.address))) throw new ValidationError('Webhook URL trỏ tới IP private/reserved');
  return { url, hostname, addresses: unique };
}

export async function safeHttpsPost(urlValue, { body, headers = {}, timeoutMs = 5000, maxResponseBytes = 64 * 1024 } = {}) {
  const target = await resolveSafeHttpsUrl(urlValue);
  // DNS pinning: TLS vẫn xác minh certificate theo hostname, socket kết nối IP đã kiểm tra.
  const selected = target.addresses[0];
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: 'https:', hostname: target.hostname, servername: net.isIP(target.hostname) ? undefined : target.hostname,
      port: 443, path: `${target.url.pathname}${target.url.search}`, method: 'POST',
      headers: { ...headers, Host: target.url.host },
      timeout: timeoutMs,
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family),
      agent: false,
    }, (response) => {
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > maxResponseBytes) response.destroy(new Error('Webhook response quá lớn'));
      });
      response.on('end', () => resolve({ statusCode: response.statusCode || 0 }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Webhook timeout')));
    request.on('error', reject);
    request.end(body);
  });
}
