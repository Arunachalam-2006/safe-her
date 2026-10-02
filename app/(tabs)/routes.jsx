import { useState, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator, ScrollView } from 'react-native';
import { Bike, Check, CircleAlert, Clock3, Crosshair, Footprints, MapPin, Play, Sparkles, Route as RouteIcon, Car, X, Search } from 'lucide-react-native';
import { Card, Header, Pill, Screen, SectionTitle } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { useLocation, formatDistance, formatDuration, reverseGeocode, searchLocation, getRoute } from '../../lib/location';
import { fetchRouteOptions, scoreRouteGeometry } from '../../lib/safetyApi';
import { describeEngineUnreachable } from '../../lib/config';
import { offlineRouteFallback } from '../../lib/safetyFallbacks';
import { useJourney } from '../../lib/journey';
import { useRouter } from 'expo-router';
import RouteMap from '../../components/RouteMap';

const RISK_TONE = {
  LOW: '#2d7a3a',
  MODERATE: '#9a6000',
  ELEVATED: '#c2410c',
  HIGH: '#e04a6f',
};
const riskToneColor = (level) => RISK_TONE[level] ?? '#7C7289';

/**
 * Index of the safest route that actually has a score, or -1.
 * Returns the FIRST such index so a tie badges exactly one card - previously
 * every route tied at the top got a "Safest" pill, which is meaningless.
 */
function computeSafestIndex(routes) {
  let best = -1;
  let bestIdx = -1;
  routes.forEach((r, i) => {
    if (r?._scoreFailed) return;
    if (typeof r?.score !== 'number') return;
    if (r.score > best) { best = r.score; bestIdx = i; }
  });
  return bestIdx;
}

/** Human label for the engine's risk_level vocabulary. */
function riskLabel(level, score) {
  if (!level) return 'Score unavailable';
  if (level === 'LOW') return score != null ? `🛡 Safer · ${level}` : `🛡 ${level}`;
  if (level === 'MODERATE') return `⚠ Moderate · ${level}`;
  return `⚠ ${level}`;
}

/**
 * One short, honest sentence about why this route scored what it did.
 * Derived from the weakest measured factor - never invented.
 */
function safetyHint(route) {
  if (!route) return '';
  if (route.degraded) return 'Partial data — some live sources were unavailable.';
  const factors = route.factors;
  if (!factors || typeof factors !== 'object') return '';

  const LABELS = {
    lighting: 'street lighting',
    police: 'police presence',
    hospital: 'hospital access',
    amenities: 'nearby amenities',
    weather: 'weather',
    time: 'time of day',
    road: 'road type',
    route: 'route complexity',
  };
  let worstKey = null;
  let worst = Infinity;
  Object.entries(LABELS).forEach(([key]) => {
    const v = factors[key];
    if (typeof v === 'number' && v < worst) {
      worst = v;
      worstKey = key;
    }
  });
  if (!worstKey) return '';
  const pct = Math.round(worst * (worst <= 1 ? 100 : 1));
  return `Weakest factor: ${LABELS[worstKey]} (${pct}%).`;
}

