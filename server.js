// server.js — Render backend (Express, CORS, expanded markets, combos, expert rationales, legend, frontend-aligned arrays)

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;

/* ------------------------------
   Middleware
------------------------------ */
app.use(express.json());

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://sports-frontend-two.vercel.app",
      // Vercel preview domains
      "https://sports-frontend-git-main-stephens-projects-e3dd898a.vercel.app",
      "https://sports-frontend-i99wuubs0-stephens-projects-e3dd898a.vercel.app",
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

/* ------------------------------
   Health check
------------------------------ */
app.get("/", (req, res) => {
  res.send("Sports Prediction Backend is LIVE");
});

/* ------------------------------
   Expert data stub (replace later with real APIs)
------------------------------ */
async function fetchExpertData(home, away, league) {
  // Replace this with real API calls (team form, odds, injuries) to go “live”
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
      "Midfield duels increase booking risk."
    ],
  };
}

/* ------------------------------
   Blending logic (AI base + expert consensus)
------------------------------ */
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

/* ------------------------------
   Utilities
------------------------------ */
const pct = (n) => `${Math.max(0, Math.min(100, Math.round(n)))}%`;
const suggest = (p) => (p >= 70 ? "High" : p >= 50 ? "Medium" : "Low");
const note = (text) => text;

function makeOdds(probPercent) {
  // Simple inverse probability -> capped decimal odds
  const p = Math.max(1, Math.min(99, probPercent)) / 100;
  const dec = Math.max(1.1, Math.min(10.0, 1 / p));
  return dec.toFixed(2);
}

/* ------------------------------
   Derive market lines from anchors
------------------------------ */
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
  const under = Object.fromEntries(Object.entries(over).map(([k, v]) => [k, Math.max(0, 100 - v)]));
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
  // First-half 1X2 flattening
  const home = Math.round(adjusted.homeWin * 0.9);
  const draw = Math.round(adjusted.draw * 1.2);
  const away = Math.round(adjusted.awayWin * 0.9);
  return { over, under, fh1x2: { home, draw, away } };
}

function deriveFulltime(adjusted) {
  const oneX2 = { home: adjusted.homeWin, draw: adjusted.draw, away: adjusted.awayWin };
  const dc = {
    "1X": Math.max(0, Math.min(100, oneX2.home + oneX2.draw)),
    "X2": Math.max(0, Math.min(100, oneX2.draw + oneX2.away)),
    "12": Math.max(0, Math.min(100, oneX2.home + oneX2.away)),
  };
  return { oneX2, dc };
}

