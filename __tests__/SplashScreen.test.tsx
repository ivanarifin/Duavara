import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Animated, StyleSheet } from 'react-native';
import { SplashScreen } from '@/components/SplashScreen';

function flattenedStyle(
  style: ReactTestRenderer.ReactTestInstance['props']['style'],
): Record<string, unknown> {
  return StyleSheet.flatten(style) as Record<string, unknown>;
}

describe('SplashScreen', () => {
  test('keeps the crescent separated from the Kaaba emblem', () => {
    const animation = () => ({ start: jest.fn(), stop: jest.fn() });
    jest.spyOn(Animated, 'delay').mockImplementation(animation as never);
    jest.spyOn(Animated, 'timing').mockImplementation(animation as never);
    jest.spyOn(Animated, 'spring').mockImplementation(animation as never);
    jest.spyOn(Animated, 'sequence').mockImplementation(animation as never);
    jest.spyOn(Animated, 'parallel').mockImplementation(animation as never);
    jest.spyOn(Animated, 'loop').mockImplementation(animation as never);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    try {
      ReactTestRenderer.act(() => {
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
      ReactTestRenderer.act(() => {
        renderer?.unmount();
      });
      jest.restoreAllMocks();
    }
  });
});
