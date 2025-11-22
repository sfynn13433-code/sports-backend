const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

/* ------------------------------ Middleware ------------------------------ */
app.use(cors());
app.use(express.json());

/* ------------------------------ Health check root route ------------------------------ */
app.get("/", (req, res) => {
  res.send("SKCS Sports Predictions backend is running.");
});

/* ------------------------------ Expert data stub (replace later with real APIs) ------------------------------ */
async function fetchExpertData(home, away, league) {
  return {
    expert_win: 36,
    expert_draw: 29,
    expert_away: 35,
    expert_btts: 66,
    expert_over25: 59,
    expert_first_half_goals: 52,
    expert_corners_high: 45,
    expert_cards_high: 58,
    expert_notes: [
      "Pressing intensity suggests open transitions.",
      "Set‑piece threat elevates corner totals.",
      "Midfield duels increase booking risk.",
    ],
  };
}
/* ------------------------------ Blending logic (AI base + expert consensus) ------------------------------ */
function adjustProbabilities(defaults, experts) {
  const weightModel = 0.6;
  const weightExpert = 0.4;
  const blend = (m, e) => Math.round(m * weightModel + e * weightExpert);
  return {
    homeWin: blend(defaults.homeWin, experts.expert_win),
    draw: blend(defaults.draw, experts.expert_draw),
    awayWin: blend(defaults.awayWin, experts.expert_away),
    btts: blend(defaults.btts, experts.expert_btts),
    over25: blend(defaults.over25, experts.expert_over25),
    firstHalfGoals: blend(defaults.firstHalfGoals, experts.expert_first_half_goals),
    cornersHigh: blend(defaults.cornersHigh, experts.expert_corners_high),
    cardsHigh: blend(defaults.cardsHigh, experts.expert_cards_high),
  };
}
/* ------------------------------ Utilities ------------------------------ */
const clampPct = (n) => Math.max(0, Math.min(100, Math.round(n)));
const pct = (n) => `${clampPct(n)}%`;
const suggest = (p) => (p >= 70 ? "High" : p >= 50 ? "Medium" : "Low");
const note = (text) => text;

function makeOdds(probPercent) {
  const p = Math.max(1, Math.min(99, probPercent)) / 100;
  const dec = Math.max(1.1, Math.min(10.0, 1 / p));
  return dec.toFixed(2);
}

