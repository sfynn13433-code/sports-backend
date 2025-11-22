const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware for CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Health check root route
app.get("/", (req, res) => {
  res.send("SKCS Sports Predictions backend is running.");
});

// Stub expert data function (replace with live integration later)
async function fetchExpertData(home, away, league) {
  // Example expert data for Burnley vs Chelsea
  return {
    expert_win: 61,
    expert_draw: 20,
    expert_away: 19,
    expert_btts: 61,
    expert_over25: 62,
    expert_first_half_goals: 54,
    expert_corners_high: 43,
    expert_cards_high: 58,
    expert_notes: [
      "Chelsea are away favorites with high scoring stats.",
      "Burnley tends to score at home, supporting BTTS.",
      "Likely scoreline: Chelsea 2–1 Burnley."
    ],
  };
}

// Blending logic (AI base + expert consensus)
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

// Utilities
const clampPct = (n) => Math.max(0, Math.min(100, Math.round(n)));
const pct = (n) => `${clampPct(n)}%`;
const suggest = (p) => (p >= 70 ? "High" : p >= 50 ? "Medium" : "Low");
const makeOdds = (probPercent) => {
  const p = Math.max(1, Math.min(99, probPercent)) / 100;
  const dec = Math.max(1.1, Math.min(10.0, 1 / p));
  return dec.toFixed(2);
};

// Predict route — full response for frontend
app.post("/predict", async (req, res, next) => {
  try {
    const { homeTeam, awayTeam, league } = req.body;

    if (!homeTeam || !awayTeam || !league) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Example: AI base probabilities (replace with ML model data if available)
    const aiBase = {
      homeWin: 20,
      draw: 19,
      awayWin: 61,
      btts: 59,
      over25: 60,
      firstHalfGoals: 53,
      cornersHigh: 40,
      cardsHigh: 56,
    };

    // Get expert inputs
    const expertData = await fetchExpertData(homeTeam, awayTeam, league);

    // Blend using your logic
    const adjusted = adjustProbabilities(aiBase, expertData);

    // 🔑 API-SPORTS stub (replace fixture ID with real one later)
    // Uncomment when ready to go live:
    /*
    const apiResponse = await axios.get("https://v3.football.api-sports.io/predictions", {
      headers: { "x-apisports-key": process.env.APISPORTS_KEY },
      params: { fixture: 12345 } // Replace with real fixture ID
    });
    const apiData = apiResponse.data.response[0];
    */

    // Core prediction response
    const prediction = {
      match: `${homeTeam} vs ${awayTeam} (${league})`,
      source: "Blended AI model + expert consensus",
      methodology:
        "Probabilities blended from AI baselines and expert tempo/game‑state assessments. Not live yet — replace stubs with real APIs to go live.",
      predictions: [
        {
          market: "Full Time Result",
          probability: adjusted.awayWin,
          confidence: suggest(adjusted.awayWin),
          rationale: `${awayTeam} are favorites based on recent form and scoring pace.`,
        },
        {
          market: "Over 2.5 Goals",
          probability: adjusted.over25,
          confidence: suggest(adjusted.over25),
          rationale:
            "Both teams feature in high-scoring contests, so Over 2.5 is strongly probable.",
        },
        {
          market: "Both Teams to Score",
          probability: adjusted.btts,
          confidence: suggest(adjusted.btts),
          rationale: `${homeTeam}'s home goal tendency aligns with ${awayTeam}'s attacking form.`,
        }
      ],
      expert_notes: expertData.expert_notes || [],
      suggested_scoreline: "Chelsea 2–1 Burnley",
      odds: {
        homeWin: makeOdds(adjusted.homeWin),
        draw: makeOdds(adjusted.draw),
        awayWin: makeOdds(adjusted.awayWin),
        over25: makeOdds(adjusted.over25),
        btts: makeOdds(adjusted.btts)
      }
    };

    res.json(prediction);
  } catch (err) {
    next(err);
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, error: err.message || "Internal Server Error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
