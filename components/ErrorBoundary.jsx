import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';

/**
 * Root error boundary.
 *
 * There was none anywhere in the app, and expo-router does not install one by
 * default. Any render throw inside a screen (a bad map payload, a malformed
 * journey segment, a null deref) propagated to the navigator root, which in a
 * release build means a blank white screen with no message and no way out.
 *
 * Rendered once at the very top of `app/_layout.jsx`, above every provider.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('Unhandled render error:', error, info?.componentStack);
    }
  }

  handleReset() {
    this.setState({ error: null, info: null });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={s.root}>
        <ScrollView contentContainerStyle={s.content}>
          <View style={s.iconWrap}>
            <AlertTriangle color="#B45309" size={30} />
          </View>
          <Text style={s.title}>Something went wrong</Text>
          <Text style={s.body}>
            Safe-Her hit an unexpected error and stopped rendering this screen.
            Your SOS state and emergency contacts are unaffected.
          </Text>

          {__DEV__ ? (
            <View style={s.devBox}>
              <Text style={s.devText} selectable>
                {String(error?.message || error)}
                {'\n\n'}
                {info?.componentStack || ''}
              </Text>
            </View>
          ) : null}

          <Pressable
            onPress={this.handleReset}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={({ pressed }) => [s.btn, pressed && s.pressed]}
          >
            <RefreshCw color="#FFFFFF" size={18} />
            <Text style={s.btnText}>Try again</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF7F9' },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 22, backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#1E1B4B', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21, color: '#7C7289', textAlign: 'center' },
  devBox: {
    width: '100%', backgroundColor: '#F3E8FF', borderRadius: 14, padding: 12,
  },
  devText: { fontSize: 11, color: '#1E1B4B', fontFamily: 'monospace' },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#7C3AED',
    paddingHorizontal: 22, paddingVertical: 13, borderRadius: 16, marginTop: 6,
  },
  btnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  pressed: { opacity: 0.85 },
});

export default ErrorBoundary;
