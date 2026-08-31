/**
 * Add this route to your existing Node.js Express application.
 * 
 * Existing Architecture:
 * - Express App handles auth, user profiles, SOS, and journey storage on port 3000.
 * - This route handles saving the completed Journey details returned from the React Native app.
 */

const express = require('express');
const router = express.Router();

// POST /journeys/save
router.post('/save', async (req, res) => {
  try {
    const { 
      origin, 
      destination, 
      safetyScore, 
      riskLevel, 
      segments, 
      features, 
      startedAt, 
      userRating 
    } = req.body;

    // Save to existing database as-is
    const newJourney = {
      origin,
      destination,
      safetyScore,
      riskLevel,
      segments,
      features,
      startedAt,
      completedAt: new Date().toISOString(),
      userRating,
    };

    // await db.collection('journeys').insertOne(newJourney);
    const mockId = 'jny_' + Date.now();
    
    console.log('[Express] Journey saved successfully:', newJourney);
    res.status(201).json({ journey_id: mockId, saved: true });
  } catch (error) {
    console.error('[Express] Error saving journey:', error);
    res.status(500).json({ saved: false });
  }
});

module.exports = router;
