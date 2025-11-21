const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;

/* Middleware */
app.use(express.json()); // parse JSON request bodies
app.use(
  cors({
    origin: [
      "https://sports-frontend-two.vercel.app",
      "https://sports-frontend-alrdbjkhm-stephens-projects-e3dd898a.vercel.app"
    ],
    methods: ["GET", "POST"],
  })
);

/* Health check */
app.get("/", (req, res) => {
  res.send("Sports Prediction Backend is LIVE");
});

/* Dummy expert data fetch (stub) */
async function fetchExpertData(home, away, league) {
  return {
    expert_win: 35,
    expert_draw: 30,
    expert_away: 35,
    expert_btts: 68,
    expert_over25: 60,
  };
}

/* Blend model + expert probabilities */
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
  };
}

/* Main prediction route — POST with JSON body */
app.post("/predict", async (req, res) => {
  try {
    const { homeTeam, awayTeam, league } = req.body;

    // Basic validation to avoid undefined labels
    if (!homeTeam || !awayTeam || !league) {
      return res.status(400).json({
        error: "Missing required fields: homeTeam, awayTeam, league",
      });
    }

    const defaultModel = {
      homeWin: 31,
      draw: 29,
      awayWin: 40,
      btts: 65,
      over25: 58,
    };

    const expertData = await fetchExpertData(homeTeam, awayTeam, league);
    const adjusted = adjustProbabilities(defaultModel, expertData);

    const prediction = {
      match: `${homeTeam} vs ${awayTeam} (${league})`,
      source: "AI model + Expert Consensus",
      all: {
        fulltime_result: [
          { outcome: "Home Win", probability: `${adjusted.homeWin}%`, odds: "2.8", suggestion: "Risky" },
          { outcome: "Draw", probability: `${adjusted.draw}%`, odds: "3.2", suggestion: "Value bet" },
          { outcome: "Away Win", probability: `${adjusted.awayWin}%`, odds: "2.5", suggestion: "Likely" },
        ],
        over_under_goals: { "Over 2.5": `${adjusted.over25}%`, "Under 2.5": `${100 - adjusted.over25}%` },
        corners: { "Over 9.5": "44%", "10–12": "30%", "Under 9.5": "26%" },
        cards: { "HT Over 1.5": "55%", "FT Over 3.5": "60%" },
        handicap: { "Home -1": "33%", "Away +1": "48%", "Draw Handicap": "19%" },
        scorers: ["Liverpool striker likely (~45–50%)", "Arsenal winger possible (~35–40%)"],
        halftime_fulltime: "Home/Home (~25–28%)",
      },
      popular: {
        double_chance: "1X (Home win or draw safest ~60%)",
        double_chance_btts: "1X + BTTS Yes (~40–45%)",
        over_2_5_goals: `${adjusted.over25}%`,
        btts: `Yes (~${adjusted.btts}%)`,
      },
      winner: {
        halftime_fulltime: "Home/Home (~25–28%)",
        double_chance: ["1X", "X2", "12"],
      },
      bookings: {
        halftime: { "Over 1.5": "55%", "Under 1.5": "45%" },
        fulltime: { "Over 3.5": "60%", "Under 3.5": "40%" },
        player_cards: ["Player A booked", "Player B sent off"],
      },
      goals: {
        over_under: {
          "Over 2.5": `${adjusted.over25}%`,
          "Over 3.5": "32%",
          "Under 2.5": `${100 - adjusted.over25}%`,
        },
        team_goals: { "Home Over 1.5": "62%", "Away Over 1.5": "55%" },
        exact_goals: { "Exactly 2": "25%", "Exactly 3": "20%" },
        btts: `Yes (~${adjusted.btts}%)`,
      },
      halves: {
        halftime_result: "Home ~35%",
        second_half_result: "Away ~40%",
        halftime_goals: { "Over 1.5": "48%", "Under 1.5": "52%" },
      },
      corners: {
        total: { "Over 9.5": "44%", "10–12": "30%", "Under 9.5": "26%" },
        team: { "Home Over 4.5": "51%", "Away Over 4.5": "47%" },
        handicap: { "Home +2": "55%", "Away +2": "45%" },
      },
      scores: {
        correct_score: ["1–0", "2–1", "2–2"],
        scorecast: "2–1 + Liverpool striker",
        multiscore: "2–3 goals total",
      },
      handicaps: {
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

    res.json(prediction);
  } catch (err) {
    console.error("Predict error:", err);
    res.status(500).json({ error: "Failed to generate prediction" });
  }
});

/* Start server */
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
