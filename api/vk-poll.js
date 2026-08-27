// /api/vk-poll.js — Vercel-функция, которая раз в 1-2 минуты забирает новые
// сообщения из беседы ВК и кладёт черновики отчётов в Supabase на проверку.

const { createClient } = require('@supabase/supabase-js');
const { parseVkReport } = require('../vk-report-parser');

const VK_API_VERSION = '5.199';
const RESTAURANT_ID = 'siosan';

async function vkApi(method, params) {
  const url = new URL(`https://api.vk.com/method/${method}`);
  url.searchParams.set('access_token', process.env.VK_USER_TOKEN);
  url.searchParams.set('v', VK_API_VERSION);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString());
  const json = await res.json();
  if (json.error) throw new Error(`VK API ${method}: ${json.error.error_msg} (code ${json.error.error_code})`);
  return json.response;
}

module.exports = async function handler(req, res) {
  if (req.query.secret !== process.env.VK_POLL_SECRET) {
    res.status(401).json({ error: 'bad secret' });
    return;
  }

  const peerId = Number(process.env.VK_PEER_ID);
  if (!peerId) { res.status(500).json({ error: 'VK_PEER_ID not set' }); return; }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: stateRows } = await supabase
      .from('vk_poll_state').select('last_message_id').eq('vk_peer_id', peerId).limit(1);
    const lastMessageId = stateRows?.[0]?.last_message_id || 0;

    const history = await vkApi('messages.getHistory', { peer_id: peerId, count: 40 });
    const newMessages = (history.items || [])
      .filter((m) => m.id > lastMessageId && m.text && m.text.trim())
      .sort((a, b) => a.id - b.id);

    if (newMessages.length === 0) {
      res.status(200).json({ ok: true, newDrafts: 0 });
      return;
    }

    const senderIds = [...new Set(newMessages.map((m) => m.from_id).filter((id) => id > 0))];
    let namesById = {};
    if (senderIds.length) {
      const users = await vkApi('users.get', { user_ids: senderIds.join(',') });
      namesById = Object.fromEntries((users || []).map((u) => [u.id, `${u.first_name} ${u.last_name}`]));
    }

    const { data: restRows } = await supabase
      .from('restaurant_data').select('data').eq('restaurant_id', RESTAURANT_ID).limit(1);
    const appData = restRows?.[0]?.data || {};
    const settings = appData.settings || {};
    const employees = appData.employees || [];

    const drafts = newMessages.map((m) => {
      const msgDate = new Date(m.date * 1000).toISOString().slice(0, 10);
      const parsed = parseVkReport(m.text, {
        revenueChannels: settings.revenueChannels || [],
        employees,
        expenseCategories: settings.expenseCategories || [],
        fallbackDate: msgDate,
      });
      return {
        restaurant_id: RESTAURANT_ID,
        vk_peer_id: peerId,
        vk_message_id: m.id,
        sender_name: namesById[m.from_id] || null,
        message_date: msgDate,
        raw_text: m.text,
        parsed,
        status: 'pending',
      };
    });

    const { error: insErr } = await supabase
      .from('vk_report_drafts')
      .upsert(drafts, { onConflict: 'vk_peer_id,vk_message_id', ignoreDuplicates: true });
    if (insErr) throw insErr;

    const maxId = Math.max(...newMessages.map((m) => m.id));
    await supabase.from('vk_poll_state').upsert({ vk_peer_id: peerId, last_message_id: maxId, updated_at: new Date().toISOString() });

    res.status(200).json({ ok: true, newDrafts: drafts.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
