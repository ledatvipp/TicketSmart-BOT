<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { TicketsAPI, MessagesAPI, AuditAPI, CannedAPI, FaqAPI, ClustersAPI } from '../api/endpoints';
import { useToast } from '../stores/toast';
import { useAuth } from '../stores/auth';
import { on, subscribeTicket, unsubscribeTicket } from '../socket';
import StButton from '../components/StButton.vue';
import { highlightedParts, normalizeExternalUrl, renderSafeTicketHtml } from '../utils/safeContent';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const auth = useAuth();

const ticket = ref(null);
const messages = ref([]);
const auditEntries = ref([]);
const moveHistory = ref([]);
const cannedList = ref([]);
const similarTickets = ref([]);
const clusters = ref([]);
const loading = ref(true);
const noteDraft = ref('');
const tagsDraft = ref('');
const replyDraft = ref('');
const replying = ref(false);
const internalDraft = ref('');
const sendingInternal = ref(false);
const transcriptEl = ref(null);
const replyEl = ref(null);
const closeSheetOpen = ref(false);
const closeType = ref('success');
const closeReason = ref('');
const closing = ref(false);

const searchOpen = ref(false);
const searchTerm = ref('');
const cannedOpen = ref(false);

const autoCompleteActive = ref(false);
const autoCompleteIndex = ref(0);

const ticketId = computed(() => route.params.id);
const pad4 = (n) => String(n ?? 0).padStart(4, '0');

const unbinds = [];
const nowTick = ref(Date.now());
let tickerInterval = null;

const isClosed = computed(() => ticket.value?.status === 'closed');
const canReply = computed(() => auth.hasPermission('ticket.reply'));
const canClaim = computed(() => auth.hasPermission('ticket.claim'));
const canClose = computed(() => auth.hasPermission('ticket.close'));
const canExport = computed(() => auth.hasPermission('ticket.export'));
const canExportInternal = computed(() => auth.hasPermission('ticket.exportInternal'));
const canViewInternal = computed(() => auth.hasPermission('ticket.viewInternal') || canExportInternal.value);
const canWriteInternal = computed(() => auth.hasPermission('ticket.note') && canViewInternal.value);
const canSetPriority = computed(() => auth.hasPermission('ticket.priority'));
const canEditTags = computed(() => auth.hasPermission('ticket.tags'));
const canEditNote = computed(() => auth.hasPermission('ticket.note') && canViewInternal.value);
const canManageWorkflow = computed(() => auth.hasPermission('ticket.workflow'));
const canViewAudit = computed(() => auth.hasPermission('audit.view'));
const canViewCanned = computed(() => auth.hasPermission('canned.view'));
const canViewFaq = computed(() => auth.hasPermission('faq.view'));
const currentCluster = computed(() => clusters.value.find((item) => item.key === ticket.value?.clusterKey) || null);
const aiTriage = computed(() => {
  try { return typeof ticket.value?.aiTriage === 'string' ? JSON.parse(ticket.value.aiTriage || '{}') : (ticket.value?.aiTriage || {}); }
  catch { return {}; }
});
const aiMissingInfo = computed(() => {
  try {
    const value = ticket.value?.aiMissingInfo;
    return Array.isArray(value) ? value : JSON.parse(value || '[]');
  } catch { return []; }
});

async function load() {
  loading.value = true;
  try {
    const [t, msgs, audit, canned, similar, clusterRows, moves] = await Promise.all([
      TicketsAPI.get(ticketId.value),
      MessagesAPI.list(ticketId.value, canViewInternal.value),
      canViewAudit.value
        ? AuditAPI.list({ ticketId: ticketId.value, limit: 100 }).catch(() => ({ items: [] }))
        : Promise.resolve({ items: [] }),
      canViewCanned.value ? CannedAPI.list().catch(() => []) : Promise.resolve([]),
      canViewFaq.value ? FaqAPI.similar(ticketId.value).catch(() => []) : Promise.resolve([]),
      ClustersAPI.list({ active: true }).catch(() => []),
      TicketsAPI.moves(ticketId.value).catch(() => []),
    ]);
    ticket.value = t;
    messages.value = msgs;
    auditEntries.value = Array.isArray(audit?.items) ? audit.items : [];
    cannedList.value = canned;
    similarTickets.value = similar;
    clusters.value = clusterRows;
    moveHistory.value = Array.isArray(moves) ? moves : [];
    noteDraft.value = t.note || '';
    tagsDraft.value = (t.tags || '').split(',').map((x) => x.trim()).filter(Boolean).join(', ');
    await nextTick();
    scrollBottom();
  } catch {
    toast.error('Không tải được ticket');
  } finally {
    loading.value = false;
  }
}

function scrollBottom() {
  if (transcriptEl.value) transcriptEl.value.scrollTop = transcriptEl.value.scrollHeight;
}

onMounted(async () => {
  subscribeTicket(ticketId.value);
  await load();
  tickerInterval = setInterval(() => { nowTick.value = Date.now(); }, 1000);

  unbinds.push(on('message', (msg) => {
    if (msg.ticketId && msg.ticketId !== ticketId.value) return;
    const index = messages.value.findIndex((m) => m.id === msg.id || (msg.discordMessageId && m.discordMessageId === msg.discordMessageId));
    if (index >= 0) messages.value[index] = { ...messages.value[index], ...msg };
    else messages.value.push(msg);
    nextTick(scrollBottom);
  }));
  unbinds.push(on('audit', (entry) => {
    if (!canViewAudit.value || (entry.ticketId && entry.ticketId !== ticketId.value)) return;
    auditEntries.value.unshift(entry);
  }));
  unbinds.push(on('ticket:updated', (t) => {
    if (ticket.value && t.id === ticketId.value) Object.assign(ticket.value, t);
  }));
  unbinds.push(on('ticket:moved', (payload) => {
    if (payload?.ticketId !== ticketId.value) return;
    if (payload.ticket && ticket.value) Object.assign(ticket.value, payload.ticket);
    if (payload.move && !moveHistory.value.some((item) => item.id === payload.move.id)) moveHistory.value.unshift(payload.move);
  }));
  unbinds.push(on('canned:updated', () => {
    if (!canViewCanned.value) return;
    CannedAPI.list().then((items) => { cannedList.value = items; }).catch(() => {});
  }));

  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  unsubscribeTicket(ticketId.value);
  for (const fn of unbinds) fn();
  clearInterval(tickerInterval);
  window.removeEventListener('keydown', onKeydown);
});

