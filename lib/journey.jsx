/**
 * JourneyContext — global state for active journey data including
 * route geometry, safety scores, segments, and journey status.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

const JourneyContext = createContext({
  activeJourney: null,
  setActiveJourney: () => {},
  updateCurrentSegment: () => {},
  clearJourney: () => {},
});

const INITIAL_JOURNEY = {
  origin: null,          // { lat, lng, label }
  destination: null,     // { lat, lng, label }
  routeGeometry: [],     // [[lng, lat], ...] from OSRM
  routeCoordinates: [],  // [[lat, lng], ...] for Leaflet
  segments: [],          // [{ segment_id, score, risk_level, lat, lng, length_m }]
  safetyScore: 0,
  riskLevel: 'MODERATE',
  factors: {},
  confidence: 1.0,
  distanceKm: 0,
  durationMin: 0,
  mode: 'driving',
  startedAt: null,
  currentSegmentIndex: 0,
  status: 'idle',        // "idle" | "analyzing" | "active" | "completed"
};

export function JourneyProvider({ children }) {
  const [activeJourney, setJourneyState] = useState(INITIAL_JOURNEY);

  const setActiveJourney = useCallback((data) => {
    setJourneyState((prev) => ({
      ...prev,
      ...data,
    }));
  }, []);

  const updateCurrentSegment = useCallback((index) => {
    setJourneyState((prev) => ({
      ...prev,
      currentSegmentIndex: index,
    }));
  }, []);

  const clearJourney = useCallback(() => {
    setJourneyState(INITIAL_JOURNEY);
  }, []);

  return (
    <JourneyContext.Provider
      value={{
        activeJourney,
        setActiveJourney,
        updateCurrentSegment,
        clearJourney,
      }}
    >
      {children}
    </JourneyContext.Provider>
  );
}

export function useJourney() {
  return useContext(JourneyContext);
}
