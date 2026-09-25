import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing } from 'react-native';
import { EagleMark } from './EagleMark';

/**
 * The eagle glides left-off-screen to right-off-screen, loops continuously. Mirrors
 * apps/console's `.flying-eagle` / `@keyframes fly-across` (globals.css) in spirit — same
 * idea, native Animated API instead of CSS since RN has no keyframe animations.
 */
export function FlyingEagle({ top = 60 }: { top?: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  const width = Dimensions.get('window').width;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 9000,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-80, width + 80],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, -14, 6, -10, 0],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.06, 0.94, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top,
        left: 0,
        opacity,
        transform: [{ translateX }, { translateY }],
      }}
    >
      <EagleMark size={56} color="#ffffff" />
    </Animated.View>
  );
}
