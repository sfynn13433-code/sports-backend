const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

// --- Blending utility ---
function blendProbabilities(sources) {
  const avg = key => sources.reduce((sum, s) => sum + s[key], 0) / sources.length;
  const rationale = sources.map(s => `[${s.source}] ${s.rationale}`).join(' | ');
  return {
    probabilities: {
      win: Number((avg('win') * 100).toFixed(1)),
      draw: Number((avg('draw') * 100).toFixed(1)),
      lose: Number((avg('lose') * 100).toFixed(1)),
    },
    rationale,
    sources,
  };
}

// Health route
app.get("/", (req, res) => {
  res.send("SKCS Sports Predictions backend is running.");
});

app.post("/predict", async (req, res, next) => {
  try {
    const { homeTeam, awayTeam, league } = req.body;

    // --- AI and Expert predictions (stubs or your model) ---
    const aiPrediction = {
      source: 'AI',
      win: 0.21,
      draw: 0.19,
      lose: 0.60,
      rationale: 'AI: Model merges form, xG, and squad depth.',
    };
    const expertPrediction = {
      source: 'Expert',
      win: 0.22,
      draw: 0.18,
      lose: 0.60,
      rationale: 'Expert: Consensus tips Villa for pressing/goals.',
    };

    // --- Optional: GET external odds API (e.g., API-SPORTS) ---
    let apiOddsSource = null, apiData = null;
    let fixtureId = null;
    try {
      const fixtureResp = await axios.get(
        "https://v3.football.api-sports.io/fixtures",
        {
          headers: { "x-apisports-key": process.env.APISPORTS_KEY },
          params: { league: 39, season: 2025, team: homeTeam }
        }
      );
      const fixture = fixtureResp.data.response.find(
        f => f.teams.home.name.toLowerCase() === homeTeam.toLowerCase() &&
             f.teams.away.name.toLowerCase() === awayTeam.toLowerCase()
      );
      if (fixture) { fixtureId = fixture.fixture.id; }
      if (fixtureId) {
        const apiResp = await axios.get(
          "https://v3.football.api-sports.io/predictions",
          {
            headers: { "x-apisports-key": process.env.APISPORTS_KEY },
            params: { fixture: fixtureId }
          }
        );
        apiData = apiResp.data.response[0];
        if (apiData?.predictions?.percent) {
          apiOddsSource = {
            source: "OddsAPI",
            win: Number(apiData.predictions.percent.win_home) / 100,
            draw: Number(apiData.predictions.percent.win_draw) / 100,
            lose: Number(apiData.predictions.percent.win_away) / 100,
            rationale: "Bookmakers' odds via API-Sports.",
          };
        }
      }
    } catch (apiErr) { console.error("API-Sports error:", apiErr.message); }

    // --- Consensus prediction using all available sources ---
    const sources = [aiPrediction, expertPrediction];
    if (apiOddsSource) sources.push(apiOddsSource);
    const consensus = blendProbabilities(sources);

    // --- Respond with full breakdown ---
    res.json({
      match: `${homeTeam} vs ${awayTeam} (${league})`,
      consensus, // Probabilities, rationale, and sources
      predictions: [
        {
          market: "Full Time Result",
          probability: consensus.probabilities.win,
          confidence: consensus.probabilities.win >= 70 ? "High" : consensus.probabilities.win >= 50 ? "Medium" : "Low",
          rationale: consensus.rationale
        }
      ],
      expert_notes: apiData?.predictions?.advice || "Consensus from AI, experts, and markets.",
      odds: {
        homeWin: apiOddsSource ? (1 / apiOddsSource.win).toFixed(2) : undefined,
        draw: apiOddsSource ? (1 / apiOddsSource.draw).toFixed(2) : undefined,
        awayWin: apiOddsSource ? (1 / apiOddsSource.lose).toFixed(2) : undefined,
      }
    });

  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
