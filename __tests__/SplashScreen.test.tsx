import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { SplashScreen } from '@/components/SplashScreen';

function flattenedStyle(
  style: ReactTestRenderer.ReactTestInstance['props']['style'],
): Record<string, unknown> {
  return StyleSheet.flatten(style) as Record<string, unknown>;
}

describe('SplashScreen', () => {
  test('keeps the crescent separated from the Kaaba emblem', async () => {
    jest.useFakeTimers();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    try {
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          <SplashScreen onFinish={jest.fn()} />,
        );
      });

      const crescent = renderer.root.findByProps({ testID: 'splash-crescent' });
      const artifact = renderer.root.findByProps({
        testID: 'splash-artifact-frame',
      });
      const crescentStyle = flattenedStyle(crescent.props.style);
      const artifactStyle = flattenedStyle(artifact.props.style);

      expect(crescentStyle.height).toBe(102);
      expect(crescentStyle.marginBottom).toBe(12);
      expect(artifactStyle.height).toBe(116);
      expect(Number(crescentStyle.marginBottom)).toBeGreaterThan(0);
    } finally {
      await ReactTestRenderer.act(async () => {
        renderer?.unmount();
      });
      jest.useRealTimers();
    }
  });
});
