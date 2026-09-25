import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppContext, type AppContextValue } from '../src/state/AppContext';
import { WellnessPromptSheet } from '../src/features/safety/WellnessPromptSheet';
import { PinPad } from '../src/features/safety/PinPad';
import { createMockApiClient } from './mockApi';
import { DEMO_DURESS_PIN, DEMO_NORMAL_PIN } from '../src/features/safety/pins';

function makeContextValue(api: ReturnType<typeof createMockApiClient>): AppContextValue {
  return {
    db: null,
    api,
    syncWorker: null,
    ready: true,
    accessToken: 'test-token',
    setAccessToken: () => {},
  };
}

/**
 * Drives the sheet to the "I'm fine" -> PIN -> confirmed flow and returns the rendered JSON
 * tree at the confirmed step, plus the mock api's recorded calls.
 */
async function runFinePath(pin: string) {
  const api = createMockApiClient();
  let renderer!: TestRenderer.ReactTestRenderer;

  await act(async () => {
    renderer = TestRenderer.create(
      <AppContext.Provider value={makeContextValue(api)}>
        <WellnessPromptSheet visible checkId="check-1" shiftId="shift-1" onClose={() => {}} />
      </AppContext.Provider>
    );
  });

  await act(async () => {
    renderer.root.findByProps({ testID: 'wellness-im-fine' }).props.onPress();
  });

  const pinPad = renderer.root.findByType(PinPad);
  await act(async () => {
    await pinPad.props.onSubmit(pin);
  });

  return { tree: renderer.toJSON(), calls: api.calls };
}

describe('duress PIN parity', () => {
  it('renders an IDENTICAL confirmation screen for the normal PIN and the duress PIN', async () => {
    const normal = await runFinePath(DEMO_NORMAL_PIN);
    const duress = await runFinePath(DEMO_DURESS_PIN);

    expect(normal.tree).not.toBeNull();
    // The core assertion: byte-identical rendered output between the two paths.
    expect(JSON.stringify(duress.tree)).toBe(JSON.stringify(normal.tree));
  });

  it('both paths call respond(ok) identically, but ONLY the duress PIN also calls the silent duress endpoint', async () => {
    const normal = await runFinePath(DEMO_NORMAL_PIN);
    const duress = await runFinePath(DEMO_DURESS_PIN);

    expect(normal.calls.respondWellnessCheck).toEqual([
      { checkId: 'check-1', response: 'ok', responseMode: 'pin' },
    ]);
    expect(duress.calls.respondWellnessCheck).toEqual([
      { checkId: 'check-1', response: 'ok', responseMode: 'pin' },
    ]);

    expect(normal.calls.postSafetyDuress).toEqual([]);
    expect(duress.calls.postSafetyDuress).toEqual(['shift-1']);
  });

  it('an invalid PIN reaches neither the respond nor the duress endpoint', async () => {
    const api = createMockApiClient();
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <AppContext.Provider value={makeContextValue(api)}>
          <WellnessPromptSheet visible checkId="check-1" shiftId="shift-1" onClose={() => {}} />
        </AppContext.Provider>
      );
    });
    await act(async () => {
      renderer.root.findByProps({ testID: 'wellness-im-fine' }).props.onPress();
    });
    const pinPad = renderer.root.findByType(PinPad);
    await act(async () => {
      await pinPad.props.onSubmit('0000');
    });

    expect(api.calls.respondWellnessCheck).toEqual([]);
    expect(api.calls.postSafetyDuress).toEqual([]);
  });
});
