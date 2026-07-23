const API_BASE = 'https://hololive-dreams.maple-live12201484.workers.dev';

const state = {
  rooms: [],
  currentCategory: 'すべて',
  pendingAction: null,
  pendingJoinRoomId: null,
  currentRoomId: null,
  currentNickname: '',
};

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function minutesAgoText(minutes) {
  return minutes === 1 ? '1分前' : `${minutes}分前`;
}

function formatCapacity(capacity) {
  return capacity ? `👥 ${capacity}人` : '';
}

function getRoomDetails(room) {
  const details = [];
  if (room.song) details.push(`🎵 ${room.song}`);
  if (room.capacity) details.push(formatCapacity(room.capacity));
  if (room.difficulty) details.push(`⭐ ${room.difficulty}`);
  return details.join(' / ');
}

function generateRoomId() {
  let id = '';
  do {
    id = `ROOM${Math.floor(1000 + Math.random() * 9000)}`;
  } while (state.rooms.some((room) => room.id === id));
  return id;
}

function generateParticipationCode() {
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

function getGameLabel(gameType) {
  const labels = {
    holodori: '🎵 リズムゲーム',
    megacircuit: '🏎️ メガサーキット',
    pokajan: '♣ ポカジャン!',
    hoppin: '🪢 ホッピン·ロープ',
    cookie: '🍳 そろえてクッキング',
    other: 'その他のゲーム',
  };
  return labels[gameType] || '🎮 ゲーム';
}

// updateStats()関数内で、実際のデータに基づく統計を計算
function updateStats() {
  const userCount = state.rooms.reduce((sum, room) => sum + room.members.length, 0);
  const roomCount = state.rooms.length;
  const accessKey = 'hololive-dreams-access-count';
  
  // 初回アクセス時にカウント開始（3401からでなく1から）
  if (!localStorage.getItem(accessKey)) {
    localStorage.setItem(accessKey, '1');
  }
  const accessCount = Number(localStorage.getItem(accessKey) || '1');
  
  // ページ読み込み時にアクセス数を+1
  localStorage.setItem(accessKey, String(accessCount + 1));

  const statUsers = $('#stat-users');
  const statRooms = $('#stat-rooms');
  const statAccess = $('#stat-access');

  if (statUsers) statUsers.textContent = String(userCount);
  if (statRooms) statRooms.textContent = String(roomCount);
  if (statAccess) statAccess.textContent = String(Number(localStorage.getItem(accessKey)));
}

function renderLatestRooms() {
  const container = $('#latest-list');
  if (!container) return;

  const latestRooms = [...state.rooms]
    .sort((a, b) => a.time - b.time)
    .slice(0, 5);

  container.innerHTML = latestRooms.map((room) => `
    <div class="latest-item" onclick="openJoinModal('${room.id}')">
      <strong>${escapeHtml(room.id)}</strong><br><span style="opacity: 0.7;">${escapeHtml(minutesAgoText(room.time))}</span>
    </div>
  `).join('');
}

function renderRooms() {
  const grid = $('#rooms-grid');
  const title = $('#rooms-title');
  if (!grid || !title) return;

  const filtered = state.currentCategory === 'すべて'
    ? state.rooms
    : state.rooms.filter((room) => room.category === state.currentCategory);

  title.textContent = `募集中の部屋 (${filtered.length})`;

  const roomCards = filtered.map((room) => {
    const tags = [];
    if (room.song) tags.push(`<span class="room-tag music">🎵 ${escapeHtml(room.song)}</span>`);
    if (room.capacity) tags.push(`<span class="room-tag capacity">${escapeHtml(formatCapacity(room.capacity))}</span>`);
    if (room.members) tags.push(`<span class="room-tag members">👥 ${escapeHtml(room.members.length)}/${escapeHtml(room.capacity)}人</span>`);
    if (room.difficulty) tags.push(`<span class="room-tag difficulty">⭐ ${escapeHtml(room.difficulty)}</span>`);
    tags.push(`<span class="room-tag time">⏰ ${escapeHtml(minutesAgoText(room.time))}</span>`);

    const info = getRoomDetails(room);

    return `
      <div class="room-card" onclick="openJoinModal('${room.id}')">
        <div class="room-card-body">
          <div>
            <div class="room-header">
              <span class="room-id">${escapeHtml(room.id)}</span>
              <button type="button" class="copy-btn" onclick="event.stopPropagation(); copyToClipboard('${room.id}')" title="IDをコピー">📋</button>
            </div>
            <div class="room-game">${escapeHtml(room.game)}</div>
            <div class="room-title">${escapeHtml(room.category)}</div>
            ${room.comment ? `<p class="room-comment"><strong>コメント:</strong> ${escapeHtml(room.comment)}</p>` : ''}
            ${room.members && room.members.length > 0 ? `
            <div class="room-members-info">
              <div class="members-title">入室中のメンバー</div>
              ${room.members.map(member => `
                <div class="member-preview">
                  <span class="member-name">${escapeHtml(member.name)}</span>
                  <span class="member-level">⭐ ${escapeHtml(member.level)}</span>
                  <span class="member-stay">滞在: ${escapeHtml(member.stay)}分</span>
                </div>
              `).join('')}
            </div>
            ` : '<div class="room-members-info"><div class="members-title">入室中のメンバーはいません</div></div>'}
            <div class="room-tags">
              ${tags.join('')}
            </div>
          </div>
          <div class="room-meta">
            <span>活動中</span>
            <span>${escapeHtml(info)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const createButton = `
    <div class="create-room-card" onclick="showCreateModal()">
      <div class="create-room-icon">➕</div>
      <div class="create-room-text">部屋を作成</div>
      <div class="create-room-subtext">新しい募集を始める</div>
    </div>
  `;

  grid.innerHTML = `${roomCards}${createButton}`;
}

function renderMemberList(room) {
  const container = $('#member-list');
  if (!container) return;

  const members = room?.members || [];
  if (members.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>参加メンバーがいません</h3></div>';
    return;
  }

  container.innerHTML = members.map((member) => `
    <div class="member-item">
      <div class="member-avatar">${escapeHtml(member.name?.[0] || '？')}</div>
      <div class="member-info">
        <div class="member-name">${escapeHtml(member.name)}</div>
        <div class="member-level">${escapeHtml(member.level)} <span class="member-stay">滞在時間: ${escapeHtml(member.stay)}分</span></div>
      </div>
    </div>
  `).join('');
}

function syncLanguageButtons() {
  const savedLanguage = localStorage.getItem('selectedLanguage') || 'JP';
  $all('.lang-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.textContent === savedLanguage);
  });
}

function syncDarkMode() {
  if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark-mode');
  } else {
    document.body.classList.remove('dark-mode');
  }
}

function renderAll() {
  updateStats();
  renderLatestRooms();
  renderRooms();
  syncLanguageButtons();
  syncDarkMode();
}

function showConsentModal() {
  $('#consent-modal')?.classList.add('active');
}

function acceptConsent() {
  localStorage.setItem('consentAccepted', 'true');
  $('#consent-modal')?.classList.remove('active');
}

function rejectConsent() {
  alert('利用規約に同意していただけないため、サイトを利用できません。');
  window.location.href = 'https://www.google.com';
}

function showConfirmation(title, text, callback) {
  const titleEl = $('#confirmation-title');
  const textEl = $('#confirmation-text');
  const modal = $('#confirmation-modal');

  if (titleEl) titleEl.textContent = title;
  if (textEl) textEl.textContent = text;
  state.pendingAction = callback;
  modal?.classList.add('active');
}

function confirmAction() {
  if (state.pendingAction) {
    state.pendingAction();
    state.pendingAction = null;
  }
  $('#confirmation-modal')?.classList.remove('active');
}

function cancelConfirmation() {
  state.pendingAction = null;
  $('#confirmation-modal')?.classList.remove('active');
}

function showCreateModal() {
  $('#create-modal')?.classList.add('active');
  updateGameFields();
}

function openJoinModal(roomId) {
  const room = state.rooms.find((item) => item.id === roomId);
  if (!room) return;

  state.pendingJoinRoomId = roomId;

  const gameEl = $('#join-game');
  const idEl = $('#join-room-id');
  const commentEl = $('#join-comment');
  const detailEl = $('#join-song');

  if (gameEl) gameEl.textContent = room.game;
  if (idEl) idEl.textContent = room.id;
  if (commentEl) {
  const textEl = commentEl.querySelector('#join-comment-text') || commentEl;
  textEl.textContent = room.comment || '特記なし';
}
  if (detailEl) detailEl.textContent = getRoomDetails(room) || '特記なし';

  const difficulty = $('#difficulty-select');
  if (difficulty) difficulty.value = room.difficulty || '';

  const joinName = $('#join-player-name');
  if (joinName) joinName.value = '';

  const joinDuration = $('#join-duration');
  if (joinDuration) joinDuration.value = '';

  $('#join-modal')?.classList.add('active');
}

function openChatModal(roomId, nickname) {
  const room = state.rooms.find((item) => item.id === roomId);
  if (!room) return;

  state.currentRoomId = roomId;
  state.currentNickname = nickname || state.currentNickname || '';

  const titleEl = $('#chat-room-title');
  const codeEl = $('#participation-code');

  if (titleEl) titleEl.textContent = `部屋: ${room.id}`;
  if (codeEl) {
    if (!room.participationCode) {
      room.participationCode = generateParticipationCode();
    }
    codeEl.value = room.participationCode;
  }

  renderMemberList(room);

  const chatContainer = $('.chat-container');
  if (chatContainer) {
    chatContainer.style.display = 'none';
  }

  $('#chat-modal')?.classList.add('active');
}

function createRoomFromForm(form) {
  const gameType = $('#game-select', form)?.value || '';
  const roomName = $('#room-name', form)?.value.trim() || '';
  const song = $('#room-song', form)?.value.trim() || '';
  const password = $('#holodori-password', form)?.value.trim() || '';
  const category = $('#category-select', form)?.value || 'その他';
  const level = $('#room-level', form)?.value || '中級者';
  const duration = Number($('#room-duration', form)?.value || '120');
  const comment = $('#room-comment', form)?.value.trim() || '';
  const playerName = $('#user-name', form)?.value.trim() || '名無しさん';
  const capacity = Number($('#capacity-display', form)?.value || '1');
  const roomId = generateRoomId();

  return {
    id: roomId,
    game: getGameLabel(gameType),
    gameType,
    category: password ? '鍵付き部屋' : category,
    roomName,
    comment,
    song: gameType === 'holodori' ? song : '',
    capacity,
    difficulty: level,
    time: 0,
    members: [{ name: playerName, level, stay: duration }],
    participationCode: generateParticipationCode(),
    password: password || null,
  };
}
async function handleCreateRoom(event) {
  event.preventDefault();

  const form = event.currentTarget;

  const holoPassword = $('#holodori-password', form)?.value.trim();
  if (!holoPassword) {
    alert('ホロドリのパスワードは必須です');
    return;
  }

  const room = createRoomFromForm(form);

  try {
    const response = await fetch(`${API_BASE}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(room)
    });

    if (!response.ok) {
      throw new Error('部屋の作成に失敗しました');
    }

    const data = await response.json();
    const createdRoom = data.room || room;

    state.currentRoomId = createdRoom.id;
    state.currentNickname =
      createdRoom.members?.[0]?.name ||
      room.members?.[0]?.name ||
      '';

    $('#create-modal')?.classList.remove('active');
    form.reset();
    updateGameFields();

    await loadRooms();

    openChatModal(
      state.currentRoomId,
      state.currentNickname
    );
  } catch (error) {
    console.error('部屋作成エラー:', error);
    alert('部屋を作成できませんでした');
  }
}
async function handleJoinRoom(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const room = state.rooms.find((item) => item.id === state.pendingJoinRoomId);
  if (!room) return;

  // 鍵付き部屋の場合、パスワード必須チェック
  if (room.category === '鍵付き部屋') {
    const password = $('#join-password', form)?.value.trim();
    const roomPassword = room.password;
    
    if (!password) {
      alert('このルームはパスワードが必要です');
      return;
    }

const response = await fetch(`${API_BASE}/api/rooms/${room.id}/verify-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password })
});

const result = await response.json();
if (!result.valid) {
  alert('パスワードが間違っています');
  return;
}
  }

  const nickname = $('#join-player-name', form)?.value.trim() || '名無しさん';
  const level = $('#difficulty-select', form)?.value || room.difficulty || '中級者';
  const duration = Number($('#join-duration', form)?.value || '5');
  try {
    const response = await fetch(`${API_BASE}/api/rooms/${room.id}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: nickname,
        level,
        stay: duration
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || '部屋への参加に失敗しました');
    }

    state.currentRoomId = room.id;
    state.currentNickname = nickname;
    state.pendingJoinRoomId = null;

    $('#join-modal')?.classList.remove('active');
    form.reset();

    await loadRooms();

    openChatModal(room.id, nickname);
  } catch (error) {
    console.error('部屋参加エラー:', error);
    alert(error.message || '部屋に参加できませんでした');
  }
}

