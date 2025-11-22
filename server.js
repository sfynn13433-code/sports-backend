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

    // 🔑 Step 1: Get fixture ID from API-SPORTS
    let fixtureId = null;
    try {
      const fixtureResponse = await axios.get("https://v3.football.api-sports.io/fixtures", {
        headers: { "x-apisports-key": process.env.APISPORTS_KEY },
        params: {
          league: 39,       // Premier League
          season: 2025,     // Current season
          team: homeTeam    // Filter by home team
        }
      });

      const fixture = fixtureResponse.data.response.find(
        f => f.teams.home.name.toLowerCase() === homeTeam.toLowerCase() &&
             f.teams.away.name.toLowerCase() === awayTeam.toLowerCase()
      );

      if (fixture) {
        fixtureId = fixture.fixture.id;
      }
    } catch (apiErr) {
      console.error("Fixture lookup failed:", apiErr.message);
    }

    let apiData = null;
    if (fixtureId) {
      try {
        const apiResponse = await axios.get("https://v3.football.api-sports.io/predictions", {
          headers: { "x-apisports-key": process.env.APISPORTS_KEY },
          params: { fixture: fixtureId }
        });
        apiData = apiResponse.data.response[0];
      } catch (apiErr) {
        console.error("Prediction fetch failed:", apiErr.message);
      }
    }

    // Core prediction response
    const prediction = {
      match: `${homeTeam} vs ${awayTeam} (${league})`,
      source: apiData ? "Blended AI model + expert consensus + API-SPORTS" : "Blended AI model + expert consensus",
      methodology: apiData
        ? "Probabilities blended from AI baselines, expert tempo/game-state assessments, and API-Sports live data."
        : "Probabilities blended from AI baselines and expert tempo/game-state assessments. Not live yet — replace stubs with real APIs to go live.",
      predictions: [
        {
          market: "Full Time Result",
          probability: apiData?.predictions?.percent?.win_home || adjusted.awayWin,
          confidence: suggest(adjusted.awayWin),
          rationale: apiData
            ? "API-Sports model indicates likelihood of home win."
            : `${awayTeam} are favorites based on recent form and scoring pace.`,
        },
        {
          market: "Over 2.5 Goals",
          probability: apiData?.predictions?.goals?.over_25 || adjusted.over25,
          confidence: suggest(adjusted.over25),
          rationale: apiData
            ? "API-Sports goal model suggests Over 2.5 is probable."
            : "Both teams feature in high-scoring contests, so Over 2.5 is strongly probable.",
        },
        {
          market: "Both Teams to Score",
          probability: apiData?.predictions?.percent?.btts || adjusted.btts,
          confidence: suggest(adjusted.btts),
          rationale: apiData
            ? "API-Sports BTTS model suggests both teams likely to score."
            : `${homeTeam}'s home goal tendency aligns with ${awayTeam}'s attacking form.`,
        }
      ],
      expert_notes: expertData.expert_notes || [],
      suggested_scoreline: apiData?.predictions?.advice || "Chelsea 2–1 Burnley",
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