/* ------------------------------
   Compose combos
------------------------------ */
function composeDoubleChanceCombos(dc, totals, btts) {
  const lines = [1.5, 2.5, 3.5, 4.5, 5.5];
  const combos = [];

  // DC + Over/Under
  for (const key of ["1X", "X2", "12"]) {
    for (const l of lines) {
      const pOver = Math.round((dc[key] * 0.5 + totals.over[l] * 0.5));
      const pUnder = Math.round((dc[key] * 0.5 + totals.under[l] * 0.5));
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

  // DC + BTTS
  const pYes = Math.round((btts * 0.6 + 60 * 0.4));
  const pNo = Math.max(0, 100 - pYes);
  for (const key of ["1X", "X2", "12"]) {
    const pComboYes = Math.round((dc[key] * 0.5 + pYes * 0.5));
    const pComboNo = Math.round((dc[key] * 0.5 + pNo * 0.5));
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

  // BTTS + Over/Under 2.5 plus “No Team To Score”
  const over25 = totals.over[2.5];
  const under25 = totals.under[2.5];
  const bttsOver25 = Math.round((btts * 0.55 + over25 * 0.45));
  const bttsUnder25 = Math.round((btts * 0.45 + under25 * 0.55));
  const noTeamScore = Math.round((Math.max(0, 100 - btts) * 0.8 + under25 * 0.2));

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

/* ------------------------------
   Predict route — full outputs
------------------------------ */
app.post("/predict", async (req, res, next) => {
  try {
    const { homeTeam, awayTeam, league } = req.body;

    if (!homeTeam || !awayTeam || !league) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: homeTeam, awayTeam, league",
      });
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

    /* ------------------------------
       Frontend-aligned arrays (tabs)
    ------------------------------ */

    // GOALS: Over/Under 0.5–5.5, BTTS, exact
    const goals = [
      { outcome: "Over 0.5 Goals", probability: pct(totals.over[0.5]), odds: makeOdds(totals.over[0.5]), market: "goals", suggestion: suggest(totals.over[0.5]), rationale: note("High over trend from AI totals anchor; experts expect early chances.") },
      { outcome: "Under 0.5 Goals", probability: pct(totals.under[0.5]), odds: makeOdds(totals.under[0.5]), market: "goals", suggestion: suggest(totals.under[0.5]), rationale: note("Clean‑sheet stalemate requires suppressed chance quality.") },

      { outcome: "Over 1.5 Goals", probability: pct(totals.over[1.5]), odds: makeOdds(totals.over[1.5]), market: "goals", suggestion: suggest(totals.over[1.5]), rationale: note("Two‑goal threshold likely given shot volume and conversion rates.") },
      { outcome: "Under 1.5 Goals", probability: pct(totals.under[1.5]), odds: makeOdds(totals.under[1.5]), market: "goals", suggestion: suggest(totals.under[1.5]), rationale: note("Requires slow tempo and compactness; lower consensus.") },

      { outcome: "Over 2.5 Goals", probability: pct(totals.over[2.5]), odds: makeOdds(totals.over[2.5]), market: "goals", suggestion: suggest(totals.over[2.5]), rationale: note("Primary total benchmark combining model baseline and expert tempo.") },
      { outcome: "Under 2.5 Goals", probability: pct(totals.under[2.5]), odds: makeOdds(totals.under[2.5]), market: "goals", suggestion: suggest(totals.under[2.5]), rationale: note("Live if finishing drops or game state slows; less favored.") },

      { outcome: "Over 3.5 Goals", probability: pct(totals.over[3.5]), odds: makeOdds(totals.over[3.5]), market: "goals", suggestion: suggest(totals.over[3.5]), rationale: note("Higher variance outcome supported by recent defensive metrics.") },
      { outcome: "Under 3.5 Goals", probability: pct(totals.under[3.5]), odds: makeOdds(totals.under[3.5]), market: "goals", suggestion: suggest(totals.under[3.5]), rationale: note("If control and compactness dominate, totals cap below four.") },

      { outcome: "Over 4.5 Goals", probability: pct(totals.over[4.5]), odds: makeOdds(totals.over[4.5]), market: "goals", suggestion: suggest(totals.over[4.5]), rationale: note("Aggressive scoring scenario requires early goal timing alignment.") },
      { outcome: "Under 4.5 Goals", probability: pct(totals.under[4.5]), odds: makeOdds(totals.under[4.5]), market: "goals", suggestion: suggest(totals.under[4.5]), rationale: note("Base expectation below five; safer consensus.") },

      { outcome: "Over 5.5 Goals", probability: pct(totals.over[5.5]), odds: makeOdds(totals.over[5.5]), market: "goals", suggestion: suggest(totals.over[5.5]), rationale: note("Rare shootout scenario with chaotic game states.") },
      { outcome: "Under 5.5 Goals", probability: pct(totals.under[5.5]), odds: makeOdds(totals.under[5.5]), market: "goals", suggestion: suggest(totals.under[5.5]), rationale: note("Standard progression keeps totals below six almost always.") },

      { outcome: "BTTS Yes", probability: pct(adjusted.btts), odds: makeOdds(adjusted.btts), market: "goals", suggestion: suggest(adjusted.btts), rationale: note("Both teams generate on‑target chances; mutual scoring likely.") },
      { outcome: "BTTS No", probability: pct(100 - adjusted.btts), odds: makeOdds(100 - adjusted.btts), market: "goals", suggestion: suggest(100 - adjusted.btts), rationale: note("Single‑sided control or poor finishing required.") },

      { outcome: "Exactly 2 Goals", probability: "25%", odds: makeOdds(25), market: "goals", suggestion: suggest(25), rationale: note("Mode near two given midline totals; fragile to early goals.") },
      { outcome: "Exactly 3 Goals", probability: "20%", odds: makeOdds(20), market: "goals", suggestion: suggest(20), rationale: note("Secondary mode near three with BTTS support.") },
    ];

    // HALFTIME: 1H 1X2, 1H Double Chance, 1H Over/Under, 1H BTTS
    const halftime = [
      { outcome: "1st Half Home", probability: pct(firstHalf.fh1x2.home), odds: makeOdds(firstHalf.fh1x2.home), market: "halftime 1X2", suggestion: suggest(firstHalf.fh1x2.home), rationale: note("Early pressure pattern favors home starts.") },
      { outcome: "1st Half Draw", probability: pct(firstHalf.fh1x2.draw), odds: makeOdds(firstHalf.fh1x2.draw), market: "halftime 1X2", suggestion: suggest(firstHalf.fh1x2.draw), rationale: note("Cagey opening expected; compact mid‑blocks.") },
      { outcome: "1st Half Away", probability: pct(firstHalf.fh1x2.away), odds: makeOdds(firstHalf.fh1x2.away), market: "halftime 1X2", suggestion: suggest(firstHalf.fh1x2.away), rationale: note("Away transitions viable early via flanks.") },

      { outcome: "1st Half 1X (Home or Draw)", probability: pct(Math.min(100, firstHalf.fh1x2.home + firstHalf.fh1x2.draw)), odds: makeOdds(Math.min(100, firstHalf.fh1x2.home + firstHalf.fh1x2.draw)), market: "halftime double chance", suggestion: suggest(Math.min(100, firstHalf.fh1x2.home + firstHalf.fh1x2.draw)), rationale: note("Conservative cover for early control.") },
      { outcome: "1st Half X2 (Draw or Away)", probability: pct(Math.min(100, firstHalf.fh1x2.draw + firstHalf.fh1x2.away)), odds: makeOdds(Math.min(100, firstHalf.fh1x2.draw + firstHalf.fh1x2.away)), market: "halftime double chance", suggestion: suggest(Math.min(100, firstHalf.fh1x2.draw + firstHalf.fh1x2.away)), rationale: note("Protection against swift transitions.") },

      { outcome: "1st Half Over 0.5 Goals", probability: pct(firstHalf.over[0.5]), odds: makeOdds(firstHalf.over[0.5]), market: "halftime goals", suggestion: suggest(firstHalf.over[0.5]), rationale: note("Strong chance of at least one before the break.") },
      { outcome: "1st Half Under 0.5 Goals", probability: pct(firstHalf.under[0.5]), odds: makeOdds(firstHalf.under[0.5]), market: "halftime goals", suggestion: suggest(firstHalf.under[0.5]), rationale: note("Requires suppressed finishing; low consensus.") },

      { outcome: "1st Half Over 1.5 Goals", probability: pct(firstHalf.over[1.5]), odds: makeOdds(firstHalf.over[1.5]), market: "halftime goals", suggestion: suggest(firstHalf.over[1.5]), rationale: note("Two before HT plausible in high‑tempo scenarios.") },
      { outcome: "1st Half Under 1.5 Goals", probability: pct(firstHalf.under[1.5]), odds: makeOdds(firstHalf.under[1.5]), market: "halftime goals", suggestion: suggest(firstHalf.under[1.5]), rationale: note("Base expectation leans under unless early momentum spikes.") },

      { outcome: "1st Half BTTS Yes", probability: pct(Math.round(adjusted.btts * 0.7)), odds: makeOdds(Math.round(adjusted.btts * 0.7)), market: "halftime BTTS", suggestion: suggest(Math.round(adjusted.btts * 0.7)), rationale: note("Creation emerges early; conversion may lag.") },
      { outcome: "1st Half BTTS No", probability: pct(Math.round((100 - adjusted.btts) * 1.1)), odds: makeOdds(Math.round((100 - adjusted.btts) * 1.1)), market: "halftime BTTS", suggestion: suggest(Math.round((100 - adjusted.btts) * 1.1)), rationale: note("Single‑sided control more common in first halves.") },
    ];

    // CORNERS: FT totals, HT totals, team corners
    const corners = [
      { outcome: "FT Over 9.5 Corners", probability: pct(adjusted.cornersHigh), odds: makeOdds(adjusted.cornersHigh), market: "corners total", suggestion: suggest(adjusted.cornersHigh), rationale: note("Crossing volume and set‑piece frequency indicate high corners.") },
      { outcome: "FT Under 9.5 Corners", probability: pct(100 - adjusted.cornersHigh), odds: makeOdds(100 - adjusted.cornersHigh), market: "corners total", suggestion: suggest(100 - adjusted.cornersHigh), rationale: note("Requires lower width and fewer blocked shots.") },

      { outcome: "1H Over 4.5 Corners", probability: "49%", odds: makeOdds(49), market: "corners halftime", suggestion: suggest(49), rationale: note("Early width utilization drives first‑half corners.") },
      { outcome: "1H Under 4.5 Corners", probability: "51%", odds: makeOdds(51), market: "corners halftime", suggestion: suggest(51), rationale: note("Compact shapes reduce early corner generation.") },

      { outcome: "Home Over 4.5 Corners", probability: "51%", odds: makeOdds(51), market: "corners team", suggestion: suggest(51), rationale: note("Home crossing preference and overlap patterns.") },
      { outcome: "Away Over 4.5 Corners", probability: "47%", odds: makeOdds(47), market: "corners team", suggestion: suggest(47), rationale: note("Away counters force blocks and saves.") },
    ];

    // CARDS: HT/FT totals, player card risk
    const cards = [
      { outcome: "HT Over 1.5 Cards", probability: pct(Math.round(adjusted.cardsHigh * 0.92)), odds: makeOdds(Math.round(adjusted.cardsHigh * 0.92)), market: "cards halftime", suggestion: suggest(Math.round(adjusted.cardsHigh * 0.92)), rationale: note("Aggressive pressing leads to tactical fouls pre‑HT.") },
      { outcome: "HT Under 1.5 Cards", probability: pct(Math.round(100 - adjusted.cardsHigh * 0.92)), odds: makeOdds(Math.round(100 - adjusted.cardsHigh * 0.92)), market: "cards halftime", suggestion: suggest(Math.round(100 - adjusted.cardsHigh * 0.92)), rationale: note("Disciplined openings keep bookings low.") },

      { outcome: "FT Over 3.5 Cards", probability: pct(adjusted.cardsHigh), odds: makeOdds(adjusted.cardsHigh), market: "cards total", suggestion: suggest(adjusted.cardsHigh), rationale: note("Match tension elevates booking risk over 90 minutes.") },
      { outcome: "FT Under 3.5 Cards", probability: pct(100 - adjusted.cardsHigh), odds: makeOdds(100 - adjusted.cardsHigh), market: "cards total", suggestion: suggest(100 - adjusted.cardsHigh), rationale: note("Cleaner game with fewer disruptions and set‑pieces.") },

      { outcome: "Player A booked", probability: "40%", odds: makeOdds(40), market: "player cards", suggestion: suggest(40), rationale: note("Role matched to defensive duels; historical booking rate near 0.3 per game.") },
    ];

    // HANDICAPS: Asian + European + expose Double Chance in tab
    const handicaps = [
      { outcome: "Asian Home -0.5", probability: pct(Math.round(fulltime.oneX2.home * 1.05)), odds: makeOdds(Math.round(fulltime.oneX2.home * 1.05)), market: "asian handicap", suggestion: suggest(Math.round(fulltime.oneX2.home * 1.05)), rationale: note("Home edge aligned with win‑only condition; fair price.") },
      { outcome: "Asian Away +0.5", probability: pct(Math.round(fulltime.oneX2.away * 1.05)), odds: makeOdds(Math.round(fulltime.oneX2.away * 1.05)), market: "asian handicap", suggestion: suggest(Math.round(fulltime.oneX2.away * 1.05)), rationale: note("Underdog protection; value if transitions bite.") },

      { outcome: "Home -1 (European)", probability: "33%", odds: makeOdds(33), market: "european handicap", suggestion: suggest(33), rationale: note("Requires two‑goal margin; achievable with early lead.") },
      { outcome: "Away +1 (European)", probability: "48%", odds: makeOdds(48), market: "european handicap", suggestion: suggest(48), rationale: note("Coverage against narrow home win; steady consensus.") },
      { outcome: "Draw Handicap", probability: "19%", odds: makeOdds(19), market: "european handicap", suggestion: suggest(19), rationale: note("Balanced outcome around single‑goal margins.") },

      { outcome: "Double Chance 1X", probability: pct(fulltime.dc["1X"]), odds: makeOdds(fulltime.dc["1X"]), market: "double chance", suggestion: suggest(fulltime.dc["1X"]), rationale: note("Safest protection leveraging home/draw probabilities.") },
      { outcome: "Double Chance X2", probability: pct(fulltime.dc["X2"]), odds: makeOdds(fulltime.dc["X2"]), market: "double chance", suggestion: suggest(fulltime.dc["X2"]), rationale: note("Good cover if away transitions outperform.") },
      { outcome: "Double Chance 12", probability: pct(fulltime.dc["12"]), odds: makeOdds(fulltime.dc["12"]), market: "double chance", suggestion: suggest(fulltime.dc["12"]), rationale: note("Win either way; strong if draw probability suppressed.") },
    ];

    /* ------------------------------
       Full, rich sections for export
    ------------------------------ */
    const prediction = {
      match: `${homeTeam} vs ${awayTeam} (${league})`,
      source: "Blended AI model + expert consensus",
      methodology: "Probabilities blended from AI baselines and expert tempo/game‑state assessments. Not live yet — replace stubs with real APIs to go live.",

      all: {
        fulltime_result: [
          { outcome: "Home Win", probability: pct(fulltime.oneX2.home), odds: makeOdds(fulltime.oneX2.home), suggestion: suggest(fulltime.oneX2.home) },
          { outcome: "Draw", probability: pct(fulltime.oneX2.draw), odds: makeOdds(fulltime.oneX2.draw), suggestion: suggest(fulltime.oneX2.draw) },
          { outcome: "Away Win", probability: pct(fulltime.oneX2.away), odds: makeOdds(fulltime.oneX2.away), suggestion: suggest(fulltime.oneX2.away) }
        ],
        double_chance: {
          "1X": pct(fulltime.dc["1X"]),
          "X2": pct(fulltime.dc["X2"]),
          "12": pct(fulltime.dc["12"]),
        },
        over_under_goals: {
          "Over 0.5": pct(totals.over[0.5]),
          "Over 1.5": pct(totals.over[1.5]),
          "Over 2.5": pct(totals.over[2.5]),
          "Over 3.5": pct(totals.over[3.5]),
          "Over 4.5": pct(totals.over[4.5]),
          "Over 5.5": pct(totals.over[5.5]),
          "Under 0.5": pct(totals.under[0.5]),
          "Under 1.5": pct(totals.under[1.5]),
          "Under 2.5": pct(totals.under[2.5]),
          "Under 3.5": pct(totals.under[3.5]),
          "Under 4.5": pct(totals.under[4.5]),
          "Under 5.5": pct(totals.under[5.5]),
        },
        halftime_markets: {
          "1H 1X2": { Home: pct(firstHalf.fh1x2.home), Draw: pct(firstHalf.fh1x2.draw), Away: pct(firstHalf.fh1x2.away) },
          "1H Double Chance": {
            "1X": pct(Math.min(100, firstHalf.fh1x2.home + firstHalf.fh1x2.draw)),
            "X2": pct(Math.min(100, firstHalf.fh1x2.draw + firstHalf.fh1x2.away)),
          },
          "1H Over/Under": {
            "Over 0.5": pct(firstHalf.over[0.5]),
            "Over 1.5": pct(firstHalf.over[1.5]),
            "Under 0.5": pct(firstHalf.under[0.5]),
            "Under 1.5": pct(firstHalf.under[1.5]),
          },
          "1H BTTS": { Yes: pct(Math.round(adjusted.btts * 0.7)), No: pct(Math.round((100 - adjusted.btts) * 1.1)) },
        },
        corners: {
          "FT Over 9.5": pct(adjusted.cornersHigh),
          "FT Under 9.5": pct(100 - adjusted.cornersHigh),
          "1H Over 4.5": "49%",
          "1H Under 4.5": "51%",
          "Home Over 4.5": "51%",
          "Away Over 4.5": "47%",
        },
        cards: {
          "HT Over 1.5": pct(Math.round(adjusted.cardsHigh * 0.92)),
          "HT Under 1.5": pct(Math.round(100 - adjusted.cardsHigh * 0.92)),
          "FT Over 3.5": pct(adjusted.cardsHigh),
          "FT Under 3.5": pct(100 - adjusted.cardsHigh),
        },
        handicap: {
          "Asian Home -0.5": pct(Math.round(fulltime.oneX2.home * 1.05)),
          "Asian Away +0.5": pct(Math.round(fulltime.oneX2.away * 1.05)),
          "Home -1": "33%",
          "Away +1": "48%",
          "Draw Handicap": "19%",
        },
        combos: combos.map(c => ({ outcome: c.outcome, probability: c.probability, odds: c.odds, market: c.market, suggestion: c.suggestion })),
        scorers: ["Likely home striker (~45–50%)", "Away winger (~35–40%)"],
        halftime_fulltime: "Home/Home (~25–28%)",
      },

      popular: {
        double_chance: "1X (Home or Draw safest ~60%)",
        double_chance_btts: "1X + BTTS Yes (~40–45%)",
        over_2_5_goals: pct(totals.over[2.5]),
        btts: `Yes (${pct(adjusted.btts)})`,
      },

      winner: {
        halftime_fulltime: "Home/Home (~25–28%)",
        double_chance: ["1X", "X2", "12"],
      },

      bookings: {
        halftime: { "Over 1.5": pct(Math.round(adjusted.cardsHigh * 0.92)), "Under 1.5": pct(Math.round(100 - adjusted.cardsHigh * 0.92)) },
        fulltime: { "Over 3.5": pct(adjusted.cardsHigh), "Under 3.5": pct(100 - adjusted.cardsHigh) },
        player_cards: ["Player A booked", "Player B sent off"],
      },

      goals_detail: {
        team_goals: { "Home Over 1.5": "62%", "Away Over 1.5": "55%" },
        exact_goals: { "Exactly 2": "25%", "Exactly 3": "20%" },
        btts: `Yes (${pct(adjusted.btts)})`,
      },

      halves: {
        halftime_result: "Home ~35%",
        second_half_result: "Away ~40%",
        halftime_goals: { "Over 1.5": "48%", "Under 1.5": "52%" },
      },

      corners_detail: {
        total: { "Over 9.5": pct(adjusted.cornersHigh), "Under 9.5": pct(100 - adjusted.cornersHigh) },
        team: { "Home Over 4.5": "51%", "Away Over 4.5": "47%" },
        handicap: { "Home +2": "55%", "Away +2": "45%" },
      },

      scores: {
        correct_score: ["1–0", "2–1", "2–2"],
        scorecast: "2–1 + home striker",
        multiscore: "2–3 goals total",
      },

      handicaps_detail: {
        asian: { "Home -1": "33%", "Away +1": "48%" },
        european: { "Home win by 2": "22%" },
      },

      teams: {
        specials: ["Home to score first", "Away to win both halves"],
        totals: { "Home goals": "62%", "Away goals": "55%" },
        clean_sheet: { "Home clean sheet": "40%", "Away clean sheet": "35%" },
      },

      player_specials: {
        anytime_scorer: ["Home striker", "Away winger"],
        first_scorer: "Home striker",
        last_scorer: "Away winger",
        player_cards: ["Player A booked", "Player B sent off"],
      },
    };

    /* ------------------------------
       Legend for UI explanations
    ------------------------------ */
    const legend = {
      fulltime_result: "1X2 market: Home Win, Draw, Away Win.",
      double_chance: "Cover two outcomes: 1X (Home or Draw), X2 (Draw or Away), 12 (Home or Away).",
      double_chance_btts: "Double Chance combined with Both Teams To Score (Yes/No).",
      double_chance_goals: "Double Chance combined with Over/Under goals thresholds (1.5–5.5).",
      btts_goals: "Both Teams To Score combined with Over/Under 2.5.",
      no_team_to_score: "Special case: neither team scores.",
      over_under_goals: "Total goals thresholds: 0.5, 1.5, 2.5, 3.5, 4.5, 5.5.",
      halftime_markets: "First-half markets: 1H 1X2, 1H Double Chance, 1H Over/Under, 1H BTTS.",
      corners: "Corner markets: FT totals, HT totals, team corners.",
      cards: "Card markets: HT/FT totals, player bookings.",
      handicaps: "Asian and European handicap lines.",
      confidence_scale: "High ≥ 70%, Medium 50–69%, Low < 50%.",
      methodology: "Blended AI anchors + expert consensus (not live yet). Replace stubs with real APIs to go live.",
    };

    /* ------------------------------
       Return both: tab arrays + full object + legend
    ------------------------------ */
    res.json({
      ...prediction,
      goals,
      halftime,
      corners,
      cards,
      handicaps,
      combos, // include full combos array for UI if needed
      expert_notes: expertData.expert_notes || [],
      legend,
    });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------
   Global error handler
------------------------------ */
app.use((err, req, res, next) => {
  console.error(err.stack);
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ success: false, error: message });
});

/* ------------------------------
   Start server
------------------------------ */
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
