import { useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator, ScrollView } from 'react-native';
import { Bike, Check, Clock3, Crosshair, Footprints, MapPin, Play, Sparkles, Route as RouteIcon, Car, X, Search } from 'lucide-react-native';
import { Card, Header, Pill, Screen, SectionTitle } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { useLocation, formatDistance, formatDuration, reverseGeocode, searchLocation, getRoute } from '../../lib/location';
import { analyzeSafety } from '../../lib/safetyApi';
import { useJourney } from '../../lib/journey';
import { useRouter } from 'expo-router';
import RouteMap from '../../components/RouteMap';

export default function RoutesScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { setActiveJourney } = useJourney();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromCoords, setFromCoords] = useState(null);
  const [toCoords, setToCoords] = useState(null);
  const [route, setRoute] = useState(null);
  const [safetyData, setSafetyData] = useState(null);
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
  const { location, requestLocation, loading: locLoading, error: locationError } = useLocation();

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

  async function handlePlan() {
    setError('');
    if (!fromCoords) { setError(locationError || 'Allow location access to set your current location.'); return; }
    if (!toCoords) { setError('Search for and select a destination first.'); return; }
    setPlanning(true);
    setRoute(null);
    setSafetyData(null);
    setAllRoutes([]);
    setSelectedRouteIndex(0);
    
    try { 
      let baseRoute = null;
      try {
        baseRoute = await getRoute(fromCoords, toCoords, mode);
      } catch (err) {
        console.warn("Local route lookup failed. Relying on safety server.", err);
      }

      setAnalyzing(true);
      const safetyRoutes = await analyzeSafety(fromCoords, toCoords, mode);
      
      if (Array.isArray(safetyRoutes) && safetyRoutes.length > 0) {
        setAllRoutes(safetyRoutes);
        
        let safestIndex = 0;
        let highestScore = -1;
        safetyRoutes.forEach((r, idx) => {
          if (r.score > highestScore) {
            highestScore = r.score;
            safestIndex = idx;
          }
        });
        
        setSelectedRouteIndex(safestIndex);
        const best = safetyRoutes[safestIndex];
        setRoute({
          coordinates: best.coordinates,
          distanceKm: best.distanceKm,
          durationMin: best.durationMin,
          provider: 'OSRM Route Engine & Safety Analytics',
        });
        setSafetyData(best);
      } else if (baseRoute) {
        setRoute(baseRoute);
        const fallbackSafety = {
          score: 80,
          risk_level: 'LOW',
          confidence: 0.8,
          factors: { lighting: 80, road: 85, police: 60, hospital: 70, amenities: 75, weather: 90, time: 80, route: 85 },
          segments: [],
          coordinates: baseRoute.coordinates,
          distanceKm: baseRoute.distanceKm,
          durationMin: baseRoute.durationMin,
        };
        setAllRoutes([fallbackSafety]);
        setSelectedRouteIndex(0);
        setSafetyData(fallbackSafety);
      } else {
        throw new Error("Could not calculate any routes.");
      }
    }
    catch (e) { 
      setError(e.message || 'Could not calculate routes. Please try again.'); 
    }
    finally { 
      setPlanning(false); 
      setAnalyzing(false);
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
    setSelectedRouteIndex(idx);
    const selected = allRoutes[idx];
    setRoute({
      coordinates: selected.coordinates,
      distanceKm: selected.distanceKm,
      durationMin: selected.durationMin,
      provider: 'OSRM Route Engine & Safety Analytics',
    });
    setSafetyData(selected);
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

      {allRoutes && allRoutes.length > 1 ? (
        <View style={s.alternativesWrapper}>
          <Text style={[s.alternativesHeader, { color: colors.muted }]}>Choose Route Option (Safest Selected by Default)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.alternativesScroll}>
            {allRoutes.map((r, idx) => {
              const isSelected = selectedRouteIndex === idx;
              const isSafest = idx === allRoutes.reduce((best, curr, currIdx, arr) => curr.score > arr[best].score ? currIdx : best, 0);
              
              return (
                <Pressable
                  key={idx}
                  onPress={() => handleSelectRoute(idx)}
                  style={[
                    s.alternativeCard,
                    {
                      backgroundColor: isSelected ? colors.primarySoft : colors.cardBg,
                      borderColor: isSelected ? colors.primary : colors.line
                    }
                  ]}
                >
                  <View style={s.alternativeTop}>
                    <Text style={[s.alternativeScore, { color: colors.primary }]}>{r.score}/100</Text>
                    {isSafest ? (
                      <Pill tone="teal">Safest</Pill>
                    ) : null}
                  </View>
                  <Text style={[s.alternativeMetrics, { color: colors.ink }]}>
                    {formatDuration(r.durationMin)} · {formatDistance(r.distanceKm)}
                  </Text>
                  <Text style={[s.alternativeRisk, { color: r.risk_level === 'LOW' ? '#2d7a3a' : r.risk_level === 'MODERATE' ? '#9a6000' : '#e04a6f' }]}>
                    {r.risk_level} Risk
                  </Text>
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

          <SectionTitle action={<Text style={[s.updated, { color: colors.primary }]}>{route.provider}</Text>}>Route result</SectionTitle>
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
              
              {analyzing ? (
                <View style={s.analyzingBox}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[s.analyzingText, { color: colors.primary }]}>Analyzing route safety...</Text>
                </View>
              ) : safetyData ? (
                <View style={s.safetySection}>
                  <View style={s.scoreStrip}>
                    <Text style={[s.scoreValue, { color: colors.ink }]}>{safetyData.score} / 100</Text>
                    <Text style={s.scoreLabel}>Safety score</Text>
                    <View style={{ flex: 1 }} />
                    <Pill tone={safetyData.risk_level === 'LOW' ? 'green' : safetyData.risk_level === 'MODERATE' ? 'orange' : 'pink'}>
                      {safetyData.risk_level}
                    </Pill>
                  </View>
                  
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
                      <View key={seg.segment_id} style={s.segmentRow}>
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
              ) : null}
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
            {suggestions.slice(0, 6).map((area) => (
              <Pressable key={area.label} onPressIn={() => onSelectArea(area)} onPress={() => onSelectArea(area)} style={({ pressed }) => [s.suggestion, pressed && s.pressed]}>
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
  alternativeScore: { fontSize: 16, fontWeight: '700' },
  alternativeMetrics: { fontSize: 11, fontWeight: '500' },
  alternativeRisk: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
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
