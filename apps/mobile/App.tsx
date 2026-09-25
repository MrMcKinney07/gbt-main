import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useAppContext } from './src/state/AppContext';
import { LoginScreen } from './src/features/auth/LoginScreen';
import { ShiftStartScreen } from './src/features/shift/ShiftStartScreen';
import { DoorScreen } from './src/features/door/DoorScreen';
import { PhotoVerificationScreen } from './src/features/verification/PhotoVerificationScreen';
import { WellnessPromptSheet } from './src/features/safety/WellnessPromptSheet';
import { DebugScreen } from './src/features/debug/DebugScreen';
import { colors } from './src/ui/theme';
import type { AuthUser } from './src/api/types';

type Screen = 'login' | 'shiftStart' | 'door' | 'debug';

function Root() {
  const { ready } = useAppContext();
  const [screen, setScreen] = useState<Screen>('login');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [shift, setShift] = useState<{ id: string; photoIntervalProfileId: string } | null>(null);
  const [activeVerificationId, setActiveVerificationId] = useState<string | null>(null);
  const [wellnessCheckId, setWellnessCheckId] = useState<string | null>(null);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (screen === 'login') {
    return (
      <LoginScreen
        onLoggedIn={(loggedInUser) => {
          setUser(loggedInUser);
          setScreen('shiftStart');
        }}
      />
    );
  }

  if (screen === 'shiftStart' || !shift) {
    return (
      <ShiftStartScreen
        onShiftStarted={(newShift) => {
          setShift(newShift);
          setScreen('door');
        }}
      />
    );
  }

  if (activeVerificationId) {
    return (
      <PhotoVerificationScreen
        verificationId={activeVerificationId}
        shiftId={shift.id}
        onDone={() => setActiveVerificationId(null)}
      />
    );
  }

  if (screen === 'debug') {
    return (
      <DebugScreen
        onSimulateWellnessCheck={() => {
          setWellnessCheckId('debug-simulated-check');
          setScreen('door');
        }}
        onClose={() => setScreen('door')}
      />
    );
  }

  return (
    <>
      <DoorScreen
        shiftId={shift.id}
        onVerificationDue={setActiveVerificationId}
        onOpenDebug={() => setScreen('debug')}
      />
      <WellnessPromptSheet
        visible={Boolean(wellnessCheckId)}
        checkId={wellnessCheckId ?? ''}
        shiftId={shift.id}
        onClose={() => setWellnessCheckId(null)}
      />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <View style={styles.app}>
        <Root />
        <StatusBar style="auto" />
      </View>
    </AppProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});
