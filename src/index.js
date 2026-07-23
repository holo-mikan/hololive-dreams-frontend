var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};
var GAME_LABELS = {
  holodori: "\u{1F3B5} \u30EA\u30BA\u30E0\u30B2\u30FC\u30E0",
  megacircuit: "\u{1F3CE}\uFE0F \u30E1\u30AC\u30B5\u30FC\u30AD\u30C3\u30C8",
  pokajan: "\u2663 \u30DD\u30AB\u30B8\u30E3\u30F3!",
  hoppin: "\u{1FAA2} \u30DB\u30C3\u30D4\u30F3\xB7\u30ED\u30FC\u30D7",
  cookie: "\u{1F373} \u305D\u308D\u3048\u3066\u30AF\u30C3\u30AD\u30F3\u30B0",
  other: "\u305D\u306E\u4ED6\u306E\u30B2\u30FC\u30E0"
};
var DEFAULT_ROOMS = [];
var initPromise = null;
function corsJson(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}
__name(corsJson, "corsJson");
function corsEmpty(status = 204, extraHeaders = {}) {
  return new Response(null, {
    status,
    headers: {
      ...CORS_HEADERS,
      ...extraHeaders
    }
  });
}
__name(corsEmpty, "corsEmpty");
function cleanText(value, maxLength = 120, fallback = "") {
  if (value === void 0 || value === null) return fallback;
  const text = String(value).replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!text) return fallback;
  return text.slice(0, maxLength);
}
__name(cleanText, "cleanText");
function asInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
__name(asInt, "asInt");
function randomDigits(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += String(byte % 10);
  return out;
}
__name(randomDigits, "randomDigits");
function gameLabel(gameType) {
  return GAME_LABELS[gameType] || "\u{1F3AE} \u30B2\u30FC\u30E0";
}
__name(gameLabel, "gameLabel");
function nowMs() {
  return Date.now();
}
__name(nowMs, "nowMs");
function minutesSince(timestamp, referenceMs = nowMs()) {
  return Math.max(0, Math.floor((referenceMs - Number(timestamp || 0)) / 6e4));
}
__name(minutesSince, "minutesSince");
async function ensureSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      game TEXT NOT NULL,
      gameType TEXT NOT NULL,
      category TEXT NOT NULL,
      roomName TEXT NOT NULL DEFAULT '',
      comment TEXT NOT NULL DEFAULT '',
      song TEXT NOT NULL DEFAULT '',
      capacity INTEGER NOT NULL DEFAULT 1,
      difficulty TEXT NOT NULL DEFAULT '',
      participationCode TEXT NOT NULL,
      password TEXT NOT NULL DEFAULT '',
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS members (
      roomId TEXT NOT NULL,
      name TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT '',
      stay INTEGER NOT NULL DEFAULT 0,
      joinedAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      PRIMARY KEY (roomId, name)
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_members_roomId ON members(roomId)
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_rooms_updatedAt ON rooms(updatedAt)
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run();
}
__name(ensureSchema, "ensureSchema");
async function getRevision(db) {
  const row = await db.prepare("SELECT value FROM meta WHERE key = ?").bind("rooms_revision").first();
  return Number(row?.value || "1");
}
__name(getRevision, "getRevision");
async function setRevision(db, value) {
  await db.prepare(`
    INSERT INTO meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).bind("rooms_revision", String(value)).run();
  return value;
}
__name(setRevision, "setRevision");
async function bumpRevision(db) {
  const current = await getRevision(db);
  const next = current + 1;
  await setRevision(db, next);
  return next;
}
__name(bumpRevision, "bumpRevision");
function roomToDto(roomRow, memberRows, referenceMs = nowMs()) {
  const members = memberRows.filter((member) => member.roomId === roomRow.id).sort((a, b) => a.joinedAt - b.joinedAt).map((member) => ({
    name: member.name,
    level: member.level,
    stay: member.stay
  }));
  return {
    id: roomRow.id,
    game: roomRow.game,
    gameType: roomRow.gameType,
    category: roomRow.category,
    roomName: roomRow.roomName || "",
    comment: roomRow.comment || "",
    song: roomRow.song || "",
    capacity: Number(roomRow.capacity || 1),
    difficulty: roomRow.difficulty || "",
    time: minutesSince(roomRow.createdAt, referenceMs),
    members,
    participationCode: roomRow.participationCode,
    password: roomRow.password || "",
    memberCount: members.length,
    createdAt: Number(roomRow.createdAt),
    updatedAt: Number(roomRow.updatedAt)
  };
}
__name(roomToDto, "roomToDto");
async function loadRooms(db) {
  const roomsResult = await db.prepare(`
    SELECT id, game, gameType, category, roomName, comment, song, capacity, difficulty, participationCode, createdAt, updatedAt
    FROM rooms
    ORDER BY updatedAt DESC, createdAt DESC
  `).all();
  const membersResult = await db.prepare(`
    SELECT roomId, name, level, stay, joinedAt, updatedAt
    FROM members
    ORDER BY joinedAt ASC
  `).all();
  const rooms = roomsResult.results || [];
  const members = membersResult.results || [];
  const referenceMs = nowMs();
  return rooms.map((room) => roomToDto(room, members, referenceMs));
}
__name(loadRooms, "loadRooms");
async function loadRoom(db, roomId) {
  const room = await db.prepare(`
    SELECT id, game, gameType, category, roomName, comment, song, capacity, difficulty, participationCode, createdAt, updatedAt
    FROM rooms
    WHERE id = ?
    LIMIT 1
  `).bind(roomId).first();
  if (!room) return null;
  const membersResult = await db.prepare(`
    SELECT roomId, name, level, stay, joinedAt, updatedAt
    FROM members
    WHERE roomId = ?
    ORDER BY joinedAt ASC
  `).bind(roomId).all();
  return roomToDto(room, membersResult.results || []);
}
__name(loadRoom, "loadRoom");
async function isRoomIdTaken(db, id) {
  const row = await db.prepare("SELECT 1 AS found FROM rooms WHERE id = ? LIMIT 1").bind(id).first();
  return Boolean(row);
}
__name(isRoomIdTaken, "isRoomIdTaken");
async function isParticipationCodeTaken(db, code) {
  const row = await db.prepare("SELECT 1 AS found FROM rooms WHERE participationCode = ? LIMIT 1").bind(code).first();
  return Boolean(row);
}
__name(isParticipationCodeTaken, "isParticipationCodeTaken");
async function generateUniqueRoomId(db) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const id = `ROOM${randomDigits(4)}`;
    if (!await isRoomIdTaken(db, id)) return id;
  }
  return `ROOM${randomDigits(4)}`;
}
__name(generateUniqueRoomId, "generateUniqueRoomId");
async function generateUniqueParticipationCode(db) {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const code = randomDigits(8);
    if (!await isParticipationCodeTaken(db, code)) return code;
  }
  return randomDigits(8);
}
__name(generateUniqueParticipationCode, "generateUniqueParticipationCode");
async function seedIfNeeded(db) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM rooms").first();
  if (Number(row?.count || 0) > 0) return;
  const seedNow = nowMs();
  for (const seed of DEFAULT_ROOMS) {
    const createdAt = seedNow - Number(seed.ageMinutes || 0) * 6e4;
    await db.prepare(`
      INSERT INTO rooms (
        id, game, gameType, category, roomName, comment, song, capacity, difficulty,
        participationCode, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      seed.id,
      seed.game,
      seed.gameType,
      seed.category,
      seed.roomName || "",
      seed.comment || "",
      seed.song || "",
      Number(seed.capacity || 1),
      seed.difficulty || "",
      seed.participationCode,
      createdAt,
      createdAt
    ).run();
    for (const member of seed.members || []) {
      await db.prepare(`
        INSERT INTO members (
          roomId, name, level, stay, joinedAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        seed.id,
        member.name,
        member.level || "",
        Number(member.stay || 0),
        createdAt,
        createdAt
      ).run();
    }
  }
  await setRevision(db, 1);
}
__name(seedIfNeeded, "seedIfNeeded");
function normalizeRoomInput(input, db) {
  const gameType = cleanText(input.gameType, 32, "other");
  const category = cleanText(input.category, 32, "\u305D\u306E\u4ED6");
  const roomName = cleanText(input.roomName, 80, "");
  const comment = cleanText(input.comment, 240, "");
  const song = gameType === "holodori" ? cleanText(input.song, 80, "") : "";
  const difficulty = cleanText(input.difficulty ?? input.level, 16, "\u4E2D\u7D1A\u8005");
  const capacity = asInt(input.capacity, 1, 1, 5);
  const playerName = cleanText(input.playerName ?? input.name, 20, "\u540D\u7121\u3057\u3055\u3093");
  const stay = asInt(input.time ?? input.stay ?? input.duration, 5, 1, 720);
  const password = cleanText(input.password ?? input.roomPassword, 8, "");
  const sourceMembers = Array.isArray(input.members) ? input.members : [];
  const members = sourceMembers.length > 0 ? sourceMembers.map((member) => ({
    name: cleanText(member?.name, 20, "\u540D\u7121\u3057\u3055\u3093"),
    level: cleanText(member?.level, 16, difficulty),
    stay: asInt(member?.stay, stay, 1, 720)
  })).filter((member) => member.name) : [{ name: playerName, level: difficulty, stay }];
  const normalizedCategory = password ? "\u9375\u4ED8\u304D\u90E8\u5C4B" : category;
  const createdBy = cleanText(input.createdBy, 20, playerName);
  return {
    id: cleanText(input.id, 16, ""),
    game: cleanText(input.game, 40, gameLabel(gameType)),
    gameType,
    category: normalizedCategory,
    roomName,
    comment,
    song,
    capacity: Math.max(capacity, members.length || 1),
    difficulty,
    participationCode: cleanText(input.participationCode, 8, ""),
    members,
    createdBy
  };
}
__name(normalizeRoomInput, "normalizeRoomInput");
async function createRoom(db, body) {
  const input = body?.room && typeof body.room === "object" ? body.room : body;
  const normalized = normalizeRoomInput(input, db);
  const id = normalized.id && !await isRoomIdTaken(db, normalized.id) ? normalized.id : await generateUniqueRoomId(db);
  const participationCode = normalized.participationCode && !await isParticipationCodeTaken(db, normalized.participationCode) ? normalized.participationCode : await generateUniqueParticipationCode(db);
  const createdAt = nowMs();
  const roomPassword = cleanText(input.password ?? input["holodori-password"], 8, "");
  await db.prepare(`
    INSERT INTO rooms (
      id, game, gameType, category, roomName, comment, song, capacity, difficulty,
      participationCode, password, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    normalized.game || gameLabel(normalized.gameType),
    normalized.gameType,
    normalized.category,
    normalized.roomName,
    normalized.comment,
    normalized.song,
    Number(normalized.capacity || 1),
    normalized.difficulty,
    participationCode,
    roomPassword,  // ← password を追加
    createdAt,
    createdAt
  ).run();
  for (const member of normalized.members) {
    await db.prepare(`
      INSERT INTO members (
        roomId, name, level, stay, joinedAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      member.name,
      member.level,
      Number(member.stay || 0),
      createdAt,
      createdAt
    ).run();
  }
  await bumpRevision(db);
  return await loadRoom(db, id);
}
__name(createRoom, "createRoom");
async function joinRoom(db, roomId, body) {
  const roomRow = await db.prepare(`
    SELECT id, capacity, difficulty, password
    FROM rooms
    WHERE id = ?
    LIMIT 1
  `).bind(roomId).first();
  if (!roomRow) return null;

  // 鍵付き部屋のパスワード検証
  if (roomRow.password) {
    const input = body?.member && typeof body.member === "object" ? body.member : body;
    const inputPassword = cleanText(input.password, 8, "");
    if (inputPassword !== roomRow.password) {
      const error = new Error("Invalid password");
      error.status = 401;
      throw error;
    }
  }

  const input = body?.member && typeof body.member === "object" ? body.member : body;
  const name = cleanText(input.name ?? input.playerName ?? input.nickname, 20, "");
  if (!name) {
    const error = new Error("name is required");
    error.status = 400;
    throw error;
  }
  const level = cleanText(input.level ?? input.difficulty, 16, roomRow.difficulty || "\u4E2D\u7D1A\u8005");
  const stay = asInt(input.stay ?? input.duration ?? input.time, 5, 1, 720);
  const existing = await db.prepare(`
    SELECT roomId, name, level, stay, joinedAt, updatedAt
    FROM members
    WHERE roomId = ? AND name = ?
    LIMIT 1
  `).bind(roomId, name).first();
  if (existing) {
    await db.prepare(`
      UPDATE members
      SET level = ?, stay = ?, updatedAt = ?
      WHERE roomId = ? AND name = ?
    `).bind(level, stay, nowMs(), roomId, name).run();
  } else {
    const countRow = await db.prepare("SELECT COUNT(*) AS count FROM members WHERE roomId = ?").bind(roomId).first();
    const memberCount = Number(countRow?.count || 0);
    if (memberCount >= Number(roomRow.capacity || 1)) {
      const error = new Error("room is full");
      error.status = 409;
      throw error;
    }
    const timestamp = nowMs();
    await db.prepare(`
      INSERT INTO members (
        roomId, name, level, stay, joinedAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).bind(roomId, name, level, stay, timestamp, timestamp).run();
  }
  await db.prepare("UPDATE rooms SET updatedAt = ? WHERE id = ?").bind(nowMs(), roomId).run();
  await bumpRevision(db);
  return await loadRoom(db, roomId);
}
__name(joinRoom, "joinRoom");
async function leaveRoom(db, roomId, body) {
  const roomRow = await db.prepare("SELECT id FROM rooms WHERE id = ? LIMIT 1").bind(roomId).first();
  if (!roomRow) return { deleted: false, room: null, existed: false };
  const input = body?.member && typeof body.member === "object" ? body.member : body;
  const name = cleanText(input.name ?? input.playerName ?? input.nickname, 20, "");
  if (!name) {
    const error = new Error("name is required");
    error.status = 400;
    throw error;
  }
  await db.prepare("DELETE FROM members WHERE roomId = ? AND name = ?").bind(roomId, name).run();
  const remaining = await db.prepare("SELECT COUNT(*) AS count FROM members WHERE roomId = ?").bind(roomId).first();
  if (Number(remaining?.count || 0) === 0) {
    await db.prepare("DELETE FROM rooms WHERE id = ?").bind(roomId).run();
    await bumpRevision(db);
    return { deleted: true, room: null, existed: true };
  }
  await db.prepare("UPDATE rooms SET updatedAt = ? WHERE id = ?").bind(nowMs(), roomId).run();
  await bumpRevision(db);
  return { deleted: false, room: await loadRoom(db, roomId), existed: true };
}
__name(leaveRoom, "leaveRoom");
async function parseJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  try {
    return await request.json();
  } catch {
    return {};
  }
}
__name(parseJson, "parseJson");
function routeNotFound() {
  return corsJson({ ok: false, error: "Not found" }, 404);
}
__name(routeNotFound, "routeNotFound");
function methodNotAllowed() {
  return corsJson({ ok: false, error: "Method not allowed" }, 405);
}
__name(methodNotAllowed, "methodNotAllowed");
var worker_default = {
  async fetch(request, env) {
    if (!initPromise) {
      initPromise = (async () => {
        await ensureSchema(env.DB);
        await seedIfNeeded(env.DB);
      })();
    }
    await initPromise;
    if (request.method === "OPTIONS") {
      return corsEmpty(204);
    }
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if ((pathname === "/" || pathname === "/health") && request.method === "GET") {
        return corsJson({
          ok: true,
          message: "Hololive Dreams Backend API",
          version: "1.0.0",
          serverTime: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      if (pathname === "/api/rooms" && request.method === "GET") {
        const revision = await getRevision(env.DB);
        const since = Number(url.searchParams.get("since") || "0");
        const rooms = await loadRooms(env.DB);
        return corsJson({
          ok: true,
          revision,
          changed: revision > since,
          serverTime: (/* @__PURE__ */ new Date()).toISOString(),
          rooms
        });
      }
      if (pathname === "/api/rooms" && request.method === "POST") {
        const body = await parseJson(request);
        const room = await createRoom(env.DB, body);
        return corsJson({
          ok: true,
          serverTime: (/* @__PURE__ */ new Date()).toISOString(),
          room
        }, 201);
      }
      if (pathname.startsWith("/api/rooms/")) {
        const parts = pathname.split("/").filter(Boolean);
        const roomId = decodeURIComponent(parts[2] || "");
        const action = parts[3] || "";
        if (!roomId) return routeNotFound();
        if ((action === "" || action === "state") && request.method === "GET") {
          const room = await loadRoom(env.DB, roomId);
          if (!room) return corsJson({ ok: false, error: "Room not found" }, 404);
          return corsJson({
            ok: true,
            revision: await getRevision(env.DB),
            serverTime: (/* @__PURE__ */ new Date()).toISOString(),
            room
          });
        }
        if (action === "join" && request.method === "POST") {
          const body = await parseJson(request);
          const room = await joinRoom(env.DB, roomId, body);
          if (!room) return corsJson({ ok: false, error: "Room not found" }, 404);
          return corsJson({
            ok: true,
            serverTime: (/* @__PURE__ */ new Date()).toISOString(),
            room
          });
        }
        if (action === "leave" && request.method === "POST") {
          const body = await parseJson(request);
          const result = await leaveRoom(env.DB, roomId, body);
          if (!result.existed) return corsJson({ ok: false, error: "Room not found" }, 404);
          return corsJson({
            ok: true,
            deleted: result.deleted,
            serverTime: (/* @__PURE__ */ new Date()).toISOString(),
            room: result.room
          });
        }
        if (action === "" && request.method === "GET") {
          const room = await loadRoom(env.DB, roomId);
          if (!room) return corsJson({ ok: false, error: "Room not found" }, 404);
          return corsJson({
            ok: true,
            revision: await getRevision(env.DB),
            serverTime: (/* @__PURE__ */ new Date()).toISOString(),
            room
          });
        }
        return methodNotAllowed();
      }
      return routeNotFound();
    } catch (error) {
      const status = Number(error?.status || 500);
      return corsJson({
        ok: false,
        error: error?.message || "Internal Server Error"
      }, status);
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
