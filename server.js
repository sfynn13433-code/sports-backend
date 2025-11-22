// server.js — Render backend (Express, CORS, full outcomes, frontend-aligned arrays)

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
      // keep preview domains for Vercel
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
  };
}

/* ------------------------------
   Predict route — returns BOTH:
   - frontend-aligned arrays
   - full rich sections we discussed
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
    };

    const expertData = await fetchExpertData(homeTeam, awayTeam, league);
    const adjusted = adjustProbabilities(defaultModel, expertData);

    // Frontend-aligned arrays (tabs)
    const goals = [
      { outcome: "Over 2.5 Goals", probability: `${adjusted.over25}%`, odds: "1.60", suggestion: "Likely" },
      { outcome: "Under 2.5 Goals", probability: `${100 - adjusted.over25}%`, odds: "2.40", suggestion: "Risky" },
      { outcome: "BTTS Yes", probability: `${adjusted.btts}%`, odds: "1.90", suggestion: "Strong" },
      { outcome: "BTTS No", probability: `${100 - adjusted.btts}%`, odds: "2.10", suggestion: "Weak" },
      { outcome: "Over 3.5 Goals", probability: "32%", odds: "2.30", suggestion: "Medium" },
      { outcome: "Exactly 2 Goals", probability: "25%", odds: "3.20", suggestion: "Value" }
    ];

    const halftime = [
      { outcome: "Home/Home", probability: "25%", odds: "3.00", suggestion: "Value" },
      { outcome: "Draw/Draw", probability: "22%", odds: "3.50", suggestion: "Balanced" },
      { outcome: "Away/Away", probability: "28%", odds: "2.80", suggestion: "Likely" },
      { outcome: "Home/Draw", probability: "12%", odds: "6.00", suggestion: "Longshot" }
    ];

    const corners = [
      { outcome: "Over 9.5 Corners", probability: "44%", odds: "2.10", suggestion: "Medium" },
      { outcome: "10–12 Corners", probability: "30%", odds: "2.50", suggestion: "Value" },
      { outcome: "Under 9.5 Corners", probability: "26%", odds: "2.80", suggestion: "Risky" },
      { outcome: "Home Over 4.5 Corners", probability: "51%", odds: "1.95", suggestion: "Lean" },
      { outcome: "Away Over 4.5 Corners", probability: "47%", odds: "2.05", suggestion: "Lean" }
    ];

    const cards = [
      { outcome: "HT Over 1.5 Cards", probability: "55%", odds: "1.90", suggestion: "Likely" },
      { outcome: "FT Over 3.5 Cards", probability: "60%", odds: "1.80", suggestion: "Strong" },
      { outcome: "Under 3.5 Cards", probability: "40%", odds: "2.20", suggestion: "Cautious" },
      { outcome: "Player A booked", probability: "40%", odds: "3.00", suggestion: "Possible" }
    ];

    const handicaps = [
      { outcome: "Home -1", probability: "33%", odds: "2.80", suggestion: "Risky" },
      { outcome: "Away +1", probability: "48%", odds: "2.00", suggestion: "Safe" },
      { outcome: "Draw Handicap", probability: "19%", odds: "3.20", suggestion: "Value" },
      { outcome: "Asian Home -0.5", probability: "41%", odds: "2.30", suggestion: "Fair" }
    ];

    // Full, rich sections preserved (for completeness/export)
    const prediction = {
      match: `${homeTeam} vs ${awayTeam} (${league})`,
      source: "AI model + Expert Consensus",

      all: {
        fulltime_result: [
          { outcome: "Home Win", probability: `${adjusted.homeWin}%`, odds: "2.80", suggestion: "Risky" },
          { outcome: "Draw", probability: `${adjusted.draw}%`, odds: "3.20", suggestion: "Value" },
          { outcome: "Away Win", probability: `${adjusted.awayWin}%`, odds: "2.50", suggestion: "Likely" }
        ],
        over_under_goals: { "Over 2.5": `${adjusted.over25}%`, "Under 2.5": `${100 - adjusted.over25}%`, "Over 3.5": "32%" },
        corners: { "Over 9.5": "44%", "10–12": "30%", "Under 9.5": "26%", "Home Over 4.5": "51%", "Away Over 4.5": "47%" },
        cards: { "HT Over 1.5": "55%", "FT Over 3.5": "60%", "Under 3.5": "40%" },
        handicap: { "Home -1": "33%", "Away +1": "48%", "Draw Handicap": "19%", "Asian Home -0.5": "41%" },
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

      corners_detail: {
        total: { "Over 9.5": "44%", "10–12": "30%", "Under 9.5": "26%" },
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
