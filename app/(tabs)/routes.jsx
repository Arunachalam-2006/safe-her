import { useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator, ScrollView } from 'react-native';
import { Bike, Check, Clock3, Crosshair, Footprints, MapPin, Sparkles, Route as RouteIcon, Car, X } from 'lucide-react-native';
import { Card, colors, Header, Pill, Screen, SectionTitle } from '../../components/ui';
import { useLocation, formatDistance, formatDuration, reverseGeocode, searchLocation, getRoute } from '../../lib/location';
import RouteMap from '../../components/RouteMap';

export default function RoutesScreen() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromCoords, setFromCoords] = useState(null);
  const [toCoords, setToCoords] = useState(null);
  const [route, setRoute] = useState(null);
  const [mode, setMode] = useState('driving');
  const [error, setError] = useState('');
  const [planning, setPlanning] = useState(false);
  const [activeField, setActiveField] = useState('to');
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
    if (activeField !== 'to' || to.trim().length < 3) { setSuggestions([]); return undefined; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchLocation(to);
        if (!cancelled) setSuggestions(results);
      } catch (e) {
        if (!cancelled) setError('Could not search destinations. Check your connection and try again.');
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [to, activeField]);

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

      <View style={s.searchCard}>
        <View style={s.searchBody}>
          <View style={s.endpointColumn}>
            <View style={[s.dot, s.dotFrom]} />
            <View style={s.dotLine} />
            <View style={[s.dot, s.dotTo]} />
          </View>

          <View style={s.inputsColumn}>
            <SearchField
              label="From"
              value={from}
              coords={fromCoords}
              active={false}
              suggestions={[]}
              iconColor={colors.teal}
              editable={false}
              placeholder={locLoading ? 'Getting current location...' : 'Current location'}
              onChangeText={() => {}}
              onFocus={() => {}}
              onBlur={() => {}}
              onClear={() => {}}
              onLocate={requestLocation}
              locating={locLoading}
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
              onFocus={() => setActiveField('to')}
              onBlur={() => setTimeout(() => setActiveField(null), 500)}
              onClear={() => { setTo(''); setToCoords(null); }}
              onLocate={() => {}}
              locating={searching}
              onSelectArea={(place) => { setTo(place.name); setToCoords({ lat: place.lat, lng: place.lng }); setSuggestions([]); setActiveField(null); setError(''); }}
            />
          </View>

        </View>

        <View style={s.quickRow}>
          <View style={{ flex: 1 }} />
          {fromCoords ? <Pill tone="teal">From set</Pill> : null}
          {toCoords ? <Pill tone="pink">To set</Pill> : null}
        </View>
      </View>

      <Pressable disabled={planning} onPress={handlePlan} style={({ pressed }) => [s.planButton, pressed && s.pressed]}>
        {planning ? <ActivityIndicator color={colors.white} size="small" /> : <><Sparkles color={colors.white} size={18} /><Text style={s.planText}>Find safer routes</Text></>}
      </Pressable>

      <View style={s.modeRow}>
        {[['driving', 'Driving', Car], ['walking', 'Walking', Footprints], ['cycling', 'Cycling', Bike]].map(([key, label, Icon]) => (
          <Pressable key={key} onPress={() => { setMode(key); setRoute(null); }} style={[s.modeChip, mode === key && s.modeActive]}>
            <Icon color={mode === key ? colors.white : colors.muted} size={16} />
            <Text style={[s.modeText, mode === key && s.modeTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

      {fromCoords || toCoords ? <Card style={s.mapCard}><RouteMap source={fromCoords} destination={toCoords} route={route} /></Card> : null}

      {route ? (
        <>
          <Card style={s.summaryCard}>
            <View style={s.summaryRow}>
              <RouteIcon color={colors.teal} size={18} />
              <Text style={s.summaryText}>{formatDistance(route.distanceKm)} by road</Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryRow}>
              <Clock3 color={colors.teal} size={18} />
              <Text style={s.summaryText}>{formatDuration(route.durationMin)}{route.trafficDelayMin ? ` (+${route.trafficDelayMin} traffic)` : ''}</Text>
            </View>
          </Card>

          <SectionTitle action={<Text style={s.updated}>{route.provider}</Text>}>Route result</SectionTitle>
          <View style={[s.routeCard, { borderColor: colors.teal, borderWidth: 2 }]}>
              <View style={s.routeTop}>
                <View style={s.routeName}>
                  <View style={[s.routeDot, { backgroundColor: colors.teal }]} />
                  <Text style={s.name}>{mode === 'driving' ? 'Driving route' : mode === 'walking' ? 'Walking route' : 'Cycling route'}</Text>
                </View>
              </View>
              <View style={s.routeMeta}>
                <View style={s.meta}><Clock3 color={colors.muted} size={15} /><Text style={s.metaText}>{formatDuration(route.durationMin)}</Text></View>
                <Text style={s.extra}>{formatDistance(route.distanceKm)}</Text>
              </View>
              <Text style={s.note}>{route.provider}{route.trafficDelayMin ? `, including ${route.trafficDelayMin} min traffic delay.` : '.'}</Text>
          </View>

          <Card style={s.tip}>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.tipTitle}>Safety analysis coming soon</Text>
              <Text style={s.tipText}>This route uses real map data. Safety insights will be added in a future module.</Text>
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function SearchField({ label, value, coords, active, suggestions, iconColor, onChangeText, onFocus, onBlur, onClear, onLocate, locating, onSelectArea, editable = true, placeholder }) {
  return (
    <View style={s.fieldWrap}>
      <View style={[s.fieldInner, active && { borderColor: iconColor, borderWidth: 2 }]}>
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
          style={s.input}
          autoCapitalize="words"
        />
        <Pressable disabled={!value} onPress={onClear} style={[s.clearBtn, !value && s.clearBtnHidden]}><X color={colors.muted} size={15} /></Pressable>
        {onLocate ? <Pressable onPress={onLocate} style={s.locateBtn}>
          {locating ? <ActivityIndicator color={iconColor} size="small" /> : <Crosshair color={iconColor} size={16} />}
        </Pressable> : null}
      </View>
      {active && suggestions.length > 0 ? (
        <View style={s.suggestions}>
          <Text style={s.suggestionsHeader}>Real location results</Text>
          <ScrollView style={s.suggestionsScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {suggestions.slice(0, 6).map((area) => (
              <Pressable key={area.label} onPressIn={() => onSelectArea(area)} onPress={() => onSelectArea(area)} style={({ pressed }) => [s.suggestion, pressed && s.pressed]}>
                <View style={[s.suggestionIcon, { backgroundColor: iconColor + '15' }]}>
                  <MapPin color={iconColor} size={14} />
                </View>
                <View style={s.suggestionCopy}>
                  <Text style={s.suggestionText}>{area.name}</Text>
                  <Text style={s.suggestionSub}>{area.label.split(',').slice(2, 4).join(',').trim() || 'Location result'}</Text>
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
  searchCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, marginBottom: 12, overflow: 'visible' },
  searchBody: { flexDirection: 'row', padding: 16, paddingBottom: 10 },
  endpointColumn: { width: 28, alignItems: 'center', paddingTop: 18 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotFrom: { backgroundColor: colors.teal },
  dotTo: { backgroundColor: colors.pink },
  dotLine: { width: 2, flex: 1, backgroundColor: colors.line, marginVertical: 4, minHeight: 24 },
  inputsColumn: { flex: 1, minWidth: 0, flexDirection: 'column' },
  fieldWrap: { position: 'relative', zIndex: 1, width: '100%' },
  fieldInner: { flexDirection: 'row', alignItems: 'center', width: '100%', boxSizing: 'border-box', borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 12, height: 50, gap: 8 },
  fieldLeft: { width: 38, flexShrink: 0 },
  fieldLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  input: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 14, fontWeight: '600', paddingVertical: 4, outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' },
  clearBtn: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  clearBtnHidden: { opacity: 0 },
  locateBtn: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  fieldDivider: { height: 12 },
  swapBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', marginTop: 10, marginLeft: 8 },
  suggestions: { position: 'relative', marginTop: 6, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, zIndex: 100, padding: 6, maxHeight: 240, boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.12)' },
  suggestionsHeader: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, color: colors.muted, textTransform: 'uppercase', paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 },
  suggestionsScroll: { maxHeight: 200 },
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 11, borderRadius: 12 },
  pressed: { opacity: 0.6 },
  suggestionIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  suggestionCopy: { flex: 1 },
  suggestionText: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  suggestionSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.line },
  quickPlace: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.paper, borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  quickPlaceText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  planButton: { backgroundColor: colors.teal, borderRadius: 16, height: 52, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  planText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeChip: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  modeActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  modeText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  modeTextActive: { color: colors.white },
  errorBox: { backgroundColor: '#FFF0F0', borderRadius: 12, padding: 12, marginBottom: 16 },
  errorText: { color: '#C24141', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  summaryCard: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryDivider: { width: 1, height: 20, backgroundColor: colors.line },
  summaryText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  updated: { color: colors.teal, fontSize: 12, fontWeight: '700' },
  routeCard: { backgroundColor: colors.white, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 12 },
  routeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  routeName: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeDot: { width: 10, height: 10, borderRadius: 5 },
  name: { color: colors.ink, fontWeight: '800', fontSize: 16 },
  routeScore: { fontSize: 28, fontWeight: '800' },
  routeMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 16 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: colors.ink, fontWeight: '700', fontSize: 13 },
  extra: { color: colors.muted, fontSize: 12 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12 },
  selectedBar: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line },
  selectedLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkIcon: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  selectedText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  tip: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.tealSoft, borderColor: colors.tealSoft, marginTop: 4 },
  tipTitle: { color: colors.ink, fontWeight: '800', fontSize: 13, marginBottom: 4 },
  tipText: { color: colors.muted, lineHeight: 17, fontSize: 12 },
});