watch(ticketId, async (nextId, previousId) => {
  if (previousId) unsubscribeTicket(previousId);
  ticket.value = null;
  messages.value = [];
  auditEntries.value = [];
  moveHistory.value = [];
  subscribeTicket(nextId);
  await load();
});

function onKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    searchOpen.value = true;
    nextTick(() => document.querySelector('input[data-tx-search]')?.focus());
  } else if (e.key === 'Escape') {
    if (autoCompleteActive.value) autoCompleteActive.value = false;
    else if (searchOpen.value) searchOpen.value = false;
    else if (cannedOpen.value) cannedOpen.value = false;
  } else if (canReply.value && (e.ctrlKey || e.metaKey) && e.key === 'Enter' && document.activeElement === replyEl.value) {
    e.preventDefault();
    sendReply();
  }
}

// Actions
async function setPriority(p) {
  if (!canSetPriority.value || isClosed.value) return;
  try {
    ticket.value = { ...ticket.value, ...(await TicketsAPI.setPriority(ticketId.value, p)) };
    toast.success(`Priority: ${p}`);
  } catch { toast.error('Lỗi'); }
}

async function saveNote() {
  if (!canEditNote.value) return;
  try {
    ticket.value = { ...ticket.value, ...(await TicketsAPI.setNote(ticketId.value, noteDraft.value)) };
    toast.success('Đã lưu ghi chú');
  } catch { toast.error('Lỗi'); }
}

async function saveTags() {
  if (!canEditTags.value || isClosed.value) return;
  try {
    const arr = tagsDraft.value.split(',').map((x) => x.trim()).filter(Boolean);
    ticket.value = { ...ticket.value, ...(await TicketsAPI.setTags(ticketId.value, arr)) };
    toast.success('Đã lưu tags');
  } catch { toast.error('Lỗi'); }
}

async function claim() {
  if (!canClaim.value || isClosed.value) return;
  try {
    await TicketsAPI.claim(ticketId.value);
    toast.success('Đã claim');
    await load();
  } catch (e) { toast.error(e.response?.data?.message || 'Lỗi'); }
}

async function setWorkflowStatus(workflowStatus) {
  if (!canManageWorkflow.value || isClosed.value) return;
  try {
    const updated = await TicketsAPI.updateWorkflow(ticketId.value, { workflowStatus });
    ticket.value = { ...ticket.value, ...updated };
    toast.success('Đã cập nhật luồng xử lý');
  } catch (e) { toast.error(e.response?.data?.message || 'Không cập nhật được workflow'); }
}

async function toggleTicketAi() {
  if (!canManageWorkflow.value || isClosed.value) return;
  try {
    const updated = await TicketsAPI.updateWorkflow(ticketId.value, { aiPaused: !ticket.value.aiPaused });
    ticket.value = { ...ticket.value, ...updated };
    toast.success(updated.aiPaused ? 'Đã tạm dừng AI' : 'Đã bật lại AI');
  } catch (e) { toast.error(e.response?.data?.message || 'Không đổi được trạng thái AI'); }
}

const CLOSE_TYPES = [
  { value: 'success', label: 'Hỗ trợ thành công', hint: 'Gửi kết quả hỗ trợ và đánh giá' },
  { value: 'proof', label: 'Đã làm xong + bằng chứng', hint: 'Có thể dán link ảnh/bằng chứng' },
  { value: 'no_response', label: 'User không phản hồi', hint: 'Gửi thông báo đóng ticket' },
  { value: 'rejected', label: 'Từ chối yêu cầu', hint: 'Gửi lý do từ chối' },
  { value: 'silent', label: 'Đóng im lặng', hint: 'Không gửi DM, không đánh giá' },
];

async function closeTicketFromSheet() {
  if (!canClose.value || isClosed.value) return;
  if (closeType.value !== 'silent' && !closeReason.value.trim()) {
    toast.error('Nhập nội dung gửi cho người chơi hoặc chọn đóng im lặng');
    return;
  }
  closing.value = true;
  try {
    await TicketsAPI.close(ticketId.value, {
      closeType: closeType.value,
      reason: closeType.value === 'silent' ? '' : closeReason.value.trim(),
    });
    toast.success('Đã đóng');
    closeSheetOpen.value = false;
    await load();
  } catch (e) {
    toast.error(e.response?.data?.message || 'Lỗi');
  } finally {
    closing.value = false;
  }
}

async function downloadTranscript() {
  if (!canExport.value) return;
  try {
    await TicketsAPI.downloadTranscript(ticketId.value, canExportInternal.value);
    toast.success('Đã tải transcript');
  } catch (e) {
    toast.error(e.message || 'Lỗi tải');
  }
}

async function sendReply() {
  if (!canReply.value || isClosed.value || !replyDraft.value.trim() || replying.value) return;
  replying.value = true;
  try {
    await TicketsAPI.reply(ticketId.value, replyDraft.value);
    replyDraft.value = '';
    toast.success('Đã gửi reply');
  } catch (e) {
    toast.error(e.response?.data?.message || 'Lỗi gửi');
  } finally {
    replying.value = false;
  }
}

async function sendInternalMessage() {
  const content = internalDraft.value.trim();
  if (!content || sendingInternal.value || !canWriteInternal.value) return;
  sendingInternal.value = true;
  try {
    const message = await MessagesAPI.addInternal(ticketId.value, content);
    if (!messages.value.some((item) => item.id === message.id)) messages.value.push(message);
    internalDraft.value = '';
    await nextTick(scrollBottom);
    toast.success('Đã thêm ghi chú nội bộ');
  } catch (e) {
    toast.error(e.response?.data?.message || 'Không thêm được ghi chú nội bộ');
  } finally {
    sendingInternal.value = false;
  }
}

function useCanned(c) {
  const content = c.content
    .replaceAll('{user}', `@${ticket.value?.creatorName || 'user'}`)
    .replaceAll('{ticketNum}', pad4(ticket.value?.ticketNum));
  replyDraft.value = replyDraft.value ? `${replyDraft.value}\n${content}` : content;
  cannedOpen.value = false;
  nextTick(() => replyEl.value?.focus());
}

// Search
const searchMatches = computed(() => {
  if (!searchTerm.value) return [];
  const q = searchTerm.value.toLowerCase();
  return messages.value.filter((m) => (m.content || '').toLowerCase().includes(q));
});

function messageParts(content) {
  return highlightedParts(content, searchTerm.value);
}

