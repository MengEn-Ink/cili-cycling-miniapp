type BlurSegment = {
  key: string;
  value: string;
  delay: number;
};

function splitText(text: string, animateBy: 'words' | 'letters', delay: number): BlurSegment[] {
  const values =
    animateBy === 'words'
      ? text.split(/(\s+)/).filter((value) => value.length > 0)
      : Array.from(text);
  return values.map((value, index) => ({
    key: `${index}-${value}`,
    value,
    delay: index * delay,
  }));
}

Component({
  properties: {
    text: { type: String, value: '' },
    animateBy: { type: String, value: 'words' },
    direction: { type: String, value: 'top' },
    delay: { type: Number, value: 80 },
    stepDuration: { type: Number, value: 360 },
    trigger: { type: null, value: true },
    reducedMotion: { type: Boolean, value: false },
  },
  data: {
    segments: [] as BlurSegment[],
    playing: false,
    reduced: false,
    ready: false,
    animationTimer: 0,
  },
  lifetimes: {
    attached() {
      this.setData({ ready: true }, () => this.prepare());
    },
    detached() {
      this.clearAnimationTimer();
    },
  },
  observers: {
    'text, animateBy, delay'() {
      this.prepare();
    },
    trigger(value: unknown) {
      if (value && this.data.ready) this.replay();
    },
  },
  methods: {
    prepare() {
      const animateBy = this.data.animateBy === 'letters' ? 'letters' : 'words';
      const segments = splitText(this.data.text, animateBy, Math.max(0, this.data.delay));
      const systemInfo = wx.getSystemInfoSync() as {
        reducedMotion?: boolean;
        benchmarkLevel?: number;
      };
      const reduced =
        this.data.reducedMotion ||
        systemInfo.reducedMotion === true ||
        (typeof systemInfo.benchmarkLevel === 'number' && systemInfo.benchmarkLevel < 0);
      this.setData({ segments, reduced, playing: false }, () => {
        if (this.data.ready && this.data.trigger) this.replay();
      });
    },
    replay() {
      this.clearAnimationTimer();
      if (this.data.reduced || !this.data.segments.length) {
        this.setData({ playing: false });
        this.triggerEvent('complete');
        return;
      }
      this.setData({ playing: true }, () => {
        wx.nextTick(() => this.setData({ playing: false }));
      });
      const duration =
        Math.max(0, this.data.stepDuration) +
        Math.max(0, this.data.delay) * Math.max(0, this.data.segments.length - 1);
      const timer = setTimeout(() => {
        this.setData({ animationTimer: 0 });
        this.triggerEvent('complete');
      }, duration);
      this.setData({ animationTimer: Number(timer) });
    },
    clearAnimationTimer() {
      const timer = (this.data as typeof this.data & { animationTimer?: number }).animationTimer;
      if (timer) clearTimeout(timer);
    },
  },
});

export { splitText };
