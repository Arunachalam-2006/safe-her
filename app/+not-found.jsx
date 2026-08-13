import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen is not available.</Text>
        <Link href="/" style={styles.link}>Return to SafeHer</Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#F7F9FC' },
  title: { color: '#12233F', fontSize: 20, fontWeight: '700', marginBottom: 16 },
  link: { color: '#007F7B', fontSize: 16, fontWeight: '700' },
});