async function removeCurrentUserFromRoom() {
  if (!state.currentRoomId) return;

  const roomId = state.currentRoomId;
  const nickname = state.currentNickname;

  try {
    const response = await fetch(`${API_BASE}/api/rooms/${roomId}/leave`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: nickname
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || '部屋からの退出に失敗しました');
    }

    state.currentRoomId = null;
    state.currentNickname = '';
    state.pendingJoinRoomId = null;

    await loadRooms();
  } catch (error) {
    console.error('部屋退出エラー:', error);
    alert(error.message || '部屋から退出できませんでした');
  }
}

function closeModal(id) {
  if (id === 'chat-modal') {
    showConfirmation('部屋から退出', '本当に部屋から退出しますか？', () => {
      $('#chat-modal')?.classList.remove('active');
      removeCurrentUserFromRoom();
    });
    return;
  }

  if (id === 'create-modal') {
    showConfirmation('部屋作成をキャンセル', '入力内容が失われます。本当にキャンセルしますか？', () => {
      const modal = $('#create-modal');
      modal?.classList.remove('active');
      modal?.querySelector('form')?.reset();
      updateGameFields();
    });
    return;
  }

  if (id === 'join-modal') {
    $('#join-modal')?.classList.remove('active');
    state.pendingJoinRoomId = null;
    return;
  }

  document.getElementById(id)?.classList.remove('active');
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  const btn = event?.target;
  if (!btn) return;

  const originalText = btn.textContent;
  btn.textContent = '✓ コピー完了';
  btn.style.backgroundColor = 'var(--blue-100)';
  btn.style.color = 'white';

  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.backgroundColor = '';
    btn.style.color = '';
  }, 2000);
}

