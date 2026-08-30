import { useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator, ScrollView } from 'react-native';
import { Bike, Check, Clock3, Crosshair, Footprints, MapPin, Sparkles, Route as RouteIcon, Car, X } from 'lucide-react-native';
import { Card, Header, Pill, Screen, SectionTitle } from '../../components/ui';
import { useTheme } from '../../lib/theme';
import { useLocation, formatDistance, formatDuration, reverseGeocode, searchLocation, getRoute } from '../../lib/location';
import RouteMap from '../../components/RouteMap';

export default function RoutesScreen() {
  const { colors, isDark } = useTheme();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromCoords, setFromCoords] = useState(null);
  const [toCoords, setToCoords] = useState(null);
  const [route, setRoute] = useState(null);
  const [mode, setMode] = useState('driving');
  const [error, setError] = useState('');
  const [planning, setPlanning] = useState(false);
  const [activeField, setActiveField] = useState('to');
  const [searchField, setSearchField] = useState('to');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
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
    try { setRoute(await getRoute(fromCoords, toCoords, mode)); }
    catch (e) { setError(e.message || 'Could not calculate this route. Please try again.'); }
    finally { setPlanning(false); }
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
              onLocate={() => {}}
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

      {fromCoords || toCoords ? <Card style={s.mapCard}><RouteMap source={fromCoords} destination={toCoords} route={route} /></Card> : null}

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
          <View style={[s.routeCard, { backgroundColor: colors.cardBg, borderColor: colors.primary, borderWidth: 2 }]}>
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
          </View>

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

function SearchField({ label, value, coords, active, suggestions, iconColor, onChangeText, onFocus, onBlur, onClear, onLocate, locating, onSelectArea, editable = true, placeholder }) {
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
          {locating ? <ActivityIndicator color={iconColor} size="small" /> : <Crosshair color={iconColor} size={16} />}
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
  mapCard: { padding: 0, overflow: 'hidden', height: 230 },
  searchCard: { borderRadius: 20, borderWidth: 1, marginBottom: 12, overflow: 'visible' },
  searchBody: { flexDirection: 'row', padding: 16, paddingBottom: 10 },
  endpointColumn: { width: 28, alignItems: 'center', paddingTop: 18 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotLine: { width: 2, flex: 1, marginVertical: 4, minHeight: 24 },
  inputsColumn: { flex: 1, minWidth: 0, flexDirection: 'column' },
  fieldWrap: { position: 'relative', zIndex: 1, width: '100%' },
  fieldInner: { flexDirection: 'row', alignItems: 'center', width: '100%', borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 12, height: 50, gap: 8 },
  fieldLeft: { width: 38, flexShrink: 0 },
  fieldLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  input: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600', paddingVertical: 4, outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' },
  clearBtn: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  clearBtnHidden: { opacity: 0 },
  locateBtn: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  fieldDivider: { height: 12 },
  suggestions: { position: 'relative', marginTop: 6, borderRadius: 16, borderWidth: 1, zIndex: 100, padding: 6, maxHeight: 240 },
  suggestionsHeader: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 },
  suggestionsScroll: { maxHeight: 200 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 11, borderRadius: 12 },
  pressed: { opacity: 0.6 },
  suggestionIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  suggestionCopy: { flex: 1 },
  suggestionText: { fontSize: 14, fontWeight: '700' },
  suggestionSub: { fontSize: 11, marginTop: 2 },
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, borderTopWidth: 1 },
  planButton: { borderRadius: 16, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  planText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeChip: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, borderWidth: 1 },
  modeText: { fontSize: 12, fontWeight: '800' },
  errorBox: { backgroundColor: '#FFF0F0', borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { color: '#C24141', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryDivider: { width: 1, height: 20 },
  summaryText: { fontSize: 14, fontWeight: '800' },
  updated: { fontSize: 12, fontWeight: '700' },
  routeCard: { borderRadius: 18, padding: 16, marginBottom: 12 },
  routeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routeName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  name: { fontWeight: '800', fontSize: 16 },
  routeMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontWeight: '700', fontSize: 13 },
  extra: { fontSize: 12 },
  note: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  tipTitle: { fontWeight: '800', fontSize: 13, marginBottom: 4 },
  tipText: { lineHeight: 17, fontSize: 12 },
});
