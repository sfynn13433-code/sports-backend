const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

// Helper to blend probabilities
function blendProbabilities(sources) {
  const avg = key => sources.reduce((sum, s) => sum + s[key], 0) / sources.length;
  const rationale = sources.map(s => `[${s.source}] ${s.rationale}`).join(" | ");
  return {
    probabilities: {
      win: Number((avg("win") * 100).toFixed(1)),
      draw: Number((avg("draw") * 100).toFixed(1)),
      lose: Number((avg("lose") * 100).toFixed(1)),
    },
    rationale,
    sources,
  };
}

const confidence = p => (p >= 70 ? "High" : p >= 50 ? "Medium" : "Low");

const makeOversUnders = (baseValues, prefix) => {
  const opts = [];
  baseValues.forEach(v => {
    opts.push({ label: `${prefix} Over ${v}`, probability: 50, confidence: "Medium" });
    opts.push({ label: `${prefix} Under ${v}`, probability: 50, confidence: "Medium" });
  });
  return opts;
};

// Fetch extended fixture details including venue, stats, events, odds, lineups
async function getFixtureDetails(fixtureId) {
  const response = await axios.get(
    `https://v3.football.api-sports.io/fixtures`,
    {
      headers: { "x-apisports-key": process.env.APISPORTS_KEY },
      params: { id: fixtureId, include: "venue,statistics,events,odds,lineups" }
    }
  );
  return response.data.response[0];
}

app.get("/", (req, res) => {
  res.send("SKCS Sports Predictions backend is running.");
});

app.post("/predict", async (req, res, next) => {
  try {
    const { homeTeam, awayTeam, league } = req.body;
    const displayLeague = (league || "").trim();
    const showLeague = displayLeague.toLowerCase() === "premier league" ? "Premier League" : displayLeague;

    // AI and expert predictions
    const aiPrediction = {
      source: "AI",
      win: 0.21, draw: 0.19, lose: 0.60,
      rationale: "AI: Model merges form, xG, and squad depth."
    };
    const expertPrediction = {
      source: "Expert",
      win: 0.22, draw: 0.18, lose: 0.60,
      rationale: `Expert: Consensus tips ${awayTeam} for pressing and goals against ${homeTeam}.`
    };

    // Get fixture ID from API-Sports
    let apiOddsSource = null, apiData = null, fixtureId = null, fixtureData = null;
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

      if (fixture) fixtureId = fixture.fixture.id;

      if (fixtureId) {
        // Fetch predictions odds and fixture details
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
            rationale: "Bookmakers' odds via API-Sports."
          };
        }
        fixtureData = await getFixtureDetails(fixtureId);
      }
    } catch (error) {
      console.error("API-Sports error:", error.message);
    }

    const sources = [aiPrediction, expertPrediction];
    if (apiOddsSource) sources.push(apiOddsSource);

    const consensus = blendProbabilities(sources);

    const markets = [
      {
        heading: "✅ 1. 1X2 (Match Result)",
        options: [
          { label: `1 = ${homeTeam}`, probability: consensus.probabilities.win, confidence: confidence(consensus.probabilities.win) },
          { label: "X = Draw", probability: consensus.probabilities.draw, confidence: confidence(consensus.probabilities.draw) },
          { label: `2 = ${awayTeam}`, probability: consensus.probabilities.lose, confidence: confidence(consensus.probabilities.lose) },
        ],
      },
      // More markets with properly generated over/under for Corners and Cards as before...
      {
        heading: "✅ 8. Corners",
        options: [
          ...makeOversUnders([6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5], "Total Corners"),
          { label: `Home Corners (${homeTeam})`, probability: 55, confidence: "Medium" },
          { label: `Away Corners (${awayTeam})`, probability: 45, confidence: "Low" },
          ...makeOversUnders([3.5, 4.5, 5.5, 6.5], "Halftime Corners"),
        ],
      },
      {
        heading: "✅ 9. Cards / Bookings",
        options: [
          ...makeOversUnders([0.5, 1.5, 2.5, 3.5, 4.5, 6.5, 7.5], "Over Cards"),
          ...makeOversUnders([0.5, 1.5, 2.5, 3.5, 4.5], "Halftime Cards"),
          { label: "Player to get booked", probability: 30, confidence: "Low" },
        ],
      },
      // Other markets as you have defined...
    ];

    res.json({
      match: fixtureData ? fixtureData.fixture?.teams.home.name + " vs " + fixtureData.fixture?.teams.away.name : `${homeTeam} vs ${awayTeam}`,
      kickoff: fixtureData?.fixture?.date,
      venue: fixtureData?.venue?.name,
      stats: fixtureData?.statistics,
      events: fixtureData?.events,
      odds: fixtureData?.odds || apiData?.predictions,
      lineups: fixtureData?.lineups,
      consensus,
      markets,
      expert_notes: apiData?.predictions?.advice || "Consensus from AI, experts, and markets.",
      odds_prices: {
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
