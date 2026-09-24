import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAppContext } from '../../state/AppContext';
import { ApiError } from '../../api/client';
import type { AuthUser } from '../../api/types';
import { colors, spacing } from '../../ui/theme';
import { FlyingEagle } from '../../ui/FlyingEagle';
import { RibbonBanner } from '../../ui/RibbonBanner';

interface Props {
  onLoggedIn: (user: AuthUser, accessToken: string) => void;
}

export function LoginScreen({ onLoggedIn }: Props) {
  const { api, setAccessToken } = useAppContext();
  const [email, setEmail] = useState('canvasser@demo.local');
  const [password, setPassword] = useState('devpassword');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.login(email.trim(), password);
      setAccessToken(res.accessToken);
      onLoggedIn(res.user, res.accessToken);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.body.message ?? err.body.error);
      } else {
        setError(
          'Could not reach the server. Check that the API is running at localhost:3001 — ' +
            String(err instanceof Error ? err.message : err)
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.background}>
      {/* The animated icon still sweeps across the whole screen (see FlyingEagle) — this is
          the separate, large, real eagle photo the previous version buried behind a heavy
          scrim as a full-bleed background. It's its own panel now, placed between the
          title and the form so it's the clear visual center of the page rather than a tinted
          backdrop. Photo credit: assets/brand/CREDIT.md (USFWS, public domain). */}
      <FlyingEagle top={56} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.ribbonWrap}>
            <RibbonBanner label="Field Operations" width={200} />
          </View>
          <Text style={styles.title}>Canvasser sign in</Text>
          <Text style={styles.subtitle}>Demo credentials are pre-filled.</Text>
          <View style={styles.tricolorRule} />

          <View style={styles.eaglePanel}>
            <Image
              source={require('../../../assets/brand/bald-eagle.jpg')}
              style={styles.eagleImage}
              resizeMode="cover"
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              testID="login-email"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              testID="login-password"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, submitting && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              testID="login-submit"
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text style={styles.buttonText}>Sign in</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: colors.primary },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg, paddingVertical: spacing.xl },
  ribbonWrap: { alignItems: 'center', marginBottom: spacing.sm },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  tricolorRule: {
    height: 3,
    width: 64,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  // aspectRatio matches the source photo's own ~0.8 (2400x3000 portrait), not an arbitrary
  // wide band — a short wide crop of a portrait action shot loses everything that makes it
  // read as "an eagle" (this is the same mistake the console login's first pass made; see
  // apps/console/app/login/page.tsx's comment on the two-panel layout).
  eaglePanel: {
    width: '100%',
    aspectRatio: 0.82,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 3,
    borderColor: '#8a2432',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  eagleImage: { width: '100%', height: '100%' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
    borderTopWidth: 4,
    borderTopColor: '#8a2432',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  label: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.xs, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  error: { color: colors.danger, marginTop: spacing.md },
  button: {
    marginTop: spacing.lg,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.primaryText, fontSize: 16, fontWeight: '600' },
});
