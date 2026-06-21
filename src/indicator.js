const na = null;
const isNa = (x) => x === null || x === undefined || Number.isNaN(x);
const nz = (x, fallback = 0) => (isNa(x) ? fallback : x);
const bool = (x) => !!x;

export const defaultSettings = {
  trendMode: "Auto",
  atrLen: 14,
  fastEmaLen: 34,
  slowEmaLen: 89,
  pivotLen: 4,
  minEmaGapAtr: 0.12,
  minSlopeAtr: 0.04,
  blockRange: true,
  allowBOSOverride: true,

  useAntiRange: true,
  adxLen: 14,
  adxSmooth: 14,
  minAdx: 17.0,
  rangeMinEmaGapAtr: 0.10,
  rangeMinSlopeAtr: 0.035,
  trendProgressLookback: 20,
  minTrendProgressAtr: 0.70,

  minCorrBars: 2,
  maxCorrBars: 80,
  minPullbackAtr: 0.45,
  minCorrRangeAtr: 0.30,
  maxEntryRangeAtr: 2.8,

  minSweepAtr: 0.02,
  reclaimBufferAtr: 0.01,
  allowBreakoutContinuation: false,
  allowStructuredPullbackBreakout: false,
  structBreakoutBufferAtr: 0.01,
  structMinBodyAtr: 0.08,
  structRequirePrevBarBreak: true,
  requireDirectionalClose: true,
  minBarsBetweenSignals: 6,
  sweepEntryMode: "Hybrid",
  strongSweepAtr: 0.04,
  strongReclaimBufferAtr: 0.02,
  sweepConfirmBars: 4,
  requireMatureLocalSweep: true,
  matureSweepLookback: 6,
  matureSweepExcludeBars: 2,
  matureSweepBufferAtr: 0.00,

  usePullbackEntry: true,
  allowReactionWithoutSweep: true,
  pullbackEdgePct: 0.55,
  edgeTouchAtr: 0.05,
  maxLongClosePos: 0.70,
  minShortClosePos: 0.30,
  minReactionCloseStrength: 0.55,
  minReactionBodyAtr: 0.03,
  maxReactionBodyAtr: 0.75,
  maxCloseOutsideCorrAtr: 0.00,

  useRejectionEntry: true,
  rejectionEdgePct: 0.32,
  maxLongRejectionClosePos: 0.45,
  minShortRejectionClosePos: 0.55,
  minRejectionWickPct: 0.22,
  longRejectionCloseStrength: 0.45,
  shortRejectionCloseStrength: 0.55,
  maxRejectionBodyAtr: 0.65,
  maxRejectionRangeAtr: 1.80,
};

function ema(values, len) {
  const out = Array(values.length).fill(na);
  const alpha = 2 / (len + 1);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (isNa(v)) continue;
    out[i] = i === 0 || isNa(out[i - 1]) ? v : alpha * v + (1 - alpha) * out[i - 1];
  }
  return out;
}

function rma(values, len) {
  const out = Array(values.length).fill(na);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (isNa(v)) continue;
    if (isNa(out[i - 1])) {
      sum += v;
      count += 1;
      if (count === len) out[i] = sum / len;
    } else {
      out[i] = (out[i - 1] * (len - 1) + v) / len;
    }
  }
  return out;
}

function trueRange(candles) {
  return candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const pc = candles[i - 1].close;
    return Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  });
}

function lowest(arr, i, len) {
  if (i - len + 1 < 0) return na;
  let v = Infinity;
  for (let j = i - len + 1; j <= i; j++) if (!isNa(arr[j])) v = Math.min(v, arr[j]);
  return v === Infinity ? na : v;
}

function highest(arr, i, len) {
  if (i - len + 1 < 0) return na;
  let v = -Infinity;
  for (let j = i - len + 1; j <= i; j++) if (!isNa(arr[j])) v = Math.max(v, arr[j]);
  return v === -Infinity ? na : v;
}

function pivotHigh(highs, i, left, right) {
  const p = i - right;
  if (p - left < 0 || p + right >= highs.length) return na;
  const v = highs[p];
  for (let j = p - left; j <= p + right; j++) if (j !== p && highs[j] >= v) return na;
  return v;
}

