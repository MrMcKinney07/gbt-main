import React, { useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors, spacing } from '../../ui/theme';

interface CapturedPhoto {
  base64: string;
  capturedAt: string;
}

interface Props {
  onCaptured: (photo: CapturedPhoto) => void;
}

/**
 * Rear-camera-only capture view for photo verification. There is deliberately no `facing`
 * toggle and no gallery/file-import affordance anywhere in this component — the only way a
 * photo reaches the outbox from this feature is a fresh frame from this live camera. See
 * PhotoVerificationScreen.tsx and README "no image picker" note.
 *
 * Face-detection gating: docs/API_CONTRACT.md says the server rejects any submission with
 * `faceDetected: true` as defense-in-depth, and that "the mobile app must never submit a
 * frame with a detected face" as the primary control. TODO(real build): this scaffold does
 * NOT run on-device face detection — expo-face-detector is deprecated/unavailable on current
 * Expo SDKs. A real build should block capture (or block submit) using a maintained on-device
 * face detector, e.g. a Vision Camera frame processor backed by Google ML Kit / Apple Vision,
 * wired in as a config plugin, and only then set `faceDetected` from that real result. Here,
 * `faceDetected` is always reported `false`, which is honest about what this scaffold does not
 * do rather than fabricating a detection result — see README.
 */
export function CameraCapture({ onCaptured }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Camera access is needed for photo verification.</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant camera access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  async function handleCapture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6,
      });
      if (photo?.base64) {
        onCaptured({ base64: photo.base64, capturedAt: new Date().toISOString() });
      }
    } finally {
      setCapturing(false);
    }
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frameGuide} />
          <Text style={styles.overlayText}>
            Point at the street or the house number, not at people
          </Text>
        </View>
      </CameraView>
      <TouchableOpacity
        style={[styles.captureButton, capturing && styles.captureButtonDisabled]}
        onPress={handleCapture}
        disabled={capturing}
        testID="camera-capture-button"
      >
        <Text style={styles.captureButtonText}>{capturing ? 'Capturing…' : 'Capture'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  frameGuide: {
    marginTop: spacing.xl,
    width: '80%',
    aspectRatio: 4 / 3,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
    borderStyle: 'dashed',
  },
  overlayText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: spacing.sm,
    borderRadius: 8,
    marginBottom: spacing.lg,
  },
  captureButton: {
    backgroundColor: colors.verification,
    paddingVertical: 16,
    alignItems: 'center',
  },
  captureButtonDisabled: { opacity: 0.6 },
  captureButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  permissionText: { color: '#fff', textAlign: 'center', margin: spacing.lg },
  permissionButton: {
    backgroundColor: colors.verification,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignSelf: 'center',
  },
  permissionButtonText: { color: '#fff', fontWeight: '600' },
});
