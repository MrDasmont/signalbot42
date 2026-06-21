import { calculateSignals, defaultSettings } from "./indicator.js";

const env = process.env;

const TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = env.TELEGRAM_CHAT_ID;
const SYMBOLS = (env.SYMBOLS || env.SYMBOL || "BTCUSDT,SOLUSDT,ADAUSDT,ETHUSDT,AAVEUSDT,LINKUSDT,XRPUSDT,TRUMPUSDT")
  .split(",")
  .map(s => s.trim().toUpperCase())
  .filter(Boolean);
const INTERVAL = (env.INTERVAL || "1h").trim();
const POLL_SECONDS = Number(env.POLL_SECONDS || env.CHECK_EVERY_SECONDS || 60);
const LIMIT = Math.min(Number(env.OKX_KLINES_LIMIT || env.BYBIT_KLINES_LIMIT || env.BINANCE_KLINES_LIMIT || 300), 300);
const OKX_MARKET = (env.OKX_MARKET || "SWAP").trim().toUpperCase(); // SWAP = perpetuals, SPOT = spot
const SEND_STARTUP_MESSAGE = String(env.SEND_STARTUP_MESSAGE || "false").toLowerCase() === "true";
const DEBUG = String(env.DEBUG || "true").toLowerCase() === "true";
const NOTIFY_LOOKBACK_CANDLES = Math.max(1, Number(env.NOTIFY_LOOKBACK_CANDLES || 2));
const IGNORE_HISTORY_ON_START = String(env.IGNORE_HISTORY_ON_START || "true").toLowerCase() === "true";

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID env var.");
  process.exit(1);
}

const sentSignalKeys = new Set();
const initializedSymbols = new Set();

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function settingsFromEnv() {
  const s = { ...defaultSettings };

  // Optional: pass exact Pine settings as JSON in Railway variable SETTINGS_JSON.
  // Example: {"trendMode":"Auto","minAdx":17,"useRejectionEntry":true}
  if (env.SETTINGS_JSON) {
    try { Object.assign(s, JSON.parse(env.SETTINGS_JSON)); }
    catch (e) { console.error(`Bad SETTINGS_JSON: ${e.message}`); }
  }

  // Common overrides without JSON.
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("S_")) continue;
    const settingName = key.slice(2);
    if (!(settingName in s)) continue;
    if (value === "true" || value === "false") s[settingName] = value === "true";
    else if (!Number.isNaN(Number(value))) s[settingName] = Number(value);
    else s[settingName] = value;
  }
  return s;
}

const indicatorSettings = settingsFromEnv();

