"use strict";

const U64_MAX = (1n << 64n) - 1n;

function asU64(value, name) {
  let parsed;
  try {
    parsed = BigInt(value);
  } catch (_error) {
    throw new TypeError(name + " must be an integer.");
  }
  if (parsed < 0n || parsed > U64_MAX) throw new RangeError(name + " must fit u64.");
  return parsed;
}

function priceNextRung(input) {
  const curveBalance = asU64(input.curveBalance, "curveBalance");
  const lastAwardedBalance = asU64(input.lastAwardedBalance, "lastAwardedBalance");
  const ladderStep = asU64(input.ladderStep, "ladderStep");
  const minBuy = asU64(input.minBuy, "minBuy");
  if (ladderStep === 0n || minBuy === 0n) throw new RangeError("ladderStep and minBuy must be positive.");

  const firstRung = lastAwardedBalance === U64_MAX;
  const baseline = firstRung ? curveBalance : lastAwardedBalance;
  if (baseline < ladderStep) throw new RangeError("No complete rung remains below the stored baseline.");
  const targetCurveBalance = baseline - ladderStep;
  const distanceToTarget = curveBalance > targetCurveBalance ? curveBalance - targetCurveBalance : 0n;
  const requiredBaseAmount = distanceToTarget > minBuy ? distanceToTarget : minBuy;

  return {
    firstRung,
    baseline,
    targetCurveBalance,
    distanceToTarget,
    requiredBaseAmount,
  };
}

function enforceQuoteBudget(requiredQuoteAmount, maximumQuoteAmount) {
  const required = asU64(requiredQuoteAmount, "requiredQuoteAmount");
  const maximum = asU64(maximumQuoteAmount, "maximumQuoteAmount");
  if (required > maximum) throw new RangeError("The next rung costs more than the player's TSLAx budget.");
  return { requiredQuoteAmount: required, maximumQuoteAmount: maximum, remainingQuoteBudget: maximum - required };
}

module.exports = { U64_MAX, priceNextRung, enforceQuoteBudget };
