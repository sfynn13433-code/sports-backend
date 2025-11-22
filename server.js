// server.js — Render backend (Express, CORS, expanded outcomes, expert rationales, frontend-aligned arrays)

const express = require("express");
const cors = require("cors");

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
   Expert data stub (replace later)
------------------------------ */
async function fetchExpertData(home, away, league) {
  // Keep this stub; swap with real expert/API later
  return {
    expert_win: 35,
    expert_draw: 30,
    expert_away: 35,
    expert_btts: 68,
    expert_over25: 60,
    expert_first_half_goals: 52,
    expert_corners_high: 44,
    expert_cards_high: 60,
  };
}

/* ------------------------------
   Blending logic (model + expert)
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
   Utility: odds/labels/rationales
------------------------------ */
function rationale(text) {
  // Keep rationales concise but informative for UI “expert note”
  return text;
}

function pct(n) {
  return `${Math.max(0, Math.min(100, n))}%`;
}

/* ------------------------------
   Predict route — returns BOTH:
   - frontend-aligned arrays (goals, halftime, corners, cards, handicaps)
   - full rich sections for completeness/export
------------------------------ */
app.post("/predict", async (req, res, next) => {
  try {
    const { homeTeam, awayTeam, league } = req.body;

    // Validation
    if (!homeTeam || !awayTeam || !league) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: homeTeam, awayTeam, league",
      });
    }

    // Baseline model
    const defaultModel = {
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
    const adjusted = adjustProbabilities(defaultModel, expertData);

    // Derive related lines from anchors (simple monotonic curve for now)
    const overProb = {
      0.5: Math.max(70, adjusted.over25 + 12),
      1.5: Math.max(62, adjusted.over25 + 4),
      2.5: adjusted.over25,
      3.5: Math.max(32, adjusted.over25 - 26),
      4.5: Math.max(22, adjusted.over25 - 36),
      5.5: Math.max(14, adjusted.over25 - 44),
    };
    const underProb = Object.fromEntries(
      Object.entries(overProb).map(([k, v]) => [k, Math.max(0, 100 - v)])
    );

    const bttsYes = adjusted.btts;
    const bttsNo = Math.max(0, 100 - bttsYes);

    const fhOver = {
      0.5: Math.max(58, adjusted.firstHalfGoals + 6),
      1.5: Math.max(46, adjusted.firstHalfGoals - 6),
    };
    const fhUnder = {
      0.5: Math.max(0, 100 - fhOver[0.5]),
      1.5: Math.max(0, 100 - fhOver[1.5]),
    };

    // 1X2 (fulltime)
    const oneX2 = {
      home: adjusted.homeWin,
      draw: adjusted.draw,
      away: adjusted.awayWin,
    };

    // Double chance (fulltime) from 1X2
    const dc = {
      "1X": Math.max(0, Math.min(100, oneX2.home + oneX2.draw)),
      "X2": Math.max(0, Math.min(100, oneX2.draw + oneX2.away)),
      "12": Math.max(0, Math.min(100, oneX2.home + oneX2.away)),
    };

    // First-half 1X2: proportional to fulltime but flatter
    const fh1x2 = {
      home: Math.round(oneX2.home * 0.9),
      draw: Math.round(oneX2.draw * 1.2),
      away: Math.round(oneX2.away * 0.9),
    };

    // Categorical suggestion
    const suggest = (p) => (p >= 70 ? "High" : p >= 50 ? "Medium" : "Low");

    /* ------------------------------
       Frontend-aligned arrays (tabs)
    ------------------------------ */

    // GOALS: Over/Under 0.5–5.5 + BTTS + exact goals
    const goals = [
      { outcome: "Over 0.5 Goals", probability: pct(overProb[0.5]), odds: "1.12", market: "goals", suggestion: suggest(overProb[0.5]), rationale: rationale("High over trend based on AI total-goals anchor and expert match tempo.") },
      { outcome: "Under 0.5 Goals", probability: pct(underProb[0.5]), odds: "8.50", market: "goals", suggestion: suggest(underProb[0.5]), rationale: rationale("Low-likelihood clean-sheet stalemate per model; experts note Chelsea's chance creation.") },

      { outcome: "Over 1.5 Goals", probability: pct(overProb[1.5]), odds: "1.35", market: "goals", suggestion: suggest(overProb[1.5]), rationale: rationale("Two-goal threshold likely given shot volume and conversion rates.") },
      { outcome: "Under 1.5 Goals", probability: pct(underProb[1.5]), odds: "3.30", market: "goals", suggestion: suggest(underProb[1.5]), rationale: rationale("Requires suppressed chance quality; experts see moderate risk.") },

      { outcome: "Over 2.5 Goals", probability: pct(overProb[2.5]), odds: "1.60", market: "goals", suggestion: suggest(overProb[2.5]), rationale: rationale("Primary total benchmark combining model baseline and expert tempo.") },
      { outcome: "Under 2.5 Goals", probability: pct(underProb[2.5]), odds: "2.40", market: "goals", suggestion: suggest(underProb[2.5]), rationale: rationale("Live if finishing drops or game state slows; experts less convinced.") },

      { outcome: "Over 3.5 Goals", probability: pct(overProb[3.5]), odds: "2.30", market: "goals", suggestion: suggest(overProb[3.5]), rationale: rationale("Higher variance outcome supported by recent defensive metrics.") },
      { outcome: "Under 3.5 Goals", probability: pct(underProb[3.5]), odds: "1.60", market: "goals", suggestion: suggest(underProb[3.5]), rationale: rationale("If control and compactness dominate, totals cap below four.") },

      { outcome: "Over 4.5 Goals", probability: pct(overProb[4.5]), odds: "3.70", market: "goals", suggestion: suggest(overProb[4.5]), rationale: rationale("Aggressive scoring scenario; requires early goal timing alignment.") },
      { outcome: "Under 4.5 Goals", probability: pct(underProb[4.5]), odds: "1.30", market: "goals", suggestion: suggest(underProb[4.5]), rationale: rationale("Base expectation below five; experts view under as safer.") },

      { outcome: "Over 5.5 Goals", probability: pct(overProb[5.5]), odds: "6.20", market: "goals", suggestion: suggest(overProb[5.5]), rationale: rationale("Rare shootout scenario; only viable with chaotic game states.") },
      { outcome: "Under 5.5 Goals", probability: pct(underProb[5.5]), odds: "1.14", market: "goals", suggestion: suggest(underProb[5.5]), rationale: rationale("Standard progression keeps total below six almost always.") },

      { outcome: "BTTS Yes", probability: pct(bttsYes), odds: "1.70", market: "goals", suggestion: suggest(bttsYes), rationale: rationale("Both teams generating on-target chances; experts cite Chelsea’s pressing lanes.") },
      { outcome: "BTTS No", probability: pct(bttsNo), odds: "2.00", market: "goals", suggestion: suggest(bttsNo), rationale: rationale("Requires one-sided control or poor finishing; lower consensus support.") },

      { outcome: "Exactly 2 Goals", probability: "25%", odds: "3.00", market: "goals", suggestion: suggest(25), rationale: rationale("Mode near two given midline totals; fragile to early goals.") },
      { outcome: "Exactly 3 Goals", probability: "20%", odds: "3.90", market: "goals", suggestion: suggest(20), rationale: rationale("Second mode near three with BTTS support.") },
    ];

    // HALFTIME: First-half 1X2, Double Chance, Over/Under, BTTS
    const halftime = [
      { outcome: "1st Half Home", probability: pct(fh1x2.home), odds: "2.80", market: "halftime 1X2", suggestion: suggest(fh1x2.home), rationale: rationale("Early pressure pattern favors home starts per AI tempo and expert coaching notes.") },
      { outcome: "1st Half Draw", probability: pct(fh1x2.draw), odds: "2.10", market: "halftime 1X2", suggestion: suggest(fh1x2.draw), rationale: rationale("Cagey opening expected; mid-block structures slow chance quality.") },
      { outcome: "1st Half Away", probability: pct(fh1x2.away), odds: "2.90", market: "halftime 1X2", suggestion: suggest(fh1x2.away), rationale: rationale("Away transitions viable early; experts highlight flank overloads.") },

      { outcome: "1st Half 1X (Home or Draw)", probability: pct(Math.min(100, fh1x2.home + fh1x2.draw)), odds: "1.55", market: "halftime double chance", suggestion: suggest(Math.min(100, fh1x2.home + fh1x2.draw)), rationale: rationale("Protection against away bursts, aligned with conservative first-half modeling.") },
      { outcome: "1st Half X2 (Draw or Away)", probability: pct(Math.min(100, fh1x2.draw + fh1x2.away)), odds: "1.65", market: "halftime double chance", suggestion: suggest(Math.min(100, fh1x2.draw + fh1x2.away)), rationale: rationale("Edges for draw/away roots in transition metrics.") },

      { outcome: "1st Half Over 0.5 Goals", probability: pct(fhOver[0.5]), odds: "1.55", market: "halftime goals", suggestion: suggest(fhOver[0.5]), rationale: rationale("Strong chance of at least one before the break per shot pace.") },
      { outcome: "1st Half Under 0.5 Goals", probability: pct(fhUnder[0.5]), odds: "2.70", market: "halftime goals", suggestion: suggest(fhUnder[0.5]), rationale: rationale("Requires suppressed finishing; low consensus from experts.") },

      { outcome: "1st Half Over 1.5 Goals", probability: pct(fhOver[1.5]), odds: "2.30", market: "halftime goals", suggestion: suggest(fhOver[1.5]), rationale: rationale("Two before HT plausible in high-tempo scenarios.") },
      { outcome: "1st Half Under 1.5 Goals", probability: pct(fhUnder[1.5]), odds: "1.55", market: "halftime goals", suggestion: suggest(fhUnder[1.5]), rationale: rationale("Base expectation leans under unless early momentum spikes.") },

      { outcome: "1st Half BTTS Yes", probability: pct(Math.round(bttsYes * 0.7)), odds: "2.40", market: "halftime BTTS", suggestion: suggest(Math.round(bttsYes * 0.7)), rationale: rationale("Both create early but conversion may lag; moderate support.") },
      { outcome: "1st Half BTTS No", probability: pct(Math.round(bttsNo * 1.1)), odds: "1.55", market: "halftime BTTS", suggestion: suggest(Math.round(bttsNo * 1.1)), rationale: rationale("Single-sided control more common in first halves.") },
    ];

    // CORNERS: FT totals, HT totals, team corners
    const corners = [
      { outcome: "Over 9.5 Corners", probability: pct(adjusted.cornersHigh), odds: "2.10", market: "corners total", suggestion: suggest(adjusted.cornersHigh), rationale: rationale("Crossing volume and set-piece frequency indicate high corner count.") },
      { outcome: "Under 9.5 Corners", probability: pct(100 - adjusted.cornersHigh), odds: "1.70", market: "corners total", suggestion: suggest(100 - adjusted.cornersHigh), rationale: rationale("Requires lower crossing tempo and fewer blocked shots.") },

      { outcome: "1st Half Over 4.5 Corners", probability: "49%", odds: "2.30", market: "corners halftime", suggestion: suggest(49), rationale: rationale("Early width utilization and pressure drive first-half corners.") },
      { outcome: "1st Half Under 4.5 Corners", probability: "51%", odds: "1.65", market: "corners halftime", suggestion: suggest(51), rationale: rationale("Compact shapes reduce early corner generation.") },

      { outcome: "Home Over 4.5 Corners", probability: "51%", odds: "1.95", market: "corners team", suggestion: suggest(51), rationale: rationale("Home-side crossing preference and overlap patterns.") },
      { outcome: "Away Over 4.5 Corners", probability: "47%", odds: "2.05", market: "corners team", suggestion: suggest(47), rationale: rationale("Away transitions yield counters and forced blocks.") },
    ];

    // CARDS: HT/FT totals, player card risk
    const cards = [
      { outcome: "HT Over 1.5 Cards", probability: pct(Math.round(adjusted.cardsHigh * 0.92)), odds: "1.90", market: "cards halftime", suggestion: suggest(Math.round(adjusted.cardsHigh * 0.92)), rationale: rationale("Aggressive pressing leads to tactical fouls before HT.") },
      { outcome: "HT Under 1.5 Cards", probability: pct(Math.round(100 - adjusted.cardsHigh * 0.92)), odds: "1.90", market: "cards halftime", suggestion: suggest(Math.round(100 - adjusted.cardsHigh * 0.92)), rationale: rationale("Disciplined opening halves keep bookings low.") },

      { outcome: "FT Over 3.5 Cards", probability: pct(adjusted.cardsHigh), odds: "1.80", market: "cards total", suggestion: suggest(adjusted.cardsHigh), rationale: rationale("Match tension and tactical rotations elevate booking risk.") },
      { outcome: "FT Under 3.5 Cards", probability: pct(100 - adjusted.cardsHigh), odds: "2.20", market: "cards total", suggestion: suggest(100 - adjusted.cardsHigh), rationale: rationale("Cleaner game with fewer disruptions and set-pieces.") },

      { outcome: "Player A booked", probability: "40%", odds: "3.00", market: "player cards", suggestion: suggest(40), rationale: rationale("Role matched to defensive duels; historical booking rate near 0.3 per game.") },
    ];

    // HANDICAPS: Asian + European
    const handicaps = [
      { outcome: "Asian Home -0.5", probability: pct(Math.round(oneX2.home * 1.05)), odds: "2.30", market: "asian handicap", suggestion: suggest(Math.round(oneX2.home * 1.05)), rationale: rationale("Home edge aligned with win-only condition; fair price.") },
      { outcome: "Asian Away +0.5", probability: pct(Math.round(oneX2.away * 1.05)), odds: "1.70", market: "asian handicap", suggestion: suggest(Math.round(oneX2.away * 1.05)), rationale: rationale("Underdog protection; value if transitions bite.") },

      { outcome: "Home -1 (European)", probability: "33%", odds: "2.80", market: "european handicap", suggestion: suggest(33), rationale: rationale("Requires two-goal margin; achievable with early lead.") },
      { outcome: "Away +1 (European)", probability: "48%", odds: "2.00", market: "european handicap", suggestion: suggest(48), rationale: rationale("Coverage against narrow home win; steady consensus.") },

      { outcome: "Draw Handicap", probability: "19%", odds: "3.20", market: "european handicap", suggestion: suggest(19), rationale: rationale("Balanced outcome around single-goal margin scenarios.") },

      // Double chance (fulltime) exposed here for tab coverage
      { outcome: "Double Chance 1X", probability: pct(dc["1X"]), odds: "1.35", market: "double chance", suggestion: suggest(dc["1X"]), rationale: rationale("Safest protection leveraging home/draw probabilities.") },
      { outcome: "Double Chance X2", probability: pct(dc["X2"]), odds: "1.45", market: "double chance", suggestion: suggest(dc["X2"]), rationale: rationale("Good cover if away transitions outperform.") },
      { outcome: "Double Chance 12", probability: pct(dc["12"]), odds: "1.32", market: "double chance", suggestion: suggest(dc["12"]), rationale: rationale("Win either way; strong if draw probability suppressed.") },
    ];

    /* ------------------------------
       Full, rich sections preserved
    ------------------------------ */
    const prediction = {
      match: `${homeTeam} vs ${awayTeam} (${league})`,
      source: "Blended AI model + expert consensus",
      methodology: "Probabilities blended from AI baselines and expert tempo/game-state assessments.",

      all: {
        fulltime_result: [
          { outcome: "Home Win", probability: pct(oneX2.home), odds: "2.80", suggestion: suggest(oneX2.home) },
          { outcome: "Draw", probability: pct(oneX2.draw), odds: "3.20", suggestion: suggest(oneX2.draw) },
          { outcome: "Away Win", probability: pct(oneX2.away), odds: "2.50", suggestion: suggest(oneX2.away) }
        ],
        double_chance: {
          "1X": pct(dc["1X"]),
          "X2": pct(dc["X2"]),
          "12": pct(dc["12"]),
        },
        over_under_goals: {
          "Over 0.5": pct(overProb[0.5]),
          "Over 1.5": pct(overProb[1.5]),
          "Over 2.5": pct(overProb[2.5]),
          "Over 3.5": pct(overProb[3.5]),
          "Over 4.5": pct(overProb[4.5]),
          "Over 5.5": pct(overProb[5.5]),
          "Under 0.5": pct(underProb[0.5]),
          "Under 1.5": pct(underProb[1.5]),
          "Under 2.5": pct(underProb[2.5]),
          "Under 3.5": pct(underProb[3.5]),
          "Under 4.5": pct(underProb[4.5]),
          "Under 5.5": pct(underProb[5.5]),
        },
        halftime_markets: {
          "1H 1X2": { Home: pct(fh1x2.home), Draw: pct(fh1x2.draw), Away: pct(fh1x2.away) },
          "1H Double Chance": { "1X": pct(Math.min(100, fh1x2.home + fh1x2.draw)), "X2": pct(Math.min(100, fh1x2.draw + fh1x2.away)) },
          "1H Over/Under": { "Over 0.5": pct(fhOver[0.5]), "Over 1.5": pct(fhOver[1.5]), "Under 0.5": pct(fhUnder[0.5]), "Under 1.5": pct(fhUnder[1.5]) },
          "1H BTTS": { Yes: pct(Math.round(bttsYes * 0.7)), No: pct(Math.round(bttsNo * 1.1)) },
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
          "Asian Home -0.5": pct(Math.round(oneX2.home * 1.05)),
          "Asian Away +0.5": pct(Math.round(oneX2.away * 1.05)),
          "Home -1": "33%",
          "Away +1": "48%",
          "Draw Handicap": "19%",
        },
        scorers: ["Liverpool striker likely (~45–50%)", "Arsenal winger possible (~35–40%)"],
        halftime_fulltime: "Home/Home (~25–28%)",
      },

      popular: {
        double_chance: "1X (Home win or draw safest ~60%)",
        double_chance_btts: "1X + BTTS Yes (~40–45%)",
        over_2_5_goals: pct(overProb[2.5]),
        btts: `Yes (${pct(bttsYes)})`,
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
        btts: `Yes (${pct(bttsYes)})`,
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
        scorecast: "2–1 + Liverpool striker",
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
        anytime_scorer: ["Liverpool striker", "Arsenal winger"],
        first_scorer: "Liverpool striker",
        last_scorer: "Arsenal winger",
        player_cards: ["Player A booked", "Player B sent off"],
      },

      combos: {
        double_chance_btts: "1X + BTTS Yes (~40–45%)",
        win_over_goals: "Home Win + Over 2.5",
        correct_score_scorer: "2–1 + Liverpool striker",
      },
    };

    // Return BOTH the frontend arrays and full object
    res.json({
      ...prediction,
      goals,
      halftime,
      corners,
      cards,
      handicaps,
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