function copyRoomURL() {
  const roomId = state.currentRoomId || 'ROOM1234';
  const url = `${window.location.href.split('?')[0]}?room=${roomId}`;
  navigator.clipboard.writeText(url);
}

function copyParticipationCode() {
  const code = $('#participation-code')?.value || '';
  if (!code) return;
  navigator.clipboard.writeText(code);
}

function increaseCapacity(e) {
  e.preventDefault();
  const input = $('#capacity-display');
  if (!input) return;
  const value = parseInt(input.value, 10);
  if (value < 5) input.value = String(value + 1);
}

function decreaseCapacity(e) {
  e.preventDefault();
  const input = $('#capacity-display');
  if (!input) return;
  const value = parseInt(input.value, 10);
  if (value > 2) input.value = String(value - 1);  // 1 → 2 に変更
}

function updateGameFields() {
  const gameSelect = $('#game-select');
  const songGroup = $('#song-group');
  const roomNameGroup = $('#room-name-group');
  if (!gameSelect || !songGroup || !roomNameGroup) return;

  if (gameSelect.value === 'holodori') {
    songGroup.style.display = 'block';
    roomNameGroup.style.display = 'none';
  } else if (gameSelect.value === 'other') {
    songGroup.style.display = 'none';
    roomNameGroup.style.display = 'block';
  } else {
    songGroup.style.display = 'none';
    roomNameGroup.style.display = 'none';
  }
}