function pivotLow(lows, i, left, right) {
  const p = i - right;
  if (p - left < 0 || p + right >= lows.length) return na;
  const v = lows[p];
  for (let j = p - left; j <= p + right; j++) if (j !== p && lows[j] <= v) return na;
  return v;
}

function dmi(candles, len, smooth) {
  const plusDM = Array(candles.length).fill(0);
  const minusDM = Array(candles.length).fill(0);
  const tr = trueRange(candles);
  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDM[i] = up > down && up > 0 ? up : 0;
    minusDM[i] = down > up && down > 0 ? down : 0;
  }
  const trRma = rma(tr, len);
  const plusRma = rma(plusDM, len);
  const minusRma = rma(minusDM, len);
  const plusDI = candles.map((_, i) => isNa(trRma[i]) || trRma[i] === 0 ? na : 100 * plusRma[i] / trRma[i]);
  const minusDI = candles.map((_, i) => isNa(trRma[i]) || trRma[i] === 0 ? na : 100 * minusRma[i] / trRma[i]);
  const dx = candles.map((_, i) => {
    if (isNa(plusDI[i]) || isNa(minusDI[i]) || plusDI[i] + minusDI[i] === 0) return na;
    return 100 * Math.abs(plusDI[i] - minusDI[i]) / (plusDI[i] + minusDI[i]);
  });
  return { plusDI, minusDI, adx: rma(dx, smooth) };
}