function fmtPrice(n) {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function okxBar(tf) {
  const t = String(tf).trim().toLowerCase();
  const map = {
    "1m": "1m", "3m": "3m", "5m": "5m", "15m": "15m", "30m": "30m",
    "1h": "1H", "2h": "2H", "4h": "4H",
    "1d": "1D", "d": "1D", "1w": "1W", "w": "1W",
  };
  if (!map[t]) throw new Error(`Unsupported OKX interval: ${tf}. Use for example 15m, 1h, 4h, 1d.`);
  return map[t];
}

function intervalMs(tf) {
  const t = String(tf).trim().toLowerCase();
  if (t.endsWith("m") && t !== "m") return Number(t.slice(0, -1)) * 60_000;
  if (t.endsWith("h")) return Number(t.slice(0, -1)) * 60 * 60_000;
  if (t === "1d" || t === "d") return 24 * 60 * 60_000;
  if (t === "1w" || t === "w") return 7 * 24 * 60 * 60_000;
  throw new Error(`Cannot calculate interval duration for: ${tf}`);
}

function okxInstId(rawSymbol) {
  const symbol = String(rawSymbol).trim().toUpperCase();

  // If the user already passed an OKX instrument ID, keep it.
  // Examples: BTC-USDT, BTC-USDT-SWAP.
  if (symbol.includes("-")) return symbol;

  // Convert common Binance/Bybit style symbols to OKX style.
  // BTCUSDT -> BTC-USDT or BTC-USDT-SWAP.
  if (!symbol.endsWith("USDT")) {
    throw new Error(`Unsupported symbol format for OKX: ${symbol}. Use BTCUSDT or BTC-USDT-SWAP.`);
  }
  const base = symbol.slice(0, -4);
  return OKX_MARKET === "SPOT" ? `${base}-USDT` : `${base}-USDT-SWAP`;
}

async function fetchOkxKlines(symbol) {
  const instId = okxInstId(symbol);
  const bar = okxBar(INTERVAL);
  const url = `https://www.okx.com/api/v5/market/candles?instId=${encodeURIComponent(instId)}&bar=${encodeURIComponent(bar)}&limit=${LIMIT}`;
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "Mozilla/5.0 railway-telegram-signal-bot",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OKX HTTP error for ${symbol} (${instId}): ${res.status} ${text}`);

  let json;
  try { json = JSON.parse(text); }
  catch { throw new Error(`OKX returned non-JSON for ${symbol} (${instId}): ${text.slice(0, 200)}`); }

  if (json.code !== "0") {
    throw new Error(`OKX API error for ${symbol} (${instId}): ${json.code} ${json.msg || ""}`);
  }

  const rows = json?.data || [];
  const dur = intervalMs(INTERVAL);
  const now = Date.now();

  return rows
    .map(r => {
      const openTime = Number(r[0]);
      return {
        openTime,
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
        closeTime: openTime + dur - 1,
        confirmed: String(r[8] ?? "1") === "1",
      };
    })
    // OKX returns newest first; Pine-style calculation needs oldest first.
    .sort((a, b) => a.openTime - b.openTime)
    // Keep only fully closed candles. OKX also provides confirm flag.
    .filter(c => c.confirmed && c.openTime + dur <= now);
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) throw new Error(`Telegram error: ${res.status} ${await res.text()}`);
}

function buildMessage(symbol, sig) {
  const side = sig.longCONT ? "🟢 LONG" : "🔴 SHORT";
  const candleTime = new Date(sig.closeTime).toISOString().replace("T", " ").replace(".000Z", " UTC");
  return `${side} SIGNAL\n\n<b>${symbol}</b>\nTimeframe: <b>${INTERVAL}</b>\nClosed candle: ${candleTime}\nClose price: <b>${fmtPrice(sig.close)}</b>`;
}

function getRecentSignals(candles) {
  const calculated = calculateSignals(candles, indicatorSettings);
  const recent = calculated.slice(-NOTIFY_LOOKBACK_CANDLES);
  return { calculated, recentSignals: recent.filter(x => x.longCONT || x.shortCONT) };
}

async function checkSymbol(symbol) {
  const candles = await fetchOkxKlines(symbol);
  if (candles.length < 250) {
    console.log(`${symbol}: not enough candles (${candles.length})`);
    return;
  }

  const { calculated, recentSignals } = getRecentSignals(candles);
  const last = calculated[calculated.length - 1];

  if (DEBUG) {
    const side = last?.longCONT ? "LONG" : last?.shortCONT ? "SHORT" : "none";
    console.log(`${symbol} ${INTERVAL}: latest closed=${new Date(last.closeTime).toISOString()} close=${last.close} signal=${side} recentSignals=${recentSignals.length}`);
  }

  // Prevent old historical alerts on the first loop after deployment/restart.
  if (IGNORE_HISTORY_ON_START && !initializedSymbols.has(symbol)) {
    initializedSymbols.add(symbol);
    if (DEBUG && recentSignals.length) console.log(`${symbol}: ignored ${recentSignals.length} historical startup signal(s).`);
    return;
  }
  initializedSymbols.add(symbol);

  for (const sig of recentSignals) {
    const side = sig.longCONT ? "LONG" : "SHORT";
    const key = `${symbol}:${INTERVAL}:${sig.closeTime}:${side}`;
    if (sentSignalKeys.has(key)) continue;
    sentSignalKeys.add(key);
    await sendTelegram(buildMessage(symbol, sig));
    console.log(`Sent ${side} signal for ${symbol} ${INTERVAL} candle=${new Date(sig.closeTime).toISOString()}`);
  }
}

async function mainLoop() {
  console.log(`Bot started. Data=OKX ${OKX_MARKET}. Symbols=${SYMBOLS.join(", ")} interval=${INTERVAL} poll=${POLL_SECONDS}s limit=${LIMIT}`);
  console.log(`Settings: ${JSON.stringify(indicatorSettings)}`);

  if (SEND_STARTUP_MESSAGE) {
    await sendTelegram(`✅ AMD x FVG OKX bot started\n\nMarket: ${OKX_MARKET}\nSymbols: ${SYMBOLS.join(", ")}\nTimeframe: ${INTERVAL}\nLookback: ${NOTIFY_LOOKBACK_CANDLES} closed candles`);
  }

  while (true) {
    for (const symbol of SYMBOLS) {
      try { await checkSymbol(symbol); }
      catch (err) { console.error(`${symbol}: ${err.stack || err.message}`); }
      await sleep(700);
    }
    await sleep(POLL_SECONDS * 1000);
  }
}

mainLoop().catch(err => {
  console.error(err);
  process.exit(1);
});