/* ------------------------------ Derive market lines from anchors ------------------------------ */
function deriveTotals(adjusted) {
  const over25 = adjusted.over25;
  const mapping = {
    0.5: Math.max(70, over25 + 12),
    1.5: Math.max(62, over25 + 4),
    2.5: over25,
    3.5: Math.max(32, over25 - 26),
    4.5: Math.max(22, over25 - 36),
    5.5: Math.max(14, over25 - 44),
  };
  const over = mapping;
  const under = Object.fromEntries(
    Object.entries(over).map(([k, v]) => [k, Math.max(0, 100 - v)])
  );
  return { over, under };
}
function deriveFirstHalf(adjusted) {
  const fh = adjusted.firstHalfGoals;
  const over = {
    0.5: Math.max(58, fh + 6),
    1.5: Math.max(46, fh - 6),
  };
  const under = {
    0.5: Math.max(0, 100 - over[0.5]),
    1.5: Math.max(0, 100 - over[1.5]),
  };
  const home = Math.round(adjusted.homeWin * 0.9);
  const draw = Math.round(adjusted.draw * 1.2);
  const away = Math.round(adjusted.awayWin * 0.9);
  return { over, under, fh1x2: { home, draw, away } };
}
function deriveFulltime(adjusted) {
  const oneX2 = {
    home: adjusted.homeWin,
    draw: adjusted.draw,
    away: adjusted.awayWin,
  };
  const dc = {
    "1X": Math.max(0, Math.min(100, oneX2.home + oneX2.draw)),
    "X2": Math.max(0, Math.min(100, oneX2.draw + oneX2.away)),
    "12": Math.max(0, Math.min(100, oneX2.home + oneX2.away)),
  };
  return { oneX2, dc };
}
function composeDoubleChanceCombos(dc, totals, btts) {
  const lines = [1.5, 2.5, 3.5, 4.5, 5.5];
  const combos = [];
  for (const key of ["1X", "X2", "12"]) {
    for (const l of lines) {
      const pOver = Math.round(dc[key] * 0.5 + totals.over[l] * 0.5);
      const pUnder = Math.round(dc[key] * 0.5 + totals.under[l] * 0.5);
      combos.push({
        outcome: `Double Chance ${key} + Over ${l}`,
        probability: pct(pOver),
        odds: makeOdds(pOver),
        market: "double chance + goals",
        suggestion: suggest(pOver),
        rationale: note(`Combined stability from ${key} with scoring pace over ${l}.`),
      });
      combos.push({
        outcome: `Double Chance ${key} + Under ${l}`,
        probability: pct(pUnder),
        odds: makeOdds(pUnder),
        market: "double chance + goals",
        suggestion: suggest(pUnder),
        rationale: note(`Protection via ${key} with conservative totals under ${l}.`),
      });
    }
  }
  const pYes = Math.round(btts * 0.6 + 60 * 0.4);
  const pNo = Math.max(0, 100 - pYes);
  for (const key of ["1X", "X2", "12"]) {
    const pComboYes = Math.round(dc[key] * 0.5 + pYes * 0.5);
    const pComboNo = Math.round(dc[key] * 0.5 + pNo * 0.5);
    combos.push({
      outcome: `Double Chance ${key} + BTTS Yes`,
      probability: pct(pComboYes),
      odds: makeOdds(pComboYes),
      market: "double chance + BTTS",
      suggestion: suggest(pComboYes),
      rationale: note(`Balanced exposure via ${key} with mutual scoring likelihood.`),
    });
    combos.push({
      outcome: `Double Chance ${key} + BTTS No`,
      probability: pct(pComboNo),
      odds: makeOdds(pComboNo),
      market: "double chance + BTTS",
      suggestion: suggest(pComboNo),
      rationale: note(`Conservative approach: ${key} cover with single‑sided control expected.`),
    });
  }
  const over25 = totals.over[2.5];
  const under25 = totals.under[2.5];
  const bttsOver25 = Math.round(btts * 0.55 + over25 * 0.45);
  const bttsUnder25 = Math.round(btts * 0.45 + under25 * 0.55);
  const noTeamScore = Math.round(Math.max(0, 100 - btts) * 0.8 + under25 * 0.2);

  combos.push({
    outcome: "BTTS Yes + Over 2.5",
    probability: pct(bttsOver25),
    odds: makeOdds(bttsOver25),
    market: "BTTS + goals",
    suggestion: suggest(bttsOver25),
    rationale: note("Mutual scoring with elevated total pace beyond 2.5."),
  });
  combos.push({
    outcome: "BTTS Yes + Under 2.5",
    probability: pct(bttsUnder25),
    odds: makeOdds(bttsUnder25),
    market: "BTTS + goals",
    suggestion: suggest(bttsUnder25),
    rationale: note("Rare scenario where both score yet totals cap below three."),
  });
  combos.push({
    outcome: "No Team To Score",
    probability: pct(noTeamScore),
    odds: makeOdds(noTeamScore),
    market: "specials",
    suggestion: suggest(noTeamScore),
    rationale: note("Requires suppressed creation and finishing; lower likelihood."),
  });

  return combos;
}

/* ------------------------------ Predict route — full outputs ------------------------------ */
app.post("/predict", async (req, res, next) => {
  try {
    const { homeTeam, awayTeam, league } = req.body;

    if (!homeTeam || !awayTeam || !league) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Baseline AI anchors (replace with your model outputs when ready)
    const aiBase = {
      homeWin: 31,
      draw: 29,
      awayWin: 40,
      btts: 65,
      over25: 58,
      firstHalfGoals: 50,
      cornersHigh: 42,
      cardsHigh: 58,
    };

    const expertData = await fetchExpertData(homeTeam, awayTeam, league);
    const adjusted = adjustProbabilities(aiBase, expertData);
    const totals = deriveTotals(adjusted);
    const firstHalf = deriveFirstHalf(adjusted);
    const fulltime = deriveFulltime(adjusted);
    const combos = composeDoubleChanceCombos(fulltime.dc, totals, adjusted.btts);

    // Compose your rich prediction object here, just as in your long code block
    const prediction = {
      match: `${homeTeam} vs ${awayTeam} (${league})`,
      source: "Blended AI model + expert consensus",
      methodology:
        "Probabilities blended from AI baselines and expert tempo/game‑state assessments. Not live yet — replace stubs with real APIs to go live.",
      predictions: [
        {
          market: "Full Time Result",
          probability: adjusted.homeWin,
          confidence: suggest(adjusted.homeWin),
          rationale: `${homeTeam}'s home strength vs ${awayTeam}'s away volatility`
        },
        {
          market: "Over 2.5 Goals",
          probability: adjusted.over25,
          confidence: suggest(adjusted.over25),
          rationale: "Both teams average over 2 goals per game"
        },
        {
          market: "Both Teams to Score",
          probability: adjusted.btts,
          confidence: suggest(adjusted.btts),
          rationale: `${homeTeam} and ${awayTeam} have consistent attacking metrics.`
        }
      ],
      combos,
      expert_notes: expertData.expert_notes || [],
      // ...add more fields as in your long block if needed
    };

    res.json(prediction);
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ Global error handler ------------------------------ */
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ success: false, error: message });
});

/* ------------------------------ Start server ------------------------------ */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

