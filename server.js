import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// AI Prediction route
app.get('/api/predictions', async (req, res) => {
  try {
    // TODO: Replace with real ML logic or API call
    // Placeholder example matches
    const predictions = [
      {
        match: "Liverpool vs Arsenal",
        league: "Premier League",
        predictions: {
          winner: {
            team: "Liverpool",
            probability: 0.63,
            odds: 1.8,
            suggestedBet: "Bet on Liverpool"
          },
          goals: [
            { type: "Over 0.5 Goals", probability: 0.85, odds: 1.25, suggestedBet: "Over 0.5" },
            { type: "Over 1.5 Goals", probability: 0.70, odds: 1.55, suggestedBet: "Over 1.5" }
          ]
        }
      },
      {
        match: "Real Madrid vs Barcelona",
        league: "La Liga",
        predictions: {
          winner: {
            team: "Barcelona",
            probability: 0.58,
            odds: 1.9,
            suggestedBet: "Bet on Barcelona"
          },
          goals: [
            { type: "Over 0.5 Goals", probability: 0.90, odds: 1.2, suggestedBet: "Over 0.5" },
            { type: "Over 2.5 Goals", probability: 0.60, odds: 2.0, suggestedBet: "Over 2.5" }
          ]
        }
      }
    ];

    res.json(predictions);
  } catch (err) {
    console.error('Error generating predictions:', err);
    res.status(500).json({ error: 'Failed to generate predictions' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