export default function RoutesScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { setActiveJourney } = useJourney();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromCoords, setFromCoords] = useState(null);
  const [toCoords, setToCoords] = useState(null);
  const [route, setRoute] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [mode, setMode] = useState('driving');
  const [error, setError] = useState('');
  const [planning, setPlanning] = useState(false);
  const [activeField, setActiveField] = useState('to');
  const [searchField, setSearchField] = useState('to');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [allRoutes, setAllRoutes] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  // Indexes of routes whose safety score is still being fetched. Drives the
  // "Calculating route safety..." state on the individual cards.
  const [scoringIndexes, setScoringIndexes] = useState([]);
  const [routesError, setRoutesError] = useState('');
  const planRunRef = useRef(0);
  // Live mirror of `allRoutes` for async callbacks that need current scores
  // without re-creating themselves on every render.
  const scoredByIndex = useRef(null);
  const selectedRouteIndexRef = useRef(0);
  const { location, requestLocation, loading: locLoading, error: locationError } = useLocation();
  const safestIndex = useMemo(() => computeSafestIndex(allRoutes), [allRoutes]);
  const safestScore = safestIndex >= 0 ? allRoutes[safestIndex].score : null;

  // The safety payload for the selected route is DERIVED, not stored.
  //
  // It used to be a separate `safetyData` state set by handleSelectRoute. That
  // function was also called from inside scoreRoutesInBackground, where it
  // closed over a STALE `allRoutes` (the empty array from the render that
  // started the plan), so it returned early and left safetyData null forever -
  // which is why the screen said "Safety score unavailable" even after every
  // score had arrived. Deriving it here removes the class of bug entirely.
  const selectedOption = allRoutes[selectedRouteIndex];
  const safetyData =
    selectedOption && typeof selectedOption.score === 'number' ? selectedOption : null;

  useEffect(() => { requestLocation(); }, [requestLocation]);

  useEffect(() => {
    if (!location) return;
    setFromCoords(location);
    reverseGeocode(location.lat, location.lng).then(setFrom);
  }, [location]);

  useEffect(() => {
    const query = searchField === 'from' ? from : to;
    if (!activeField || activeField !== searchField || query.trim().length < 3) { setSuggestions([]); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchLocation(query);
        if (!cancelled) setSuggestions(results);
      } catch (e) {
        if (!cancelled) setError('Could not search destinations. Check your connection and try again.');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [from, to, activeField, searchField]);

  /**
   * Score every route in the background, one at a time, merging each result
   * in as it lands so the user sees scores appear rather than waiting for the
   * whole batch. A failure on one route never blocks the others.
   */
  async function scoreRoutesInBackground(options, coordsFrom, coordsTo, travelMode, runId) {
    setScoringIndexes(options.map((_, i) => i));

    // How many of the routes have now resolved. Used to auto-select the safest
    // exactly once, when the LAST score lands - previously it re-ran the
    // selection on every individual score, which yanked the map between routes
    // while the user was reading the cards.
    let pending = options.length;

    // A live copy of the routes, updated as scores land. The safest-index
    // decision below runs inside an async callback, where the `allRoutes`
    // captured by this closure is the stale pre-scoring array.
    const accumulated = options.map((o) => ({ ...o }));
    scoredByIndex.current = accumulated;

    await Promise.all(
      options.map(async (opt, idx) => {
        const result = await scoreRouteGeometry(
          opt,
          coordsFrom,
          coordsTo,
          travelMode
        );
        if (planRunRef.current !== runId) return; // a newer plan superseded this one

        const scored = result?.ok ? result.data : null;
        if (scored) accumulated[idx] = { ...accumulated[idx], ...scored };

        setAllRoutes((prev) => {
          if (idx >= prev.length) return prev;
          const next = [...prev];
          if (scored) {
            next[idx] = {
              ...next[idx],
              ...scored,
              // Keep the routing distance/duration: the geometry the client sent
              // round-tripped through JSON, and the engine measures its own.
              distanceKm: opt.distanceKm ?? scored.distanceKm,
              durationMin: opt.durationMin ?? scored.durationMin,
              coordinates: next[idx].coordinates ?? scored.coordinates,
              routeIndex: idx,
              _scoreFailed: false,
              _scoreError: null,
            };
          } else {
            next[idx] = {
              ...next[idx],
              _scoreFailed: true,
              // Keep the reason so the card can say WHY, not just "n/a".
              _scoreError: result?.message || 'Safety scoring failed for this route.',
            };
          }
          return next;
        });

        setScoringIndexes((prev) => prev.filter((i) => i !== idx));

        pending -= 1;
        // Once the last score lands, move to the safest route. Uses the ref
        // rather than calling handleSelectRoute, which would read a stale
        // `allRoutes` from this closure.
        if (scored && pending === 0) {
          const routes = scoredByIndex.current;
          if (routes) {
            const best = computeSafestIndex(routes);
            if (best >= 0 && best !== selectedRouteIndexRef.current) {
              selectedRouteIndexRef.current = best;
              setSelectedRouteIndex(best);
            }
          }
        }
      })
    );
  }

  async function handlePlan() {
    setError('');
    setRoutesError('');
    if (!fromCoords) { setError(locationError || 'Allow location access to set your current location.'); return; }
    if (!toCoords) { setError('Search for and select a destination first.'); return; }

    const runId = planRunRef.current + 1;
    planRunRef.current = runId;

    setPlanning(true);
    setAnalyzing(false);
    setRoute(null);
    setAllRoutes([]);
    setSelectedRouteIndex(0);
    setScoringIndexes([]);
    selectedRouteIndexRef.current = 0;
    scoredByIndex.current = null;

    try {
      // ── Phase 1: routing only (~2s). Draw the options immediately. ──
      let options = await fetchRouteOptions(fromCoords, toCoords, mode);

      if (options.length === 0) {
        // Engine unreachable — fall back to the client-side router so the user
        // still gets one usable route rather than an error.
        try {
          const baseRoute = await getRoute(fromCoords, toCoords, mode);
          options = [
            {
              routeIndex: 0,
              coordinates: baseRoute.coordinates,
              distanceKm: baseRoute.distanceKm,
              durationMin: baseRoute.durationMin,
              scored: false,
              score: null,
            },
          ];
          setRoutesError(
            `${describeEngineUnreachable('unreachable')} Showing a single route with no safety score.`
          );
        } catch {
          throw new Error('Could not calculate any routes.');
        }
      }

      if (planRunRef.current !== runId) return;

      // Mark every option as "score pending" BEFORE they render, so the very
      // first paint after planning shows a spinner rather than the
      // "unavailable" message. Previously the state update that set
      // scoringIndexes landed a frame after the render that cleared
      // safetyData, so "unavailable" flashed on every single plan.
      const pendingOptions = options.map((o) => ({
        ...o,
        _scoreFailed: false,
        _scoreError: null,
      }));

      // Default selection is route 1 until scores arrive.
      const first = pendingOptions[0];
      setAllRoutes(pendingOptions);
      setSelectedRouteIndex(0);
      selectedRouteIndexRef.current = 0;
      setRoute({
        coordinates: first.coordinates,
        distanceKm: first.distanceKm,
        durationMin: first.durationMin,
        provider: 'OSRM Route Engine',
      });
      setPlanning(false);

      // ── Phase 2: score each option in the background. ──
      scoreRoutesInBackground(pendingOptions, fromCoords, toCoords, mode, runId);
    } catch (e) {
      setError(e.message || 'Could not calculate routes. Please try again.');
    } finally {
      if (planRunRef.current === runId) setPlanning(false);
    }
  }

  async function handleSearchTo() {
    const query = to.trim();
    if (query.length < 3) {
      setError('Type at least 3 characters of your destination to search.');
      return;
    }
    setError('');
    setActiveField('to');
    setSearchField('to');
    setSearching(true);
    try {
      const results = await searchLocation(query);
      setSuggestions(results);
      if (results.length === 0) setError('No matching destinations found. Try a nearby landmark.');
    } catch (e) {
      setError('Could not search destinations. Check your connection and try again.');
    } finally {
      setSearching(false);
    }
  }

  function handleSelectRoute(idx) {
    if (idx < 0 || idx >= allRoutes.length) return;
    selectedRouteIndexRef.current = idx;
    setSelectedRouteIndex(idx);
    const selected = allRoutes[idx];
    if (!selected) return;
    setRoute({
      coordinates: selected.coordinates,
      // Prefer the routing figures; the scoring call returns its own measured
      // distance, and the user should see the value the router quoted.
      distanceKm: selected.distanceKm ?? 0,
      durationMin: selected.durationMin ?? null,
      provider: allRoutes.length > 1
        ? `OSRM · Route ${idx + 1} of ${allRoutes.length}`
        : 'OSRM Route Engine',
    });
    // `safetyData` is derived from `allRoutes[selectedRouteIndex]` during
    // render, so switching routes updates the score with no state to keep in
    // sync - and a route that is still being scored correctly shows the
    // "Calculating…" branch rather than an error.
  }

  function handleStartJourney() {
    if (!route || !safetyData) return;
    
    // Convert safetyData factors to the format JourneyContext expects
    setActiveJourney({
      origin: { ...fromCoords, label: from },
      destination: { ...toCoords, label: to },
      routeGeometry: route.coordinates, // assuming this is [[lat,lng],...]
      routeCoordinates: route.coordinates,
      segments: safetyData.segments || [],
      safetyScore: safetyData.score,
      riskLevel: safetyData.risk_level,
      factors: safetyData.factors || {},
      features: safetyData.features || {},
      confidence: safetyData.confidence,
      distanceKm: route.distanceKm,
      durationMin: route.durationMin,
      mode,
      startedAt: new Date().toISOString(),
      currentSegmentIndex: 0,
      status: 'active',
    });
    
    router.push('/(tabs)/journey');
  }

  return (
    <Screen>
      <Header eyebrow="Route finder" title="Travel with confidence" />

      <View style={[s.searchCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
        <View style={s.searchBody}>
          <View style={s.endpointColumn}>
            <View style={[s.dot, { backgroundColor: colors.primary }]} />
            <View style={[s.dotLine, { backgroundColor: colors.line }]} />
            <View style={[s.dot, { backgroundColor: colors.pink }]} />
          </View>

          <View style={s.inputsColumn}>
            <SearchField
              label="From"
              value={from}
              coords={fromCoords}
              active={activeField === 'from'}
              suggestions={searchField === 'from' ? suggestions : []}
              iconColor={colors.primary}
              editable
              placeholder={locLoading ? 'Getting current location...' : 'Current location'}
              onChangeText={(text) => { setFrom(text); setFromCoords(null); setRoute(null); setError(''); setActiveField('from'); setSearchField('from'); }}
              onFocus={() => { setActiveField('from'); setSearchField('from'); }}
              onBlur={() => setTimeout(() => setActiveField(null), 500)}
              onClear={() => { setFrom(''); setFromCoords(null); setRoute(null); }}
              onLocate={requestLocation}
              locating={locLoading}
              onSelectArea={(place) => { setFrom(place.name); setFromCoords({ lat: place.lat, lng: place.lng }); setSuggestions([]); setActiveField(null); setError(''); }}
            />
            <View style={s.fieldDivider} />
            <SearchField
              label="To"
              value={to}
              coords={toCoords}
              active={activeField === 'to'}
              suggestions={suggestions}
              iconColor={colors.pink}
              onChangeText={(t) => { setTo(t); setToCoords(null); setRoute(null); setError(''); setActiveField('to'); }}
              onFocus={() => { setActiveField('to'); setSearchField('to'); }}
              onBlur={() => setTimeout(() => setActiveField(null), 500)}
              onClear={() => { setTo(''); setToCoords(null); }}
              onLocate={handleSearchTo}
              locateIcon={Search}
              locating={searching}
              onSelectArea={(place) => { setTo(place.name); setToCoords({ lat: place.lat, lng: place.lng }); setSuggestions([]); setActiveField(null); setError(''); }}
            />
          </View>
        </View>

        <View style={[s.quickRow, { borderTopColor: colors.line }]}>
          <View style={{ flex: 1 }} />
          {fromCoords ? <Pill tone="primary">From set</Pill> : null}
          {toCoords ? <Pill tone="pink">To set</Pill> : null}
        </View>
      </View>

      <Pressable disabled={planning} onPress={handlePlan} style={({ pressed }) => [s.planButton, { backgroundColor: colors.primary }, pressed && s.pressed]}>
        {planning ? <ActivityIndicator color="#FFFFFF" size="small" /> : <><Sparkles color="#FFFFFF" size={18} /><Text style={s.planText}>Find safer routes</Text></>}
      </Pressable>

      <View style={s.modeRow}>
        {[['driving', 'Driving', Car], ['walking', 'Walking', Footprints], ['cycling', 'Cycling', Bike]].map(([key, label, Icon]) => (
          <Pressable key={key} onPress={() => { setMode(key); setRoute(null); }} style={[s.modeChip, { backgroundColor: mode === key ? colors.ink : colors.cardBg, borderColor: mode === key ? colors.ink : colors.line }]}>
            <Icon color={mode === key ? (isDark ? '#0D1117' : '#FFFFFF') : colors.muted} size={16} />
            <Text style={[s.modeText, { color: mode === key ? (isDark ? '#0D1117' : '#FFFFFF') : colors.muted }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

      {fromCoords || toCoords ? (
        <Card style={s.mapCard}>
          <RouteMap 
            source={fromCoords} 
            destination={toCoords} 
            route={route} 
            allRoutes={allRoutes}
            selectedRouteIndex={selectedRouteIndex}
            onSelectRoute={handleSelectRoute}
          />
        </Card>
      ) : null}

      {routesError ? (
        <View style={[s.noticeBox, { backgroundColor: colors.safetyCardBg, borderColor: colors.line }]}>
          <CircleAlert color={colors.orange} size={16} />
          <Text style={[s.noticeText, { color: colors.ink }]}>{routesError}</Text>
        </View>
      ) : null}

      {allRoutes && allRoutes.length > 1 ? (
        <View style={s.alternativesWrapper}>
          <Text style={[s.alternativesHeader, { color: colors.muted }]}>
            {scoringIndexes.length > 0
              ? 'Comparing routes…'
              : 'Choose a route — safest is selected, but you can pick any'}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.alternativesScroll}>
            {allRoutes.map((r, idx) => {
              const isSelected = selectedRouteIndex === idx;
              const isScoring = scoringIndexes.includes(idx);
              const hasScore = typeof r?.score === 'number';
              const scoreFailed = r?._scoreFailed === true;
              // `isSafest` used to run a reduce() inside every card's render,
              // making this O(n^2) on each re-render.
              // Tie-broken by index so exactly one card can ever be "Safest".
              const isSafest = !isScoring && !scoreFailed && hasScore && idx === safestIndex;

              return (
                <Pressable
                  key={idx}
                  onPress={() => handleSelectRoute(idx)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={
                    hasScore
                      ? `Route ${idx + 1}, safety score ${r.score} out of 100, ${formatDistance(r.distanceKm)}, ${formatDuration(r.durationMin)}`
                      : `Route ${idx + 1}, safety score ${isScoring ? 'being calculated' : 'unavailable'}`
                  }
                  style={[
                    s.alternativeCard,
                    {
                      backgroundColor: isSelected ? colors.primarySoft : colors.cardBg,
                      borderColor: isSelected ? colors.primary : colors.line
                    }
                  ]}
                >
                  <View style={s.alternativeTop}>
                    <Text style={[s.routeNumber, { color: colors.muted }]}>Route {idx + 1}</Text>
                    {isScoring ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : scoreFailed ? (
                      <Text style={[s.alternativeScore, { color: colors.muted, fontSize: 12 }]}>
                        Score n/a
                      </Text>
                    ) : (
                      <Text style={[s.alternativeScore, { color: riskToneColor(r?.risk_level) }]}>
                        {r.score}/100
                      </Text>
                    )}
                  </View>

                  <Text style={[s.alternativeMetrics, { color: colors.ink }]}>
                    {formatDistance(r?.distanceKm)} ·{' '}
                    {r?.durationMin ? formatDuration(r.durationMin) : '—'}
                  </Text>

                  {isScoring ? (
                    <Text style={[s.alternativeRisk, { color: colors.primary }]}>
                      Calculating safety…
                    </Text>
                  ) : scoreFailed ? (
                    <Text style={[s.alternativeRisk, { color: colors.muted }]} numberOfLines={2}>
                      {r?._scoreError || 'Safety score unavailable'}
                    </Text>
                  ) : (
                    <>
                      <Text style={[s.alternativeRisk, { color: riskToneColor(r?.risk_level) }]}>
                        {riskLabel(r?.risk_level, r?.score)}
                      </Text>
                      {safetyHint(r) ? (
                        <Text style={[s.alternativeHint, { color: colors.muted }]} numberOfLines={2}>
                          {safetyHint(r)}
                        </Text>
                      ) : null}
                    </>
                  )}

                  {isSafest ? <Pill tone="teal">Safest</Pill> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {route ? (
        <>
          <Card style={s.summaryCard}>
            <View style={s.summaryRow}>
              <RouteIcon color={colors.primary} size={18} />
              <Text style={[s.summaryText, { color: colors.ink }]}>{formatDistance(route.distanceKm)} by road</Text>
            </View>
            <View style={[s.summaryDivider, { backgroundColor: colors.line }]} />
            <View style={s.summaryRow}>
              <Clock3 color={colors.primary} size={18} />
              <Text style={[s.summaryText, { color: colors.ink }]}>{formatDuration(route.durationMin)}{route.trafficDelayMin ? ` (+${route.trafficDelayMin} traffic)` : ''}</Text>
            </View>
          </Card>

          <SectionTitle action={<Text style={[s.updated, { color: colors.primary }]}>
            {allRoutes.length > 1 ? `Route ${selectedRouteIndex + 1} of ${allRoutes.length}` : route.provider}
          </Text>}>Route result</SectionTitle>
          <View style={[s.routeCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
              <View style={s.routeTop}>
                <View style={s.routeName}>
                  <View style={[s.routeDot, { backgroundColor: colors.primary }]} />
                  <Text style={[s.name, { color: colors.ink }]}>{mode === 'driving' ? 'Driving route' : mode === 'walking' ? 'Walking route' : 'Cycling route'}</Text>
                </View>
              </View>
              <View style={s.routeMeta}>
                <View style={s.meta}><Clock3 color={colors.muted} size={15} /><Text style={[s.metaText, { color: colors.ink }]}>{formatDuration(route.durationMin)}</Text></View>
                <Text style={[s.extra, { color: colors.muted }]}>{formatDistance(route.distanceKm)}</Text>
              </View>
              <Text style={[s.note, { color: colors.muted }]}>{route.provider}{route.trafficDelayMin ? `, including ${route.trafficDelayMin} min traffic delay.` : '.'}</Text>

              {analyzing || scoringIndexes.includes(selectedRouteIndex) ? (
                <View style={s.analyzingBox}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[s.analyzingText, { color: colors.primary }]}>Calculating route safety…</Text>
                </View>
              ) : !safetyData ? (
                // A safety outage must never hide the route itself, and the
                // message must say WHY - "unavailable" sent people hunting for
                // a problem that was really just the engine not running.
                <View style={s.analyzingBox}>
                  <CircleAlert color={colors.orange} size={16} />
                  <Text style={[s.analyzingText, { color: colors.orange }]}>
                    {allRoutes[selectedRouteIndex]?._scoreError
                      || 'Safety score unavailable for this route. The route is still shown and usable.'}
                  </Text>
                </View>
              ) : (
                <View style={s.safetySection}>
                  <View style={s.scoreStrip}>
                    <Text style={[s.scoreValue, { color: colors.ink }]}>{safetyData.score} / 100</Text>
                    <Text style={s.scoreLabel}>Safety score</Text>
                    <View style={{ flex: 1 }} />
                    <Pill tone={safetyData.risk_level === 'LOW' ? 'green' : safetyData.risk_level === 'MODERATE' ? 'orange' : 'pink'}>
                      {safetyData.risk_level}
                    </Pill>
                  </View>
                  {safetyData.degraded ? (
                    <Text style={[s.note, { color: colors.orange, marginTop: 6 }]}>
                      Partial data — some live sources were unavailable for this route.
                    </Text>
                  ) : null}
                  
                  <View style={s.factorsList}>
                    {Object.entries(safetyData.factors || {}).map(([key, val]) => (
                      <View key={key} style={s.factorRow}>
                        <Text style={[s.factorName, { color: colors.ink }]}>{key.charAt(0).toUpperCase() + key.slice(1)}</Text>
                        <View style={[s.factorBarBg, { backgroundColor: 'rgba(0,0,0,0.08)' }]}>
                          <View style={[s.factorBarFill, { width: `${val}%`, backgroundColor: val >= 80 ? '#2d7a3a' : val >= 60 ? '#5B4FD9' : '#9a6000' }]} />
                        </View>
                        <Text style={[s.factorVal, { color: colors.ink }]}>{val}</Text>
                      </View>
                    ))}
                  </View>
                  
                  <Text style={[s.segmentsTitle, { color: colors.muted }]}>SEGMENTS</Text>
                  <View style={s.segmentsList}>
                    {safetyData.segments?.map((seg, i) => (
                      <View key={`${i}-${seg.segment_id ?? i}`} style={s.segmentRow}>
                        <Text style={[s.segName, { color: colors.ink }]}>Seg {i + 1}</Text>
                        <View style={[s.segLine, { backgroundColor: seg.risk_level === 'LOW' ? '#2d7a3a' : seg.risk_level === 'MODERATE' ? '#9a6000' : seg.risk_level === 'ELEVATED' ? '#c0392b' : '#e04a6f' }]} />
                        <Text style={[s.segScore, { color: colors.ink }]}>{seg.score} {seg.risk_level.substring(0,3)}</Text>
                      </View>
                    ))}
                  </View>
                  
                  {safetyData._timeout ? (
                    <Text style={[s.timeoutWarn, { color: colors.orange }]}>Analysis took too long. Partial results shown.</Text>
                  ) : null}
                </View>
              )}
          </View>
          
          {safetyData && !analyzing ? (
            <Pressable onPress={handleStartJourney} style={({ pressed }) => [s.planButton, { backgroundColor: '#5B4FD9' }, pressed && s.pressed]}>
              <Play color="#FFFFFF" size={18} />
              <Text style={s.planText}>Start Journey</Text>
            </Pressable>
          ) : null}

          <Card style={[s.tip, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[s.tipTitle, { color: colors.ink }]}>Safety analysis active</Text>
              <Text style={[s.tipText, { color: colors.muted }]}>This route uses real location & live route data optimized for safe transit.</Text>
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function SearchField({ label, value, coords, active, suggestions, iconColor, onChangeText, onFocus, onBlur, onClear, onLocate, locating, onSelectArea, editable = true, placeholder, locateIcon: LocateIcon = Crosshair }) {
  const { colors } = useTheme();
  return (
    <View style={s.fieldWrap}>
      <View style={[s.fieldInner, { borderColor: active ? iconColor : colors.line, backgroundColor: colors.cardBg }]}>
        <View style={s.fieldLeft}>
          <Text style={[s.fieldLabel, { color: active ? iconColor : colors.muted }]}>{label}</Text>
        </View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          editable={editable}
          placeholder={placeholder || 'Search for a destination...'}
          placeholderTextColor={colors.muted}
          style={[s.input, { color: colors.ink }]}
          autoCapitalize="words"
        />
        <Pressable disabled={!value} onPress={onClear} style={[s.clearBtn, !value && s.clearBtnHidden]}><X color={colors.muted} size={15} /></Pressable>
        {onLocate ? <Pressable onPress={onLocate} style={[s.locateBtn, { backgroundColor: colors.paper }]}>
          {locating ? <ActivityIndicator color={iconColor} size="small" /> : <LocateIcon color={iconColor} size={16} />}
        </Pressable> : null}
      </View>
      {active && suggestions.length > 0 ? (
        <View style={[s.suggestions, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
          <Text style={[s.suggestionsHeader, { color: colors.muted }]}>Real location results</Text>
          <ScrollView style={s.suggestionsScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {/* Nominatim regularly returns several entries with an identical
                `name` (e.g. two "Evening Bazaar, Ward 59" results). Keying on
                the label alone made React throw "Encountered two children with
                the same key" and drop rows from the list. The index suffix
                guarantees uniqueness without changing behaviour. */}
            {suggestions.slice(0, 6).map((area, i) => (
              <Pressable key={`${area.label}-${i}`} onPressIn={() => onSelectArea(area)} onPress={() => onSelectArea(area)} style={({ pressed }) => [s.suggestion, pressed && s.pressed]}>
                <View style={[s.suggestionIcon, { backgroundColor: iconColor + '15' }]}>
                  <MapPin color={iconColor} size={14} />
                </View>
                <View style={s.suggestionCopy}>
                  <Text style={[s.suggestionText, { color: colors.ink }]}>{area.name}</Text>
                  <Text style={[s.suggestionSub, { color: colors.muted }]}>{area.label.split(',').slice(2, 4).join(',').trim() || 'Location result'}</Text>
                </View>
                {coords && coords.lat === area.lat ? <Check color={iconColor} size={15} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  mapCard: { padding: 0, overflow: 'hidden', height: 240 },
  alternativesWrapper: { marginVertical: 12 },
  alternativesHeader: { fontSize: 10, fontWeight: '750', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8, paddingHorizontal: 4 },
  alternativesScroll: { gap: 10, flexDirection: 'row', paddingHorizontal: 4, paddingBottom: 4 },
  alternativeCard: { width: 154, padding: 12, borderRadius: 18, borderWidth: 1.5, gap: 4 },
  alternativeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routeNumber: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  alternativeScore: { fontSize: 16, fontWeight: '700' },
  alternativeMetrics: { fontSize: 11, fontWeight: '500' },
  alternativeRisk: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
  alternativeHint: { fontSize: 10, lineHeight: 14, marginTop: 1 },
  noticeBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 10 },
  noticeText: { fontSize: 12, flex: 1, lineHeight: 17 },
  searchCard: { borderRadius: 22, borderWidth: 1, marginBottom: 14, overflow: 'visible' },
  searchBody: { flexDirection: 'row', padding: 16, paddingBottom: 10 },
  endpointColumn: { width: 28, alignItems: 'center', paddingTop: 18 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotLine: { width: 2, flex: 1, marginVertical: 4, minHeight: 24 },
  inputsColumn: { flex: 1, minWidth: 0, flexDirection: 'column' },
  fieldWrap: { position: 'relative', zIndex: 1, width: '100%' },
  fieldInner: { flexDirection: 'row', alignItems: 'center', width: '100%', borderWidth: 1.5, borderRadius: 15, paddingHorizontal: 14, height: 52, gap: 8 },
  fieldLeft: { width: 38, flexShrink: 0 },
  fieldLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.3 },
  input: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '500', paddingVertical: 4, outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' },
  clearBtn: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  clearBtnHidden: { opacity: 0 },
  locateBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  fieldDivider: { height: 12 },
  suggestions: { position: 'relative', marginTop: 6, borderRadius: 18, borderWidth: 1, zIndex: 100, padding: 6, maxHeight: 240 },
  suggestionsHeader: { fontSize: 10, fontWeight: '500', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 },
  suggestionsScroll: { maxHeight: 200 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 13 },
  pressed: { opacity: 0.6 },
  suggestionIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  suggestionCopy: { flex: 1 },
  suggestionText: { fontSize: 14, fontWeight: '500' },
  suggestionSub: { fontSize: 10, marginTop: 2 },
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, borderTopWidth: 1 },
  planButton: { borderRadius: 18, height: 54, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  planText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeChip: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1 },
  modeText: { fontSize: 12, fontWeight: '600' },
  errorBox: { backgroundColor: '#FFF0F0', borderRadius: 14, padding: 14, marginBottom: 16 },
  errorText: { color: '#C24141', fontSize: 12, lineHeight: 18, fontWeight: '500' },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryDivider: { width: 1, height: 20 },
  summaryText: { fontSize: 14, fontWeight: '500' },
  updated: { fontSize: 12, fontWeight: '500' },
  routeCard: { borderRadius: 20, padding: 18, marginBottom: 12, borderWidth: 1 },
  routeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routeName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  name: { fontWeight: '600', fontSize: 14 },
  routeMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontWeight: '500', fontSize: 12 },
  extra: { fontSize: 12 },
  note: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  
  analyzingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, marginTop: 16, backgroundColor: '#F3E8FF', borderRadius: 14 },
  analyzingText: { fontSize: 12, fontWeight: '500' },
  
  safetySection: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F3E8FF' },
  scoreStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  scoreValue: { fontSize: 20, fontWeight: '700' },
  scoreLabel: { fontSize: 12, color: '#7C7289' },
  
  factorsList: { gap: 8, marginBottom: 16 },
  factorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  factorName: { width: 70, fontSize: 10, fontWeight: '600' },
  factorBarBg: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  factorBarFill: { height: '100%', borderRadius: 3 },
  factorVal: { width: 30, fontSize: 10, fontWeight: '600', textAlign: 'right' },
  
  segmentsTitle: { fontSize: 10, fontWeight: '600', letterSpacing: 1, marginTop: 8, marginBottom: 8 },
  segmentsList: { gap: 6 },
  segmentRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  segName: { width: 45, fontSize: 10, fontWeight: '500' },
  segLine: { flex: 1, height: 3, borderRadius: 2 },
  segScore: { width: 50, fontSize: 10, fontWeight: '500', textAlign: 'right' },
  timeoutWarn: { fontSize: 10, fontWeight: '500', marginTop: 12, textAlign: 'center' },

  tip: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  tipTitle: { fontWeight: '600', fontSize: 14, marginBottom: 4 },
  tipText: { lineHeight: 17, fontSize: 12 },
});
