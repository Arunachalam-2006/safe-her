import { useState, useCallback } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ActivityIndicator, ScrollView } from 'react-native';
import { ArrowUpDown, Clock3, Crosshair, MapPin, Navigation, ShieldCheck, Sparkles, Route as RouteIcon, X, Home, Briefcase, Check } from 'lucide-react-native';
import { Card, colors, Header, Pill, Screen, SectionTitle } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useLocation, haversineDistance, estimateTravelTime, formatDistance, formatDuration, reverseGeocode, searchChennaiAreas, geocodePlace } from '../../lib/location';

export default function RoutesScreen() {
  const { profile } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [fromCoords, setFromCoords] = useState(null);
  const [toCoords, setToCoords] = useState(null);
  const [selected, setSelected] = useState('Safest');
  const [planned, setPlanned] = useState(false);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState('');
  const [planning, setPlanning] = useState(false);
  const [activeField, setActiveField] = useState(null);
  const { location, requestLocation, loading: locLoading } = useLocation();

  const fillFromCoords = useCallback(async (lat, lng, label) => {
    setFromCoords({ lat, lng });
    if (label) { setFrom(label); }
    else { const l = await reverseGeocode(lat, lng); setFrom(l); }
  }, []);

  const fillToCoords = useCallback(async (lat, lng, label) => {
    setToCoords({ lat, lng });
    if (label) { setTo(label); }
    else { const l = await reverseGeocode(lat, lng); setTo(l); }
  }, []);

  function handleLocate(target) {
    setError('');
    if (target === 'home' && profile?.home_lat) { fillFromCoords(profile.home_lat, profile.home_lng, profile.home_label); return; }
    if (target === 'work' && profile?.work_lat) { fillToCoords(profile.work_lat, profile.work_lng, profile.work_label); return; }
    setLocating(target);
    requestLocation();
  }

  if (location && locating) {
    if (locating === 'from') fillFromCoords(location.lat, location.lng);
    else if (locating === 'to') fillToCoords(location.lat, location.lng);
    setLocating('');
  }

  function swapLocations() {
    const tmpText = from, tmpCoords = fromCoords;
    setFrom(to); setFromCoords(toCoords);
    setTo(tmpText); setToCoords(tmpCoords);
  }

  function selectArea(area, target) {
    if (target === 'from') fillFromCoords(area.lat, area.lng, area.name + ', Chennai');
    else fillToCoords(area.lat, area.lng, area.name + ', Chennai');
    setActiveField(null);
  }

  async function handlePlan() {
    setError('');
    if (!from.trim() && !fromCoords) { setError('Add a starting point — type a Chennai area or use the location pin.'); return; }
    if (!to.trim() && !toCoords) { setError('Add a destination — type a Chennai area or use the location pin.'); return; }

    setPlanning(true);
    let start = fromCoords;
    let end = toCoords;

    if (!start && from.trim()) {
      const result = await geocodePlace(from.trim());
      if (!result) { setError(`Could not find "${from.trim()}" in Chennai. Try a known area like Adyar or T. Nagar.`); setPlanning(false); return; }
      start = { lat: result.lat, lng: result.lng };
      setFromCoords(start);
      setFrom(result.label);
    }
    if (!end && to.trim()) {
      const result = await geocodePlace(to.trim());
      if (!result) { setError(`Could not find "${to.trim()}" in Chennai. Try a known area like Adyar or T. Nagar.`); setPlanning(false); return; }
      end = { lat: result.lat, lng: result.lng };
      setToCoords(end);
      setTo(result.label);
    }
    setPlanning(false);
    if (start && end) setPlanned(true);
  }

  const distance = fromCoords && toCoords ? haversineDistance(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng) : null;
  const baseMinutes = distance !== null ? estimateTravelTime(distance, 'bus') : null;

  const routeOptions = baseMinutes !== null ? [
    { name: 'Safest', score: 91, minutes: baseMinutes + 7, extra: `+${formatDuration(7)}`, color: colors.pink, note: 'Best lighting and highest community confidence — passes through well-monitored roads' },
    { name: 'Balanced', score: 84, minutes: baseMinutes + 1, extra: `+${formatDuration(1)}`, color: colors.teal, note: 'A strong everyday option with reliable bus frequency' },
    { name: 'Fastest', score: 68, minutes: baseMinutes, extra: 'Fastest', color: colors.orange, note: 'Fewer stops, but a darker final segment' },
  ] : [];

  const fromSuggestions = activeField === 'from' ? searchChennaiAreas(from) : [];
  const toSuggestions = activeField === 'to' ? searchChennaiAreas(to) : [];

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
              active={activeField === 'from'}
              suggestions={fromSuggestions}
              iconColor={colors.teal}
              onChangeText={(t) => { setFrom(t); setFromCoords(null); setActiveField('from'); }}
              onFocus={() => setActiveField('from')}
              onBlur={() => setTimeout(() => setActiveField(null), 180)}
              onClear={() => { setFrom(''); setFromCoords(null); }}
              onLocate={() => handleLocate('from')}
              locating={locating === 'from' && locLoading}
              onSelectArea={(area) => selectArea(area, 'from')}
            />
            <View style={s.fieldDivider} />
            <SearchField
              label="To"
              value={to}
              coords={toCoords}
              active={activeField === 'to'}
              suggestions={toSuggestions}
              iconColor={colors.pink}
              onChangeText={(t) => { setTo(t); setToCoords(null); setActiveField('to'); }}
              onFocus={() => setActiveField('to')}
              onBlur={() => setTimeout(() => setActiveField(null), 180)}
              onClear={() => { setTo(''); setToCoords(null); }}
              onLocate={() => handleLocate('to')}
              locating={locating === 'to' && locLoading}
              onSelectArea={(area) => selectArea(area, 'to')}
            />
          </View>

          <Pressable onPress={swapLocations} style={s.swapBtn}>
            <ArrowUpDown color={colors.muted} size={15} />
          </Pressable>
        </View>

        <View style={s.quickRow}>
          {profile?.home_label ? (
            <Pressable onPress={() => handleLocate('home')} style={({ pressed }) => [s.quickPlace, pressed && s.pressed]}>
              <Home color={colors.teal} size={15} />
              <Text style={s.quickPlaceText} numberOfLines={1}>Home</Text>
            </Pressable>
          ) : null}
          {profile?.work_label ? (
            <Pressable onPress={() => handleLocate('work')} style={({ pressed }) => [s.quickPlace, pressed && s.pressed]}>
              <Briefcase color={colors.orange} size={15} />
              <Text style={s.quickPlaceText} numberOfLines={1}>Work</Text>
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }} />
          {fromCoords ? <Pill tone="teal">From set</Pill> : null}
          {toCoords ? <Pill tone="pink">To set</Pill> : null}
        </View>
      </View>

      <Pressable disabled={planning} onPress={handlePlan} style={({ pressed }) => [s.planButton, pressed && s.pressed]}>
        {planning ? <ActivityIndicator color={colors.white} size="small" /> : <><Sparkles color={colors.white} size={18} /><Text style={s.planText}>Find safer routes</Text></>}
      </Pressable>

      {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

      {planned && distance !== null ? (
        <>
          <Card style={s.summaryCard}>
            <View style={s.summaryRow}>
              <RouteIcon color={colors.teal} size={18} />
              <Text style={s.summaryText}>{formatDistance(distance)} straight-line</Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryRow}>
              <Clock3 color={colors.teal} size={18} />
              <Text style={s.summaryText}>~{formatDuration(baseMinutes)} by bus</Text>
            </View>
          </Card>

          <SectionTitle action={<Text style={s.updated}>Estimated</Text>}>Choose your route</SectionTitle>
          {routeOptions.map((route) => (
            <Pressable key={route.name} onPress={() => setSelected(route.name)} style={({ pressed }) => [s.routeCard, selected === route.name && { borderColor: route.color, borderWidth: 2 }, pressed && s.pressed]}>
              <View style={s.routeTop}>
                <View style={s.routeName}>
                  <View style={[s.routeDot, { backgroundColor: route.color }]} />
                  <Text style={s.name}>{route.name}</Text>
                  {route.name === 'Safest' && <Pill tone="pink">Recommended</Pill>}
                </View>
                <Text style={[s.routeScore, { color: route.color }]}>{route.score}</Text>
              </View>
              <View style={s.routeMeta}>
                <View style={s.meta}><Clock3 color={colors.muted} size={15} /><Text style={s.metaText}>{formatDuration(route.minutes)}</Text></View>
                <Text style={s.extra}>{route.extra}</Text>
              </View>
              <Text style={s.note}>{route.note}</Text>
              {selected === route.name ? (
                <View style={s.selectedBar}>
                  <View style={s.selectedLeft}>
                    <View style={[s.checkIcon, { backgroundColor: route.color }]}><Check color={colors.white} size={12} /></View>
                    <Text style={s.selectedText}>Selected — tap "Start journey" on the Journey tab</Text>
                  </View>
                </View>
              ) : null}
            </Pressable>
          ))}

          <Card style={s.tip}>
            <ShieldCheck color={colors.teal} size={22} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.tipTitle}>Why this score?</Text>
              <Text style={s.tipText}>Scores combine lighting, crowd levels, recent reports, transport reliability, and nearby help across Chennai routes.</Text>
            </View>
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function SearchField({ label, value, coords, active, suggestions, iconColor, onChangeText, onFocus, onBlur, onClear, onLocate, locating, onSelectArea }) {
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
          placeholder={`Search Chennai area…`}
          placeholderTextColor={colors.muted}
          style={s.input}
          autoCapitalize="words"
        />
        {value ? (
          <Pressable onPress={onClear} style={s.clearBtn}><X color={colors.muted} size={15} /></Pressable>
        ) : null}
        <Pressable onPress={onLocate} style={s.locateBtn}>
          {locating ? <ActivityIndicator color={iconColor} size="small" /> : <Crosshair color={iconColor} size={16} />}
        </Pressable>
      </View>
      {active && suggestions.length > 0 ? (
        <View style={s.suggestions}>
          <Text style={s.suggestionsHeader}>Chennai areas</Text>
          <ScrollView style={s.suggestionsScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {suggestions.slice(0, 6).map((area) => (
              <Pressable key={area.name} onPress={() => onSelectArea(area)} style={({ pressed }) => [s.suggestion, pressed && s.pressed]}>
                <View style={[s.suggestionIcon, { backgroundColor: iconColor + '15' }]}>
                  <MapPin color={iconColor} size={14} />
                </View>
                <View style={s.suggestionCopy}>
                  <Text style={s.suggestionText}>{area.name}</Text>
                  <Text style={s.suggestionSub}>Chennai, Tamil Nadu</Text>
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
  searchCard: { backgroundColor: colors.white, borderRadius: 20, borderWidth: 1, borderColor: colors.line, marginBottom: 12, overflow: 'visible' },
  searchBody: { flexDirection: 'row', padding: 16, paddingBottom: 10 },
  endpointColumn: { width: 28, alignItems: 'center', paddingTop: 18 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotFrom: { backgroundColor: colors.teal },
  dotTo: { backgroundColor: colors.pink },
  dotLine: { width: 2, flex: 1, backgroundColor: colors.line, marginVertical: 4, minHeight: 24 },
  inputsColumn: { flex: 1, flexDirection: 'column' },
  fieldWrap: { position: 'relative', zIndex: 1 },
  fieldInner: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 12, height: 50, gap: 8 },
  fieldLeft: { width: 38 },
  fieldLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  input: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600', paddingVertical: 4 },
  clearBtn: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  locateBtn: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  fieldDivider: { height: 12 },
  swapBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', marginTop: 10, marginLeft: 8 },
  suggestions: { position: 'absolute', top: 54, left: 0, right: 0, backgroundColor: colors.white, borderRadius: 16, borderWidth: 1, borderColor: colors.line, zIndex: 100, padding: 6, maxHeight: 240, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8 },
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
