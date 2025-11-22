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

// Helper to build over/unders for given base values and label prefix
const makeOversUnders = (baseValues, prefix) => {
  const opts = [];
  baseValues.forEach(v => {
    opts.push({ label: `${prefix} Over ${v}`, probability: 50, confidence: "Medium" });
    opts.push({ label: `${prefix} Under ${v}`, probability: 50, confidence: "Medium" });
  });
  return opts;
};

app.get("/", (req, res) => {
  res.send("SKCS Sports Predictions backend is running.");
});

app.post("/predict", async (req, res, next) => {
  try {
    const { homeTeam, awayTeam, league } = req.body;
    const displayLeague = (league || "").trim();
    const showLeague = displayLeague.toLowerCase() === "premier league" ? "Premier League" : displayLeague;

    // AI and Expert predictions (stubs or models)
    const aiPrediction = {
      source: "AI",
      win: 0.21,
      draw: 0.19,
      lose: 0.60,
      rationale: "AI: Model merges form, xG, and squad depth.",
    };

    const expertPrediction = {
      source: "Expert",
      win: 0.22,
      draw: 0.18,
      lose: 0.60,
      rationale: `Expert: Consensus tips ${awayTeam} for pressing and goals against ${homeTeam}.`,
    };

    // Optional: External odds API integration (example: API-Sports)
    let apiOddsSource = null, apiData = null, fixtureId = null;

    try {
      const fixtureResp = await axios.get(
        "https://v3.football.api-sports.io/fixtures",
        {
          headers: { "x-apisports-key": process.env.APISPORTS_KEY },
          params: { league: 39, season: 2025, team: homeTeam },
        }
      );

      const fixture = fixtureResp.data.response.find(
        f => f.teams.home.name.toLowerCase() === homeTeam.toLowerCase() &&
             f.teams.away.name.toLowerCase() === awayTeam.toLowerCase()
      );

      if (fixture) fixtureId = fixture.fixture.id;

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
    } catch (apiErr) {
      console.error("API-Sports error:", apiErr.message);
    }

    const sources = [aiPrediction, expertPrediction];
    if (apiOddsSource) sources.push(apiOddsSource);
    const consensus = blendProbabilities(sources);

    // Prepare markets with requested advanced details
    const markets = [
      {
        heading: "✅ 1. 1X2 (Match Result)",
        options: [
          { label: `1 = ${homeTeam}`, probability: consensus.probabilities.win, confidence: confidence(consensus.probabilities.win) },
          { label: "X = Draw", probability: consensus.probabilities.draw, confidence: confidence(consensus.probabilities.draw) },
          { label: `2 = ${awayTeam}`, probability: consensus.probabilities.lose, confidence: confidence(consensus.probabilities.lose) }
        ],
      },
      {
        heading: "✅ 2. Double Chance",
        options: [
          { label: `1X = ${homeTeam} or Draw`, probability: 85, confidence: "High" },
          { label: `X2 = ${awayTeam} or Draw`, probability: 80, confidence: "High" },
          { label: `12 = ${homeTeam} or ${awayTeam} (No Draw)`, probability: 75, confidence: "Medium" }
        ],
      },
      {
        heading: "✅ 3. Over / Under Goals",
        options: [
          { label: "Over 0.5", probability: 92, confidence: "High" },
          { label: "Over 1.5", probability: 78, confidence: "Medium" },
          { label: "Over 2.5", probability: 61, confidence: "Medium" },
          { label: "Under 2.5", probability: 39, confidence: "Low" },
          { label: "Under 3.5", probability: 72, confidence: "Medium" }
        ],
      },
      {
        heading: "✅ 4. Both Teams To Score (BTTS)",
        options: [
          { label: "Yes", probability: 60, confidence: "Medium" },
          { label: "No", probability: 40, confidence: "Low" }
        ],
      },
      {
        heading: "✅ 5. Correct Score",
        options: [
          { label: "2–1", probability: 15, confidence: "Low" },
          { label: "1–1", probability: 12, confidence: "Low" },
          { label: "3–0", probability: 10, confidence: "Low" }
        ],
      },
      {
        heading: "✅ 6. Draw No Bet (DNB)",
        options: [
          { label: `DNB Home (${homeTeam})`, probability: 59, confidence: "Medium" },
          { label: `DNB Away (${awayTeam})`, probability: 61, confidence: "Medium" }
        ],
      },
      {
        heading: "✅ 7. Handicap / Asian Handicap",
        options: [
          { label: `-1 Handicap (${homeTeam})`, probability: 48, confidence: "Low" },
          { label: `+1 Handicap (${awayTeam})`, probability: 52, confidence: "Medium" }
        ],
      },
      {
        heading: "✅ 8. Corners",
        options: [
          ...makeOversUnders([6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5], "Total Corners"),
          { label: `Home Corners (${homeTeam})`, probability: 55, confidence: "Medium" },
          { label: `Away Corners (${awayTeam})`, probability: 45, confidence: "Low" },
          ...makeOversUnders([3.5, 4.5, 5.5, 6.5], "Halftime Corners")
        ],
      },
      {
        heading: "✅ 9. Cards / Bookings",
        options: [
          ...makeOversUnders([0.5, 1.5, 2.5, 3.5, 4.5, 6.5, 7.5], "Over Cards"),
          ...makeOversUnders([0.5, 1.5, 2.5, 3.5, 4.5], "Halftime Cards"),
          { label: "Player to get booked", probability: 30, confidence: "Low" }
        ],
      },
      {
        heading: "✅ 10. Goalscorer Bets",
        options: [
          { label: `First Goalscorer (e.g. Player A, ${homeTeam})`, probability: 12, confidence: "Low" },
          { label: `Anytime Goalscorer (e.g. Player B, ${awayTeam})`, probability: 35, confidence: "Medium" }
        ],
      },
      {
        heading: "✅ 11. Halftime / Fulltime",
        options: [
          { label: `HT/FT: Home / Home (${homeTeam} / ${homeTeam})`, probability: 20, confidence: "Low" },
          { label: `HT/FT: Home / Draw (${homeTeam} / Draw)`, probability: 15, confidence: "Low" },
          { label: `HT/FT: Home / Away (${homeTeam} / ${awayTeam})`, probability: 10, confidence: "Low" },
          { label: `HT/FT: Away / Away (${awayTeam} / ${awayTeam})`, probability: 25, confidence: "Medium" },
          { label: `HT/FT: Away / Draw (${awayTeam} / Draw)`, probability: 12, confidence: "Low" },
          { label: `HT/FT: Draw / Draw`, probability: 18, confidence: "Low" }
        ],
      },
      {
        heading: "✅ 12. Both Teams Score + Result",
        options: [
          { label: "BTTS + Over 2.5", probability: 45, confidence: "Medium" },
          { label: "BTTS + Match Winner", probability: 43, confidence: "Medium" }
        ],
      },
      {
        heading: "✅ 13. Combo / Multibet Markets",
        options: [
          { label: `Double Chance (1X) + Over 1.5`, probability: 55, confidence: "Medium" },
          { label: `BTTS + Draw`, probability: 40, confidence: "Low" },
          { label: `Double Chance (X2) + Under 3.5`, probability: 50, confidence: "Medium" }
        ],
      }
    ];

    function makeOversUnders(baseValues, prefix) {
      const opts = [];
      baseValues.forEach(value => {
        opts.push({ label: `${prefix} Over ${value}`, probability: 50, confidence: "Medium" });
        opts.push({ label: `${prefix} Under ${value}`, probability: 50, confidence: "Medium" });
      });
      return opts;
    }

    res.json({
      match: `${homeTeam} vs ${awayTeam} (${showLeague})`,
      consensus,
      markets,
      expert_notes: apiData?.predictions?.advice || "Consensus from AI, experts, and markets.",
      odds: {
        homeWin: apiOddsSource ? (1 / apiOddsSource.win).toFixed(2) : undefined,
        draw: apiOddsSource ? (1 / apiOddsSource.draw).toFixed(2) : undefined,
        awayWin: apiOddsSource ? (1 / apiOddsSource.lose).toFixed(2) : undefined,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ success: false, error: err.message || "Internal Server Error" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