function filterCategory(btn, category) {
  $all('.chip').forEach((chip) => chip.classList.remove('active'));
  btn.classList.add('active');
  state.currentCategory = category;
  renderRooms();
}

function scrollToAbout() {
  $('#about')?.scrollIntoView({ behavior: 'smooth' });
}

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', String(document.body.classList.contains('dark-mode')));
}

function setLanguage(lang, btn) {
  $all('.lang-btn').forEach((button) => button.classList.remove('active'));
  btn.classList.add('active');
  localStorage.setItem('selectedLanguage', lang);
}

function handleEscKey(event) {
  if (event.key !== 'Escape') return;
  if ($('#consent-modal')?.classList.contains('active')) return;

  const activeModals = $all('.modal-overlay.active');
  if (activeModals.length === 0) return;

  const topModal = activeModals[activeModals.length - 1];
  if (topModal.id === 'confirmation-modal') {
    cancelConfirmation();
    return;
  }

  closeModal(topModal.id);
}

function handleOverlayClick(event) {
  const overlay = event.currentTarget;
  if (event.target !== overlay) return;

  if (overlay.id === 'chat-modal') {
    closeModal('chat-modal');
  } else if (overlay.id === 'create-modal') {
    closeModal('create-modal');
  } else if (overlay.id === 'join-modal') {
    closeModal('join-modal');
  } else if (overlay.id !== 'consent-modal' && overlay.id !== 'confirmation-modal') {
    overlay.classList.remove('active');
  }
}


async function loadRooms() {
  const response = await fetch(`${API_BASE}/api/rooms`);

  if (!response.ok) {
    throw new Error('部屋一覧の取得に失敗しました');
  }

  const data = await response.json();

  state.rooms = data.rooms || [];

  renderAll();
}



let syncIntervalId = null;

function startAutoSync() {
  // 30秒ごとにリアルタイム同期
  if (syncIntervalId) clearInterval(syncIntervalId);
  
  syncIntervalId = setInterval(async () => {
    try {
      await loadRooms();
      // 現在チャットを開いている場合、参加メンバーも更新
      if (state.currentRoomId) {
        const room = state.rooms.find(r => r.id === state.currentRoomId);
        if (room) {
          renderMemberList(room);
        }
      }
    } catch (error) {
      console.error('同期エラー:', error);
    }
  }, 10000); // 30秒間隔
}
document.addEventListener('DOMContentLoaded', async () => {
  // 利用規約に同意しているか確認
  const consentAccepted = localStorage.getItem('consentAccepted') === 'true';
  if (!consentAccepted) {
    showConsentModal();
  }

  try {
    await loadRooms();
    startAutoSync();
  } catch (error) {
    console.error('初期読み込みエラー:', error);
  }
});