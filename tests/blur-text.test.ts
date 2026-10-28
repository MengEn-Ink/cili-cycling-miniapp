import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ComponentDefinition = {
  data: Record<string, unknown>;
  lifetimes: {
    attached(this: ComponentInstance): void;
    detached(this: ComponentInstance): void;
  };
  observers: {
    'text, animateBy, delay'(this: ComponentInstance): void;
    trigger(this: ComponentInstance, value: unknown): void;
  };
  methods: Record<string, (this: ComponentInstance) => void>;
};

type ComponentInstance = {
  data: Record<string, any>;
  setData(patch: Record<string, unknown>, callback?: () => void): void;
  triggerEvent: ReturnType<typeof vi.fn>;
  prepare(): void;
  replay(): void;
  clearAnimationTimer(): void;
};

async function loadDefinition(systemInfo: Record<string, unknown> = {}) {
  let definition: ComponentDefinition | undefined;
  vi.stubGlobal('Component', (value: ComponentDefinition) => {
    definition = value;
  });
  vi.stubGlobal('wx', {
    getSystemInfoSync: () => systemInfo,
    nextTick: (callback: () => void) => callback(),
  });
  vi.resetModules();
  await import('../miniprogram/components/blur-text/index');
  if (!definition) throw new Error('blur-text component was not registered');
  return definition;
}

function createInstance(
  definition: ComponentDefinition,
  overrides: Record<string, unknown> = {},
): ComponentInstance {
  const instance = {
    data: {
      text: '此里骑行',
      animateBy: 'words',
      direction: 'top',
      delay: 20,
      stepDuration: 100,
      trigger: true,
      reducedMotion: false,
      ...definition.data,
      ...overrides,
    },
    setData(
      this: { data: Record<string, unknown> },
      patch: Record<string, unknown>,
      callback?: () => void,
    ) {
      Object.assign(this.data, patch);
      callback?.();
    },
    triggerEvent: vi.fn(),
  } as unknown as ComponentInstance;

  for (const [name, method] of Object.entries(definition.methods)) {
    (instance as unknown as Record<string, unknown>)[name] = method.bind(instance);
  }
  return instance;
}

describe('blur-text runtime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ignores the initial trigger observer until attached and completes once', async () => {
    const definition = await loadDefinition();
    const instance = createInstance(definition);

    definition.observers.trigger.call(instance, true);
    expect(instance.triggerEvent).not.toHaveBeenCalled();

    definition.lifetimes.attached.call(instance);
    vi.runAllTimers();

    expect(instance.triggerEvent).toHaveBeenCalledTimes(1);
    expect(instance.triggerEvent).toHaveBeenCalledWith('complete');
  });

  it('completes once without playing when reduced motion is active', async () => {
    const definition = await loadDefinition({ reducedMotion: true });
    const instance = createInstance(definition);

    definition.observers.trigger.call(instance, true);
    definition.lifetimes.attached.call(instance);
    vi.runAllTimers();

    expect(instance.data.reduced).toBe(true);
    expect(instance.data.playing).toBe(false);
    expect(instance.triggerEvent).toHaveBeenCalledTimes(1);
    expect(instance.triggerEvent).toHaveBeenCalledWith('complete');
  });

  it('completes empty text exactly once after attached', async () => {
    const definition = await loadDefinition();
    const instance = createInstance(definition, { text: '' });

    definition.observers.trigger.call(instance, true);
    definition.lifetimes.attached.call(instance);
    vi.runAllTimers();

    expect(instance.data.segments).toEqual([]);
    expect(instance.triggerEvent).toHaveBeenCalledTimes(1);
    expect(instance.triggerEvent).toHaveBeenCalledWith('complete');
  });

  it('replay replaces the pending completion timer', async () => {
    const definition = await loadDefinition();
    const instance = createInstance(definition, { trigger: false });

    definition.lifetimes.attached.call(instance);
    instance.replay();
    instance.replay();
    vi.runAllTimers();

    expect(instance.triggerEvent).toHaveBeenCalledTimes(1);
    expect(instance.triggerEvent).toHaveBeenCalledWith('complete');
  });
});