export function calculateSignals(candles, userSettings = {}) {
  const s = { ...defaultSettings, ...userSettings };
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const opens = candles.map(c => c.open);
  const mintick = 1e-8;

  const atr = rma(trueRange(candles), s.atrLen);
  const fastEma = ema(closes, s.fastEmaLen);
  const slowEma = ema(closes, s.slowEmaLen);
  const { plusDI, minusDI, adx } = dmi(candles, s.adxLen, s.adxSmooth);

  const state = {
    lastSwingHigh: na, prevSwingHigh: na, lastSwingLow: na, prevSwingLow: na,
    bullCorr: false, bearCorr: false, corrLow: na, corrHigh: na, corrStartBar: na, lastSignalBar: na,
    trendHigh: na, trendLow: na,
    pendingLongSweep: false, pendingShortSweep: false, pendingLongBreak: na, pendingShortBreak: na, pendingLongBar: na, pendingShortBar: na,
  };

  const results = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const a = atr[i];
    if (isNa(a) || isNa(fastEma[i]) || isNa(slowEma[i]) || isNa(adx[i])) {
      results.push({ ...c, longCONT: false, shortCONT: false });
      continue;
    }

    const emaGap = Math.abs(fastEma[i] - slowEma[i]);
    const slowSlope = i >= 5 ? slowEma[i] - slowEma[i - 5] : na;
    const trendProgressLong = !isNa(lowest(lows, i, s.trendProgressLookback)) ? c.close - lowest(lows, i, s.trendProgressLookback) : na;
    const trendProgressShort = !isNa(highest(highs, i, s.trendProgressLookback)) ? highest(highs, i, s.trendProgressLookback) - c.close : na;

    const emaBull = c.close > slowEma[i] && fastEma[i] > slowEma[i] && emaGap >= a * s.minEmaGapAtr && slowSlope >= a * s.minSlopeAtr;
    const emaBear = c.close < slowEma[i] && fastEma[i] < slowEma[i] && emaGap >= a * s.minEmaGapAtr && slowSlope <= -a * s.minSlopeAtr;

    const ph = pivotHigh(highs, i, s.pivotLen, s.pivotLen);
    const pl = pivotLow(lows, i, s.pivotLen, s.pivotLen);
    if (!isNa(ph)) { state.prevSwingHigh = state.lastSwingHigh; state.lastSwingHigh = ph; }
    if (!isNa(pl)) { state.prevSwingLow = state.lastSwingLow; state.lastSwingLow = pl; }

    const swingBull = !isNa(state.lastSwingHigh) && !isNa(state.prevSwingHigh) && !isNa(state.lastSwingLow) && !isNa(state.prevSwingLow) && state.lastSwingHigh > state.prevSwingHigh && state.lastSwingLow > state.prevSwingLow;
    const swingBear = !isNa(state.lastSwingHigh) && !isNa(state.prevSwingHigh) && !isNa(state.lastSwingLow) && !isNa(state.prevSwingLow) && state.lastSwingHigh < state.prevSwingHigh && state.lastSwingLow < state.prevSwingLow;
    const bosUp = s.allowBOSOverride && !isNa(state.lastSwingHigh) && c.close > state.lastSwingHigh;
    const bosDown = s.allowBOSOverride && !isNa(state.lastSwingLow) && c.close < state.lastSwingLow;
    const autoBull = emaBull || (swingBull && c.close > slowEma[i]) || bosUp;
    const autoBear = emaBear || (swingBear && c.close < slowEma[i]) || bosDown;

    const rawLongAllowed = s.trendMode === "Both" || s.trendMode === "Long only" || (s.trendMode === "Auto" && autoBull);
    const rawShortAllowed = s.trendMode === "Both" || s.trendMode === "Short only" || (s.trendMode === "Auto" && autoBear);
    const rangeState = !emaBull && !emaBear && !swingBull && !swingBear;
    const longAntiRangeOk = !s.useAntiRange || (adx[i] >= s.minAdx && plusDI[i] > minusDI[i] && emaGap >= a * s.rangeMinEmaGapAtr && slowSlope >= a * s.rangeMinSlopeAtr && trendProgressLong >= a * s.minTrendProgressAtr);
    const shortAntiRangeOk = !s.useAntiRange || (adx[i] >= s.minAdx && minusDI[i] > plusDI[i] && emaGap >= a * s.rangeMinEmaGapAtr && slowSlope <= -a * s.rangeMinSlopeAtr && trendProgressShort >= a * s.minTrendProgressAtr);

    const longAllowed = rawLongAllowed && !rawShortAllowed && !(s.blockRange && rangeState) && longAntiRangeOk;
    const shortAllowed = rawShortAllowed && !rawLongAllowed && !(s.blockRange && rangeState) && shortAntiRangeOk;

    if (longAllowed) state.trendHigh = isNa(state.trendHigh) ? c.high : Math.max(state.trendHigh, c.high);
    else { state.trendHigh = na; state.bullCorr = false; state.pendingLongSweep = false; state.pendingLongBreak = na; state.pendingLongBar = na; }

    if (shortAllowed) state.trendLow = isNa(state.trendLow) ? c.low : Math.min(state.trendLow, c.low);
    else { state.trendLow = na; state.bearCorr = false; state.pendingShortSweep = false; state.pendingShortBreak = na; state.pendingShortBar = na; }

    const realBullPullback = longAllowed && !isNa(state.trendHigh) && state.trendHigh - c.low >= a * s.minPullbackAtr;
    const realBearPullback = shortAllowed && !isNa(state.trendLow) && c.high - state.trendLow >= a * s.minPullbackAtr;
    const startBullCorr = longAllowed && !state.bullCorr && realBullPullback && i > 0 && c.low < lows[i - 1];
    const startBearCorr = shortAllowed && !state.bearCorr && realBearPullback && i > 0 && c.high > highs[i - 1];

    if (startBullCorr) { state.bullCorr = true; state.bearCorr = false; state.corrLow = c.low; state.corrHigh = c.high; state.corrStartBar = i; }
    if (startBearCorr) { state.bearCorr = true; state.bullCorr = false; state.corrLow = c.low; state.corrHigh = c.high; state.corrStartBar = i; }

    const corrAge = !isNa(state.corrStartBar) ? i - state.corrStartBar : 100000;
    const corrRange = !isNa(state.corrLow) && !isNa(state.corrHigh) ? state.corrHigh - state.corrLow : na;
    const corrReady = corrAge >= s.minCorrBars && corrAge <= s.maxCorrBars && !isNa(corrRange) && corrRange >= a * s.minCorrRangeAtr;
    const priorCorrLow = state.corrLow;
    const priorCorrHigh = state.corrHigh;
    const cooldownOk = isNa(state.lastSignalBar) || i - state.lastSignalBar >= s.minBarsBetweenSignals;
    const entryRangeOk = c.high - c.low <= a * s.maxEntryRangeAtr;
    const longCandleOk = !s.requireDirectionalClose || c.close > c.open;
    const shortCandleOk = !s.requireDirectionalClose || c.close < c.open;

    const matureLowSeriesValue = i - s.matureSweepExcludeBars >= 0 ? lowest(lows, i - s.matureSweepExcludeBars, s.matureSweepLookback) : na;
    const matureHighSeriesValue = i - s.matureSweepExcludeBars >= 0 ? highest(highs, i - s.matureSweepExcludeBars, s.matureSweepLookback) : na;
    const longMatureSweepOk = !s.requireMatureLocalSweep || (!isNa(matureLowSeriesValue) && c.low < matureLowSeriesValue - a * s.matureSweepBufferAtr);
    const shortMatureSweepOk = !s.requireMatureLocalSweep || (!isNa(matureHighSeriesValue) && c.high > matureHighSeriesValue + a * s.matureSweepBufferAtr);

    const longSweepReclaim = !isNa(priorCorrLow) && longMatureSweepOk && c.low < priorCorrLow - a * s.minSweepAtr && c.close > priorCorrLow + a * s.reclaimBufferAtr;
    const shortSweepReclaim = !isNa(priorCorrHigh) && shortMatureSweepOk && c.high > priorCorrHigh + a * s.minSweepAtr && c.close < priorCorrHigh - a * s.reclaimBufferAtr;
    const longBreakoutCont = s.allowBreakoutContinuation && !isNa(priorCorrHigh) && c.close > priorCorrHigh && c.close > c.open;
    const shortBreakoutCont = s.allowBreakoutContinuation && !isNa(priorCorrLow) && c.close < priorCorrLow && c.close < c.open;

    const longStructBodyOk = c.close > c.open && c.close - c.open >= a * s.structMinBodyAtr;
    const shortStructBodyOk = c.close < c.open && c.open - c.close >= a * s.structMinBodyAtr;
    const longStructPrevOk = !s.structRequirePrevBarBreak || (i > 0 && c.close > highs[i - 1]);
    const shortStructPrevOk = !s.structRequirePrevBarBreak || (i > 0 && c.close < lows[i - 1]);
    const longStructuredBreakout = s.allowStructuredPullbackBreakout && !isNa(priorCorrHigh) && c.close > priorCorrHigh + a * s.structBreakoutBufferAtr && longStructBodyOk && longStructPrevOk;
    const shortStructuredBreakout = s.allowStructuredPullbackBreakout && !isNa(priorCorrLow) && c.close < priorCorrLow - a * s.structBreakoutBufferAtr && shortStructBodyOk && shortStructPrevOk;

    const corrDenom = !isNa(corrRange) ? Math.max(corrRange, mintick) : na;
    const corrClosePos = !isNa(corrDenom) && !isNa(priorCorrLow) ? (c.close - priorCorrLow) / corrDenom : na;
    const barRange = Math.max(c.high - c.low, mintick);
    const bodySize = Math.abs(c.close - c.open);
    const barClosePos = (c.close - c.low) / barRange;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    const upperWickPct = upperWick / barRange;
    const lowerWickPct = lowerWick / barRange;

    const longTouchedEntryEdge = !isNa(priorCorrLow) && !isNa(corrRange) && c.low <= priorCorrLow + corrRange * s.pullbackEdgePct + a * s.edgeTouchAtr;
    const shortTouchedEntryEdge = !isNa(priorCorrHigh) && !isNa(corrRange) && c.high >= priorCorrHigh - corrRange * s.pullbackEdgePct - a * s.edgeTouchAtr;
    const longTouchedRejectionEdge = !isNa(priorCorrLow) && !isNa(corrRange) && c.low <= priorCorrLow + corrRange * s.rejectionEdgePct + a * s.edgeTouchAtr;
    const shortTouchedRejectionEdge = !isNa(priorCorrHigh) && !isNa(corrRange) && c.high >= priorCorrHigh - corrRange * s.rejectionEdgePct - a * s.edgeTouchAtr;

    const longCloseStillInPullback = !isNa(corrClosePos) && corrClosePos <= s.maxLongClosePos && c.close <= priorCorrHigh + a * s.maxCloseOutsideCorrAtr;
    const shortCloseStillInPullback = !isNa(corrClosePos) && corrClosePos >= s.minShortClosePos && c.close >= priorCorrLow - a * s.maxCloseOutsideCorrAtr;
    const longCloseInRejectionZone = !isNa(corrClosePos) && corrClosePos <= s.maxLongRejectionClosePos && c.close >= priorCorrLow - a * s.maxCloseOutsideCorrAtr;
    const shortCloseInRejectionZone = !isNa(corrClosePos) && corrClosePos >= s.minShortRejectionClosePos && c.close <= priorCorrHigh + a * s.maxCloseOutsideCorrAtr;

    const longReactionCandle = c.close > c.open && c.close >= c.low + barRange * s.minReactionCloseStrength && bodySize >= a * s.minReactionBodyAtr && bodySize <= a * s.maxReactionBodyAtr;
    const shortReactionCandle = c.close < c.open && c.close <= c.high - barRange * s.minReactionCloseStrength && bodySize >= a * s.minReactionBodyAtr && bodySize <= a * s.maxReactionBodyAtr;
    const longRejectionCandle = bodySize <= a * s.maxRejectionBodyAtr && barRange <= a * s.maxRejectionRangeAtr && (lowerWickPct >= s.minRejectionWickPct || barClosePos >= s.longRejectionCloseStrength);
    const shortRejectionCandle = bodySize <= a * s.maxRejectionBodyAtr && barRange <= a * s.maxRejectionRangeAtr && (upperWickPct >= s.minRejectionWickPct || barClosePos <= s.shortRejectionCloseStrength);

    const longEntryTrigger = s.useRejectionEntry ? (longTouchedRejectionEdge && longCloseInRejectionZone && longRejectionCandle) : (longTouchedEntryEdge && longCloseStillInPullback && longReactionCandle);
    const shortEntryTrigger = s.useRejectionEntry ? (shortTouchedRejectionEdge && shortCloseInRejectionZone && shortRejectionCandle) : (shortTouchedEntryEdge && shortCloseStillInPullback && shortReactionCandle);

    const longPullbackReaction = s.usePullbackEntry && longAllowed && state.bullCorr && corrReady && cooldownOk && entryRangeOk && longEntryTrigger && (s.allowReactionWithoutSweep || longSweepReclaim);
    const shortPullbackReaction = s.usePullbackEntry && shortAllowed && state.bearCorr && corrReady && cooldownOk && entryRangeOk && shortEntryTrigger && (s.allowReactionWithoutSweep || shortSweepReclaim);

    const rawLongSweepSetup = longAllowed && state.bullCorr && corrReady && cooldownOk && entryRangeOk && longCandleOk && longSweepReclaim;
    const rawShortSweepSetup = shortAllowed && state.bearCorr && corrReady && cooldownOk && entryRangeOk && shortCandleOk && shortSweepReclaim;
    const immediateSweepMode = s.sweepEntryMode === "Immediate";
    const hybridSweepMode = s.sweepEntryMode === "Hybrid";
    const confirmedSweepMode = s.sweepEntryMode === "Confirmed";
    const strongLongSweepSetup = rawLongSweepSetup && !isNa(priorCorrLow) && c.low < priorCorrLow - a * s.strongSweepAtr && c.close > priorCorrLow + a * s.strongReclaimBufferAtr;
    const strongShortSweepSetup = rawShortSweepSetup && !isNa(priorCorrHigh) && c.high > priorCorrHigh + a * s.strongSweepAtr && c.close < priorCorrHigh - a * s.strongReclaimBufferAtr;
    const longSweepNeedsConfirmation = (confirmedSweepMode && rawLongSweepSetup) || (hybridSweepMode && rawLongSweepSetup && !strongLongSweepSetup);
    const shortSweepNeedsConfirmation = (confirmedSweepMode && rawShortSweepSetup) || (hybridSweepMode && rawShortSweepSetup && !strongShortSweepSetup);

    if (longSweepNeedsConfirmation) { state.pendingLongSweep = true; state.pendingShortSweep = false; state.pendingLongBreak = c.high; state.pendingLongBar = i; }
    if (shortSweepNeedsConfirmation) { state.pendingShortSweep = true; state.pendingLongSweep = false; state.pendingShortBreak = c.low; state.pendingShortBar = i; }

    const longPendingExpired = state.pendingLongSweep && !isNa(state.pendingLongBar) && i - state.pendingLongBar > s.sweepConfirmBars;
    const shortPendingExpired = state.pendingShortSweep && !isNa(state.pendingShortBar) && i - state.pendingShortBar > s.sweepConfirmBars;
    if (longPendingExpired) { state.pendingLongSweep = false; state.pendingLongBreak = na; state.pendingLongBar = na; }
    if (shortPendingExpired) { state.pendingShortSweep = false; state.pendingShortBreak = na; state.pendingShortBar = na; }

    const longSweepConfirmed = state.pendingLongSweep && i > state.pendingLongBar && i - state.pendingLongBar <= s.sweepConfirmBars && longAllowed && state.bullCorr && corrReady && cooldownOk && entryRangeOk && longCandleOk && c.close > state.pendingLongBreak;
    const shortSweepConfirmed = state.pendingShortSweep && i > state.pendingShortBar && i - state.pendingShortBar <= s.sweepConfirmBars && shortAllowed && state.bearCorr && corrReady && cooldownOk && entryRangeOk && shortCandleOk && c.close < state.pendingShortBreak;

    const longSweepEntry = immediateSweepMode ? rawLongSweepSetup : hybridSweepMode ? (strongLongSweepSetup || longSweepConfirmed) : longSweepConfirmed;
    const shortSweepEntry = immediateSweepMode ? rawShortSweepSetup : hybridSweepMode ? (strongShortSweepSetup || shortSweepConfirmed) : shortSweepConfirmed;
    const longBreakoutEntry = longAllowed && state.bullCorr && corrReady && cooldownOk && entryRangeOk && longCandleOk && (longBreakoutCont || longStructuredBreakout);
    const shortBreakoutEntry = shortAllowed && state.bearCorr && corrReady && cooldownOk && entryRangeOk && shortCandleOk && (shortBreakoutCont || shortStructuredBreakout);

    const longCONT = s.usePullbackEntry ? longPullbackReaction : (longSweepEntry || longBreakoutEntry);
    const shortCONT = s.usePullbackEntry ? shortPullbackReaction : (shortSweepEntry || shortBreakoutEntry);

    if (state.bullCorr && !longCONT) { state.corrLow = isNa(state.corrLow) ? c.low : Math.min(state.corrLow, c.low); state.corrHigh = isNa(state.corrHigh) ? c.high : Math.max(state.corrHigh, c.high); }
    if (state.bearCorr && !shortCONT) { state.corrHigh = isNa(state.corrHigh) ? c.high : Math.max(state.corrHigh, c.high); state.corrLow = isNa(state.corrLow) ? c.low : Math.min(state.corrLow, c.low); }

    if (longCONT) { state.pendingLongSweep = false; state.pendingLongBreak = na; state.pendingLongBar = na; state.bullCorr = false; state.corrLow = na; state.corrHigh = na; state.corrStartBar = na; state.lastSignalBar = i; state.trendHigh = c.high; }
    if (shortCONT) { state.pendingShortSweep = false; state.pendingShortBreak = na; state.pendingShortBar = na; state.bearCorr = false; state.corrLow = na; state.corrHigh = na; state.corrStartBar = na; state.lastSignalBar = i; state.trendLow = c.low; }

    if (corrAge > s.maxCorrBars) {
      state.pendingLongSweep = false; state.pendingShortSweep = false; state.pendingLongBreak = na; state.pendingShortBreak = na; state.pendingLongBar = na; state.pendingShortBar = na;
      state.bullCorr = false; state.bearCorr = false; state.corrLow = na; state.corrHigh = na; state.corrStartBar = na;
    }

    results.push({
      ...c,
      longCONT,
      shortCONT,
      atr: a,
      close: c.close,
    });
  }
  return results;
}

export function latestSignal(candles, settings = {}) {
  const signals = calculateSignals(candles, settings);
  return signals[signals.length - 1] || null;
}
