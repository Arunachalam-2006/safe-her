import { Redirect } from 'expo-router';

/** `/auth` always lands on the sign-in screen. */
export default function AuthIndex() {
  return <Redirect href="/auth/login" />;
}