function jumpToMatch(msgId) {
  const el = document.getElementById(`msg-${msgId}`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el?.classList.add('flash');
  setTimeout(() => el?.classList.remove('flash'), 1500);
}

function messageMedia(m) {
  return (Array.isArray(m.attachments) ? m.attachments : []).map((item, index) => ({
    ...item,
    index,
    safeUrl: normalizeExternalUrl(item?.url, { allowHttp: true }),
    safeImage: normalizeExternalUrl(item?.image, { allowHttp: true }),
    safeThumbnail: normalizeExternalUrl(item?.thumbnail, { allowHttp: true }),
  }));
}

function messageFiles(m) {
  return messageMedia(m).filter((item) => (!item.kind || item.kind === 'attachment') && item.safeUrl);
}

function messageEmbeds(m) {
  return messageMedia(m).filter((item) => item.kind === 'embed');
}

function embedHref(embed) {
  return embed.safeUrl || embed.safeImage || embed.safeThumbnail || '';
}

function safeAvatar(url) {
  return normalizeExternalUrl(url, { allowHttp: true });
}

function isImageFile(attachment) {
  return Boolean(attachment?.safeUrl && (
    attachment.contentType?.startsWith('image/') ||
    /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(attachment.safeUrl)
  ));
}

// Formatting
const fmtTime = (t) => new Date(t).toLocaleString('vi-VN');
const fmtDate = (t) => new Date(t).toLocaleDateString('vi-VN');

function timeSince(date) {
  if (!date) return '—';
  const ms = nowTick.value - new Date(date).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

const slaColor = computed(() => {
  if (!ticket.value || isClosed.value) return 'var(--on-surface-variant)';
  const since = ticket.value.lastMessageAt || ticket.value.openedAt;
  const hrs = (nowTick.value - new Date(since).getTime()) / 3600_000;
  if (hrs < 1) return 'var(--success-2)';
  if (hrs < 6) return 'var(--warning-2)';
  return 'var(--error)';
});

const ACTION_META = {
  'ticket.create':    { icon: 'add_circle',      color: 'var(--success-2)',  label: 'Tạo' },
  'ticket.claim':     { icon: 'pan_tool',        color: 'var(--warning-2)',  label: 'Claim' },
  'ticket.close':     { icon: 'lock',            color: 'var(--error)',      label: 'Đóng' },
  'ticket.reply':     { icon: 'reply',           color: 'var(--primary)',    label: 'Reply từ web' },
  'ticket.note':      { icon: 'edit_note',       color: 'var(--outline)',    label: 'Ghi chú' },
  'ticket.priority':  { icon: 'priority_high',   color: 'var(--orange)',     label: 'Priority' },
  'ticket.tags':      { icon: 'sell',            color: 'var(--outline)',    label: 'Tags' },
  'ticket.rating':    { icon: 'star',            color: 'var(--warning-2)',  label: 'Rating' },
  'ticket.sla.breach':{ icon: 'warning',         color: 'var(--error)',      label: 'SLA breach' },
};
function actionMeta(action) {
  return ACTION_META[action] || { icon: 'circle', color: 'var(--outline)', label: action };
}

const formDataParsed = computed(() => {
  if (!ticket.value?.formData || ticket.value.formData === '{}') return null;
  try {
    const data = JSON.parse(ticket.value.formData);
    return Object.values(data);
  } catch { return null; }
});

const watchersList = computed(() => (ticket.value?.watchers || '').split(',').filter(Boolean));
const tagsList = computed(() => (ticket.value?.tags || '').split(',').map((t) => t.trim()).filter(Boolean));

const STATUS_BADGE = {
  open:    { class: 'badge-green',  label: 'Đang mở',   icon: 'radio_button_checked' },
  claimed: { class: 'badge-yellow', label: 'Đang xử lý', icon: 'pending' },
  closed:  { class: 'badge-gray',   label: 'Đã đóng',   icon: 'check_circle' },
};

const PRIORITY_META = {
  urgent: { label: 'URGENT', color: 'var(--error)',    bg: 'rgba(255,180,171,.15)' },
  high:   { label: 'HIGH',   color: 'var(--orange)',   bg: 'rgba(251,146,60,.15)' },
  normal: { label: 'NORMAL', color: 'var(--outline)',  bg: 'var(--surface-container-high)' },
};

const matchedCanned = computed(() => {
  if (!autoCompleteActive.value) return [];
  const text = replyDraft.value;
  const slashIdx = text.lastIndexOf('/');
  if (slashIdx === -1) return [];
  const query = text.slice(slashIdx + 1).toLowerCase();
  return cannedList.value.filter((c) => c.shortcut.toLowerCase().startsWith(query));
});

watch(replyDraft, (newVal) => {
  const slashIdx = newVal.lastIndexOf('/');
  if (slashIdx !== -1) {
    const charBefore = slashIdx > 0 ? newVal[slashIdx - 1] : '\n';
    if (charBefore === ' ' || charBefore === '\n') {
      autoCompleteActive.value = true;
      autoCompleteIndex.value = 0;
      return;
    }
  }
  autoCompleteActive.value = false;
});

function selectAutocomplete(c) {
  const text = replyDraft.value;
  const slashIdx = text.lastIndexOf('/');
  if (slashIdx !== -1) {
    const beforeSlash = text.slice(0, slashIdx);
    const content = c.content
      .replaceAll('{user}', `@${ticket.value?.creatorName || 'user'}`)
      .replaceAll('{ticketNum}', pad4(ticket.value?.ticketNum));
    replyDraft.value = beforeSlash + content;
  } else {
    useCanned(c);
  }
  autoCompleteActive.value = false;
  nextTick(() => replyEl.value?.focus());
}

function onComposerKeydown(e) {
  if (autoCompleteActive.value && matchedCanned.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      autoCompleteIndex.value = (autoCompleteIndex.value + 1) % matchedCanned.value.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      autoCompleteIndex.value = (autoCompleteIndex.value - 1 + matchedCanned.value.length) % matchedCanned.value.length;
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      selectAutocomplete(matchedCanned.value[autoCompleteIndex.value]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      autoCompleteActive.value = false;
    }
  }
}

function downloadHTMLTranscript() {
  if (!canExport.value) return;
  try {
    const html = renderTicketHTML(ticket.value, messages.value);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `transcript-ticket-${pad4(ticket.value.ticketNum)}.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Đã tải transcript HTML');
  } catch (e) {
    toast.error('Lỗi tải transcript HTML');
  }
}

function renderTicketHTML(t, msgs) {
  return renderSafeTicketHtml(t, msgs, { includeInternal: canExportInternal.value });
}

</script>

<template>
  <div v-if="loading" class="empty">
    <span class="material-symbols-outlined" style="font-size: 32px; opacity: 0.5;">progress_activity</span>
    <div style="margin-top: 8px;">Đang tải...</div>
  </div>

  <template v-else-if="ticket">
    <!-- ─── BACK + ACTIONS ─── -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <StButton variant="ghost" @click="router.push('/tickets')">
        <span class="material-symbols-outlined symbol-sm">arrow_back</span> Quay lại
      </StButton>

      <div class="flex gap-2">
        <StButton variant="ghost" icon @click="searchOpen = !searchOpen" title="Tìm trong transcript (Ctrl+F)">
          <span class="material-symbols-outlined">search</span>
        </StButton>
        <StButton v-if="canExport" variant="ghost" @click="downloadTranscript" title="Tải transcript .md">
          <span class="material-symbols-outlined symbol-sm">download</span>
          <span>Tải .md</span>
        </StButton>
        <StButton v-if="canExport" variant="ghost" @click="downloadHTMLTranscript" title="Tải transcript HTML">
          <span class="material-symbols-outlined symbol-sm">html</span>
          <span>Tải HTML</span>
        </StButton>
        <StButton v-if="canClaim && !isClosed && ticket.status === 'open'" variant="primary" @click="claim">
          <span class="material-symbols-outlined symbol-sm">pan_tool</span> Claim
        </StButton>
        <StButton v-if="canClose && !isClosed" variant="danger" @click="closeSheetOpen = true">
          <span class="material-symbols-outlined symbol-sm">lock</span> Đóng
        </StButton>
      </div>
    </div>

    <div v-if="canClose && closeSheetOpen" class="modal-backdrop" @click.self="closeSheetOpen = false">
      <div class="modal-panel size-md close-sheet">
        <div class="modal-header">
          <div>
            <p class="close-eyebrow">Close ticket</p>
            <h2 class="modal-title">Đóng Ticket #{{ pad4(ticket.ticketNum) }}</h2>
          </div>
          <button class="modal-close" @click="closeSheetOpen = false">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <div class="close-type-grid">
          <button
            v-for="type in CLOSE_TYPES"
            :key="type.value"
            :class="{ active: closeType === type.value }"
            @click="closeType = type.value"
          >
            <strong>{{ type.label }}</strong>
            <span>{{ type.hint }}</span>
          </button>
        </div>

        <div v-if="closeType !== 'silent'" class="form-row" style="margin-top: 16px;">
          <label>Nội dung gửi cho người chơi</label>
          <textarea
            v-model="closeReason"
            placeholder="Nhập kết quả hỗ trợ, hướng dẫn tiếp theo, hoặc dán link ảnh/bằng chứng..."
            style="min-height: 130px;"
          ></textarea>
          <div class="muted text-xs">Có nội dung thì hệ thống sẽ ghi nhận staff hỗ trợ và gửi đánh giá cho user.</div>
        </div>

        <div v-else class="silent-note">
          Đóng im lặng sẽ chỉ đóng ticket và ghi audit nội bộ. Bot sẽ không gửi DM và không gửi đánh giá.
        </div>

        <div class="modal-actions">
          <StButton variant="ghost" @click="closeSheetOpen = false">Hủy</StButton>
          <StButton variant="danger" :disabled="closing" @click="closeTicketFromSheet">
            <span class="material-symbols-outlined symbol-sm">lock</span>
            {{ closing ? 'Đang đóng...' : 'Đóng ticket' }}
          </StButton>
        </div>
      </div>
    </div>

    <!-- ─── HERO CARD ─── -->
    <div class="card" style="margin-bottom: 20px; padding: 24px;">
      <div class="flex" style="align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap;">
        <div class="flex-1" style="min-width: 280px;">
          <div class="flex gap-3" style="align-items: center; margin-bottom: 8px; flex-wrap: wrap;">
            <h1 style="font-size: 28px; font-weight: 600; letter-spacing: -0.02em; margin: 0; color: var(--on-surface);">
              Ticket #{{ pad4(ticket.ticketNum) }}
            </h1>
            <span :class="['badge', STATUS_BADGE[ticket.status].class]" style="font-size: 12px; padding: 4px 12px;">
              <span class="material-symbols-outlined" style="font-size: 14px;">{{ STATUS_BADGE[ticket.status].icon }}</span>
              {{ STATUS_BADGE[ticket.status].label }}
            </span>
            <span :style="{
              padding: '4px 12px', borderRadius: 'var(--r-full)', fontSize: '11px', fontWeight: '600',
              letterSpacing: '0.06em', color: PRIORITY_META[ticket.priority].color,
              background: PRIORITY_META[ticket.priority].bg,
            }">{{ PRIORITY_META[ticket.priority].label }}</span>
          </div>

          <div class="muted text-sm flex gap-4" style="flex-wrap: wrap;">
            <span class="flex gap-2" style="align-items: center;">
              <span class="material-symbols-outlined symbol-sm">hub</span>
              {{ currentCluster?.emoji || '❔' }} {{ currentCluster?.name || ticket.clusterKey || 'Chưa chọn cụm' }}
            </span>
            <span class="flex gap-2" style="align-items: center;">
              <span class="material-symbols-outlined symbol-sm">label</span>
              {{ ticket.option?.emoji || '◈' }} {{ ticket.option?.name || '—' }}
            </span>
            <span class="flex gap-2" style="align-items: center;">
              <span class="material-symbols-outlined symbol-sm">person</span>
              {{ ticket.creatorName }}
            </span>
            <span class="flex gap-2" style="align-items: center;">
              <span class="material-symbols-outlined symbol-sm">schedule</span>
              {{ fmtTime(ticket.openedAt) }}
            </span>
            <span v-if="!isClosed" class="flex gap-2" :style="{ color: slaColor, fontWeight: 600 }">
              <span class="material-symbols-outlined symbol-sm">timer</span>
              {{ timeSince(ticket.lastMessageAt || ticket.openedAt) }} không hoạt động
            </span>
          </div>

          <!-- Tags inline -->
          <div v-if="tagsList.length" class="flex gap-2 mt-3" style="flex-wrap: wrap;">
            <span v-for="t in tagsList" :key="t" class="chip" style="padding: 4px 12px; font-size: 11px;">
              <span class="material-symbols-outlined" style="font-size: 13px;">sell</span>
              {{ t }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- ─── MAIN GRID ─── -->
    <div style="display: grid; grid-template-columns: 1fr 360px; gap: 20px; align-items: start;">

      <!-- LEFT: Transcript + Reply -->
      <div style="display: flex; flex-direction: column; gap: 16px; min-width: 0;">
        <div class="card" style="display: flex; flex-direction: column; height: 65vh; padding: 0; overflow: hidden;">

          <!-- Transcript header -->
          <div class="flex" style="align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--outline-variant); gap: 12px;">
            <div class="flex gap-2" style="align-items: center;">
              <span class="material-symbols-outlined">forum</span>
              <strong style="font-size: 14px;">Transcript</strong>
              <span class="muted text-sm">· {{ messages.length }} tin nhắn</span>
            </div>

            <!-- Search inline -->
            <Transition name="route">
              <div v-if="searchOpen" class="flex gap-2" style="align-items: center; flex: 1; max-width: 360px;">
                <input
                  data-tx-search v-model="searchTerm"
                  placeholder="Tìm trong transcript..."
                  style="flex: 1; padding: 6px 12px; font-size: 12px; border-radius: 999px;"
                />
                <span v-if="searchTerm" class="muted text-xs">{{ searchMatches.length }}</span>
                <button class="topnav-btn" @click="searchOpen = false">
                  <span class="material-symbols-outlined symbol-sm">close</span>
                </button>
              </div>
            </Transition>

            <span v-if="!isClosed" class="badge badge-green" style="font-size: 10px;">
              <span style="width:6px;height:6px;border-radius:50%;background:var(--success-2);box-shadow:0 0 8px var(--success-2);"></span>
              LIVE
            </span>
          </div>

          <!-- Search results -->
          <Transition name="route">
            <div v-if="searchOpen && searchTerm && searchMatches.length" style="padding: 8px 14px; border-bottom: 1px solid var(--outline-variant); max-height: 140px; overflow-y: auto; background: var(--surface-container);">
              <div
                v-for="m in searchMatches.slice(0, 8)" :key="'s-' + m.id"
                @click="jumpToMatch(m.id)"
                style="padding: 6px 10px; cursor: pointer; border-radius: 8px; font-size: 11px;"
                class="interactive-row"
              >
                <strong>{{ m.authorName }}</strong>
                <span class="muted2"> · {{ fmtTime(m.timestamp) }}</span>
                <div class="muted text-xs" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ m.content }}</div>
              </div>
            </div>
          </Transition>

          <!-- Messages list -->
          <div ref="transcriptEl" style="flex: 1; overflow-y: auto; padding: 12px;">
            <div v-if="!messages.length" class="empty">
              <span class="material-symbols-outlined" style="font-size: 32px; opacity: 0.4;">chat_bubble_outline</span>
              <div style="margin-top: 8px;">Chưa có tin nhắn</div>
            </div>
            <div v-for="m in messages" :key="m.id" :id="`msg-${m.id}`" :class="['msg', { bot: m.isBot, 'msg-staff': !m.isBot && m.authorId !== ticket.creatorId, 'msg-internal': m.isInternal }]">
              <img v-if="safeAvatar(m.authorAvatar)" :src="safeAvatar(m.authorAvatar)" class="avatar" alt="" referrerpolicy="no-referrer" loading="lazy" />
              <div v-else class="avatar" style="display: grid; place-items: center; font-weight: 700; font-size: 13px; background: var(--primary-container); color: var(--on-primary);">
                {{ (m.authorName || '?')[0].toUpperCase() }}
              </div>
              <div class="flex-1">
                <div>
                  <span class="author">{{ m.authorName }}</span>
                  <span v-if="m.isBot" class="badge badge-brand" style="margin-left: 6px; font-size: 9px; padding: 1px 5px;">BOT</span>
                  <span v-if="m.isInternal" class="badge badge-warning" style="margin-left: 6px; font-size: 9px; padding: 1px 5px;">NỘI BỘ</span>
                  <span class="time">{{ fmtTime(m.timestamp) }}</span>
                </div>
                <div class="content">
                  <template v-for="(part, partIndex) in messageParts(m.content)" :key="`${m.id}-part-${partIndex}`">
                    <mark v-if="part.match" class="search-highlight">{{ part.text }}</mark>
                    <span v-else>{{ part.text }}</span>
                  </template>
                </div>
                <div v-if="messageFiles(m).length" class="message-media">
                  <a
                    v-for="a in messageFiles(m)"
                    :key="a.url"
                    :href="a.safeUrl"
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    referrerpolicy="no-referrer"
                    :class="['media-file', { image: isImageFile(a) }]"
                  >
                    <img v-if="isImageFile(a)" :src="a.safeUrl" :alt="a.name || 'attachment'" loading="lazy" referrerpolicy="no-referrer" />
                    <span v-else class="material-symbols-outlined">attach_file</span>
                    <strong>{{ a.name || 'Attachment' }}</strong>
                  </a>
                </div>

                <div v-if="messageEmbeds(m).length" class="message-embeds">
                  <a
                    v-for="e in messageEmbeds(m)"
                    :key="`${m.id}-embed-${e.index}`"
                    :href="embedHref(e) || undefined"
                    :target="embedHref(e) ? '_blank' : undefined"
                    :rel="embedHref(e) ? 'noopener noreferrer nofollow' : undefined"
                    referrerpolicy="no-referrer"
                    class="embed-card"
                  >
                    <img v-if="e.safeThumbnail" :src="e.safeThumbnail" alt="" class="embed-thumb" loading="lazy" referrerpolicy="no-referrer" />
                    <div class="embed-body">
                      <small v-if="e.provider || e.author">{{ e.provider || e.author }}</small>
                      <strong v-if="e.title">{{ e.title }}</strong>
                      <p v-if="e.description">{{ e.description }}</p>
                      <img v-if="e.safeImage" :src="e.safeImage" alt="" class="embed-image" loading="lazy" referrerpolicy="no-referrer" />
                      <small v-if="e.footer">{{ e.footer }}</small>
                    </div>
                  </a>
                </div>
              </div>
            </div>
          </div>

          <!-- Reply composer (INSIDE transcript card khi không closed) -->
          <div v-if="!isClosed && canReply" style="position: relative; border-top: 1px solid var(--outline-variant); padding: 12px 14px; background: var(--surface-container);">
            <!-- Canned Response Autocomplete Composer Popup -->
            <div v-if="autoCompleteActive && matchedCanned.length" class="canned-autocomplete">
              <div
                v-for="(c, idx) in matchedCanned" :key="'ac-' + c.id"
                :class="['canned-autocomplete-item', { active: idx === autoCompleteIndex }]"
                @click="selectAutocomplete(c)"
              >
                <div style="font-size: 12px; font-weight: 600; display: flex; justify-content: space-between;">
                  <span><code style="background: transparent; color: var(--primary);">/{{ c.shortcut }}</code> {{ c.title }}</span>
                  <span class="muted text-xs">Phím Enter để chọn</span>
                </div>
                <div class="muted text-xs" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ c.content }}</div>
              </div>
            </div>

            <div class="flex" style="align-items: flex-start; gap: 10px;">
              <textarea
                ref="replyEl"
                v-model="replyDraft"
                @keydown="onComposerKeydown"
                placeholder="Reply như staff... (gõ / để chèn canned, Ctrl+Enter để gửi)"
                style="flex: 1; min-height: 50px; max-height: 200px; font-size: 13px; resize: vertical;"
              ></textarea>
              <div class="flex" style="flex-direction: column; gap: 6px;">
                <button class="topnav-btn" @click="cannedOpen = !cannedOpen" title="Canned responses">
                  <span class="material-symbols-outlined">format_quote</span>
                </button>
                <StButton variant="primary" size="sm" icon :disabled="!replyDraft.trim() || replying" @click="sendReply" :title="replying ? 'Đang gửi...' : 'Gửi (Ctrl+Enter)'">
                  <span class="material-symbols-outlined symbol-sm">{{ replying ? 'progress_activity' : 'send' }}</span>
                </StButton>
              </div>
            </div>
            <div class="muted text-xs mt-2">
              Biến: <code>{user}</code> <code>{ticketNum}</code> <code>{staff}</code> · Tin nhắn sẽ gửi vào Discord channel
            </div>

            <!-- Canned dropdown -->
            <Transition name="route">
              <div v-if="cannedOpen" style="margin-top: 10px; border: 1px solid var(--outline-variant); border-radius: var(--r-md); max-height: 240px; overflow-y: auto; background: var(--surface-container-low);">
                <div v-if="!cannedList.length" class="empty" style="padding: 20px;">Chưa có canned</div>
                <div
                  v-for="c in cannedList" :key="c.id"
                  @click="useCanned(c)"
                  style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--outline-variant);"
                class="interactive-row"
                >
                  <div style="font-size: 12px; font-weight: 600;">
                    <code style="background: transparent; color: var(--primary);">/{{ c.shortcut }}</code> {{ c.title }}
                  </div>
                  <div class="muted text-xs" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{{ c.content }}</div>
                </div>
              </div>
            </Transition>
          </div>

          <div v-if="!isClosed && canWriteInternal" class="internal-composer">
            <textarea
              v-model="internalDraft"
              maxlength="4000"
              placeholder="Ghi chú nội bộ — chỉ staff có quyền mới thấy..."
              @keydown.ctrl.enter.prevent="sendInternalMessage"
              @keydown.meta.enter.prevent="sendInternalMessage"
            ></textarea>
            <StButton variant="ghost" size="sm" :disabled="!internalDraft.trim() || sendingInternal" @click="sendInternalMessage">
              <span class="material-symbols-outlined symbol-sm">lock_note</span>
              {{ sendingInternal ? 'Đang lưu...' : 'Lưu nội bộ' }}
            </StButton>
          </div>

          <!-- Closed state — gợi ý download -->
          <div v-if="isClosed" style="border-top: 1px solid var(--outline-variant); padding: 14px; background: var(--surface-container); text-align: center;">
            <span class="material-symbols-outlined" style="vertical-align: middle; color: var(--outline);">lock</span>
            <span class="muted text-sm" style="margin: 0 8px;">Ticket đã đóng, không gửi tin nhắn được nữa.</span>
            <StButton v-if="canExport" variant="ghost" size="sm" @click="downloadTranscript">
              <span class="material-symbols-outlined symbol-sm">download</span> Tải .md
            </StButton>
            <StButton v-if="canExport" variant="ghost" size="sm" @click="downloadHTMLTranscript" style="margin-left: 8px;">
              <span class="material-symbols-outlined symbol-sm">html</span> Tải HTML
            </StButton>
          </div>
        </div>
      </div>

      <!-- RIGHT: Sidebar info -->
      <div style="display: flex; flex-direction: column; gap: 14px; position: sticky; top: calc(var(--topnav-h) + 24px);">

        <!-- Form data nếu có -->
        <div v-if="formDataParsed && formDataParsed.length" class="card">
          <h3 class="sidebar-section-title">
            <span class="material-symbols-outlined symbol-sm">description</span>
            User cung cấp
          </h3>
          <div v-for="(f, i) in formDataParsed" :key="i" style="margin-bottom: 10px;">
            <div class="muted text-xs" style="margin-bottom: 2px; font-weight: 600;">{{ f.label }}</div>
            <div style="font-size: 13px; word-break: break-word; color: var(--on-surface);">{{ f.value || '—' }}</div>
          </div>
        </div>

        <!-- Priority quick -->
        <div class="card">
          <h3 class="sidebar-section-title">
            <span class="material-symbols-outlined symbol-sm">priority_high</span>
            Priority
          </h3>
          <div class="flex gap-2">
            <button v-for="p in ['normal','high','urgent']" :key="p"
              :class="['chip', { active: ticket.priority === p }]"
              style="flex: 1; justify-content: center; font-size: 11px; padding: 6px 8px;"
              :disabled="isClosed || !canSetPriority"
              @click="canSetPriority && !isClosed && setPriority(p)">
              {{ p.toUpperCase() }}
            </button>
          </div>
        </div>

        <!-- Workflow + AI -->
        <div class="card">
          <h3 class="sidebar-section-title">
            <span class="material-symbols-outlined symbol-sm">account_tree</span>
            Workflow & AI
          </h3>
          <div v-if="canManageWorkflow" class="flex gap-2" style="flex-wrap: wrap;">
            <button
              v-for="state in [
                { value: 'waiting_staff', label: 'Chờ Staff' },
                { value: 'waiting_user', label: 'Chờ Member' },
                { value: 'ai_assisting', label: 'AI hỗ trợ' },
                { value: 'resolved', label: 'Đã xử lý' },
              ]"
              :key="state.value"
              :class="['chip', { active: ticket.workflowStatus === state.value }]"
              style="font-size: 11px; padding: 6px 8px;"
              :disabled="isClosed"
              @click="!isClosed && setWorkflowStatus(state.value)">
              {{ state.label }}
            </button>
          </div>
          <StButton v-if="canManageWorkflow" variant="ghost" size="sm" style="margin-top: 10px; width: 100%;" :disabled="isClosed" @click="toggleTicketAi">
            <span class="material-symbols-outlined symbol-sm">smart_toy</span>
            {{ ticket.aiPaused ? 'Bật lại AI trong ticket' : 'Tạm dừng AI trong ticket' }}
          </StButton>
          <div v-if="ticket.aiSummary" class="muted text-xs" style="margin-top: 10px; white-space: pre-wrap; line-height: 1.45;">
            <strong>Tóm tắt AI:</strong> {{ ticket.aiSummary }}
          </div>
          <div v-if="ticket.aiLastTriageAt" class="ai-triage-box">
            <div class="flex gap-2" style="justify-content:space-between;align-items:center;">
              <strong>AI Triage</strong>
              <span :class="['chip', { active: ticket.aiNeedsHuman }]">{{ ticket.aiNeedsHuman ? 'Cần Staff' : 'AI có thể hỗ trợ' }}</span>
            </div>
            <div class="muted text-xs" style="margin-top:7px;line-height:1.55;">
              Triage {{ Math.round((ticket.aiTriageConfidence || 0) * 100) }}% · Evidence {{ Math.round((ticket.aiEvidenceScore || 0) * 100) }}%
              <template v-if="aiTriage.priority"> · Gợi ý {{ String(aiTriage.priority).toUpperCase() }}</template>
            </div>
            <div v-if="aiMissingInfo.length" class="muted text-xs" style="margin-top:7px;line-height:1.5;">
              <strong>Còn thiếu:</strong> {{ aiMissingInfo.join(' • ') }}
            </div>
            <div v-if="aiTriage.escalationReason" class="muted text-xs" style="margin-top:7px;line-height:1.5;">{{ aiTriage.escalationReason }}</div>
          </div>
        </div>

        <!-- Tags -->
        <div class="card">
          <h3 class="sidebar-section-title">
            <span class="material-symbols-outlined symbol-sm">sell</span>
            Tags
          </h3>
          <template v-if="canEditTags">
            <input v-model="tagsDraft" placeholder="urgent, refund, bug..." style="width: 100%; font-size: 12px;" :disabled="isClosed" />
            <div class="muted text-xs mt-2">Phân cách bằng dấu phẩy</div>
            <StButton variant="ghost" size="sm" style="margin-top: 8px; width: 100%;" :disabled="isClosed" @click="saveTags">
              <span class="material-symbols-outlined symbol-sm">save</span> Lưu
            </StButton>
          </template>
          <div v-else class="flex gap-2" style="flex-wrap: wrap;">
            <span v-for="tag in tagsList" :key="tag" class="chip">{{ tag }}</span>
            <span v-if="!tagsList.length" class="muted text-xs">Chưa có tag</span>
          </div>
        </div>

        <!-- Internal note -->
        <div v-if="canViewInternal" class="card">
          <h3 class="sidebar-section-title">
            <span class="material-symbols-outlined symbol-sm">edit_note</span>
            Ghi chú nội bộ
            <span class="muted text-xs" style="font-weight: 400; margin-left: auto;">staff only</span>
          </h3>
          <textarea v-model="noteDraft" style="width: 100%; min-height: 80px; font-size: 13px;" placeholder="Chỉ staff thấy..." :readonly="!canEditNote"></textarea>
          <StButton v-if="canEditNote" variant="ghost" size="sm" style="margin-top: 8px; width: 100%;" @click="saveNote">
            <span class="material-symbols-outlined symbol-sm">save</span> Lưu ghi chú
          </StButton>
        </div>

        <!-- Details -->
        <div class="card">
          <h3 class="sidebar-section-title">
            <span class="material-symbols-outlined symbol-sm">info</span>
            Chi tiết
          </h3>
          <div style="font-size: 12px; line-height: 2;">
            <div class="detail-row">
              <span class="muted">Channel</span>
              <code style="font-size: 10px;">{{ ticket.channelId || '—' }}</code>
            </div>
            <div class="detail-row">
              <span class="muted">Người tạo</span>
              <span>{{ ticket.creatorName }}</span>
            </div>
            <div class="detail-row">
              <span class="muted">Staff</span>
              <span>{{ ticket.claimerName || '—' }}</span>
            </div>
            <div class="detail-row">
              <span class="muted">Messages</span>
              <span>{{ ticket.messageCount || messages.length }}</span>
            </div>
            <div v-if="ticket.firstResponseAt" class="detail-row">
              <span class="muted">First response</span>
              <span class="text-xs">{{ fmtDate(ticket.firstResponseAt) }}</span>
            </div>
            <div v-if="ticket.claimedAt" class="detail-row">
              <span class="muted">Claimed</span>
              <span class="text-xs">{{ fmtDate(ticket.claimedAt) }}</span>
            </div>
            <div v-if="ticket.closedAt" class="detail-row">
              <span class="muted">Đóng lúc</span>
              <span class="text-xs">{{ fmtDate(ticket.closedAt) }}</span>
            </div>
            <div class="detail-row">
              <span class="muted">Tổng thời gian</span>
              <span :style="{ color: slaColor, fontWeight: 600 }">{{ timeSince(ticket.openedAt) }}</span>
            </div>
          </div>
        </div>

        <!-- Watchers + Similar combined -->
        <div v-if="watchersList.length || similarTickets.length" class="card">
          <div v-if="watchersList.length">
            <h3 class="sidebar-section-title">
              <span class="material-symbols-outlined symbol-sm">visibility</span>
              Watchers ({{ watchersList.length }})
            </h3>
            <div class="flex" style="flex-wrap: wrap; gap: 4px; margin-bottom: 14px;">
              <span v-for="w in watchersList" :key="w" class="chip" style="font-size: 10px; padding: 3px 8px;">
                <@{{ w }}>
              </span>
            </div>
          </div>

          <div v-if="similarTickets.length">
            <h3 class="sidebar-section-title">
              <span class="material-symbols-outlined symbol-sm">link</span>
              Tương tự
            </h3>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <RouterLink v-for="s in similarTickets.slice(0, 5)" :key="s.id" :to="`/tickets/${s.id}`"
                style="padding: 6px 10px; border-radius: var(--r-sm); font-size: 12px; transition: background 150ms;"
                class="interactive-row"
              >
                <strong style="color: var(--primary);">#{{ String(s.ticketNum).padStart(4, '0') }}</strong>
                <span class="muted" style="margin-left: 4px;">{{ s.creatorName }}</span>
                <div v-if="s.tags" class="muted text-xs">{{ s.tags }}</div>
              </RouterLink>
            </div>
          </div>
        </div>


        <!-- Ticket routing / move history -->
        <div v-if="ticket.moveCount || moveHistory.length" class="card">
          <h3 class="sidebar-section-title">
            <span class="material-symbols-outlined symbol-sm">drive_file_move</span>
            Routing history ({{ ticket.moveCount || moveHistory.length }})
          </h3>
          <div v-if="!moveHistory.length" class="muted text-xs">Ticket đã từng được chuyển mục nhưng chưa tải được chi tiết.</div>
          <div v-else style="display:flex;flex-direction:column;gap:8px;">
            <div v-for="move in moveHistory.slice(0, 10)" :key="move.id" style="padding:8px 0;border-bottom:1px solid var(--outline-variant);font-size:12px;">
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                <strong>{{ move.fromOptionName || 'Không rõ' }}</strong>
                <span class="material-symbols-outlined" style="font-size:14px;color:var(--outline);">arrow_forward</span>
                <strong style="color:var(--primary);">{{ move.toOptionName }}</strong>
              </div>
              <div class="muted text-xs" style="margin-top:3px;">{{ move.movedByName }} · {{ fmtTime(move.createdAt) }}</div>
            </div>
          </div>
        </div>

        <!-- Activity timeline -->
        <div v-if="canViewAudit" class="card">
          <h3 class="sidebar-section-title">
            <span class="material-symbols-outlined symbol-sm">history</span>
            Activity ({{ auditEntries.length }})
          </h3>
          <div v-if="!auditEntries.length" class="muted text-xs">Không có hoạt động</div>
          <div v-else style="position: relative;">
            <div style="position: absolute; left: 9px; top: 4px; bottom: 4px; width: 2px; background: var(--outline-variant);"></div>
            <div v-for="e in auditEntries.slice(0, 15)" :key="e.id" style="display: flex; gap: 12px; padding: 6px 0; position: relative;">
              <div :style="{
                width: '20px', height: '20px', borderRadius: '50%',
                background: 'var(--surface-container)',
                border: '2px solid ' + actionMeta(e.action).color,
                display: 'grid', placeItems: 'center', flexShrink: 0, zIndex: 1,
              }">
                <span class="material-symbols-outlined" :style="{ fontSize: '11px', color: actionMeta(e.action).color }">{{ actionMeta(e.action).icon }}</span>
              </div>
              <div class="flex-1" style="min-width: 0; font-size: 12px;">
                <div><strong>{{ e.actorName }}</strong> · {{ actionMeta(e.action).label }}</div>
                <div class="muted text-xs">{{ fmtTime(e.createdAt) }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.sidebar-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--on-surface-variant);
}
.sidebar-section-title .material-symbols-outlined { color: var(--primary); }

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.detail-row > span:last-child { text-align: right; color: var(--on-surface); }

@keyframes flash-row {
  0%   { background: var(--brand-glow); }
  100% { background: transparent; }
}
:deep(.msg.flash) { animation: flash-row 1.5s ease-out; }

code {
  background: var(--surface-container);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: ui-monospace, monospace;
  color: var(--primary);
}

.chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.message-media,
.message-embeds {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.media-file {
  display: inline-grid;
  max-width: min(420px, 100%);
  gap: 6px;
  align-items: start;
  color: var(--primary);
  font-size: 12px;
}

.media-file.image {
  overflow: hidden;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background: var(--surface-container);
}

.media-file img {
  display: block;
  width: 100%;
  max-height: 320px;
  object-fit: contain;
  background: var(--surface-container-high);
}

.media-file.image strong {
  padding: 0 10px 8px;
  overflow: hidden;
  color: var(--on-surface-variant);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.embed-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  max-width: 520px;
  padding: 12px;
  border-left: 4px solid var(--primary);
  border-radius: 10px;
  background: var(--surface-container);
  border-top: 1px solid var(--outline-variant);
  border-right: 1px solid var(--outline-variant);
  border-bottom: 1px solid var(--outline-variant);
}

.embed-body {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.embed-body strong {
  color: var(--on-surface);
}

.embed-body p,
.embed-body small {
  margin: 0;
  color: var(--on-surface-variant);
  white-space: pre-wrap;
}

.embed-thumb {
  grid-column: 2;
  grid-row: 1;
  width: 72px;
  height: 72px;
  border-radius: 8px;
  object-fit: cover;
}

.embed-image {
  width: 100%;
  max-height: 280px;
  border-radius: 8px;
  object-fit: contain;
  background: var(--surface-container-high);
}

.close-eyebrow {
  margin: 0 0 4px;
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.close-type-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.close-type-grid button {
  display: grid;
  gap: 4px;
  padding: 13px;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background: var(--surface-container-low);
  color: var(--on-surface);
  text-align: left;
}

.close-type-grid button.active {
  border-color: var(--primary);
  background: color-mix(in srgb, var(--primary), transparent 88%);
  box-shadow: 0 0 0 3px var(--brand-glow);
}

.close-type-grid span,
.silent-note {
  color: var(--on-surface-variant);
  font-size: 12px;
}

.silent-note {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--outline-variant);
  border-radius: 12px;
  background: var(--surface-container);
}

.interactive-row:hover { background: var(--surface-variant); }
.search-highlight { background: var(--primary); color: var(--on-primary); padding: 0 2px; border-radius: 3px; }
.msg-internal { border: 1px dashed var(--warning-2); background: color-mix(in srgb, var(--warning-2), transparent 92%); }
.internal-composer { display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px; border-top: 1px dashed var(--warning-2); background: color-mix(in srgb, var(--warning-2), transparent 94%); }
.internal-composer textarea { flex: 1; min-height: 44px; max-height: 150px; resize: vertical; }

@media (max-width: 640px) {
  .close-type-grid {
    grid-template-columns: 1fr;
  }
}

.ai-triage-box { margin-top:10px; padding:10px; border:1px solid var(--outline-variant); border-radius:12px; background:var(--surface-container-high); }
</style>
