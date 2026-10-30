Component({
  properties: {
    src: { type: String, value: '' },
    size: { type: String, value: 'md' },
    ariaLabel: { type: String, value: '' },
    onMedia: { type: Boolean, value: false },
    roundedSquare: { type: Boolean, value: false },
  },
  data: { imageFailed: false },
  observers: {
    src() {
      this.setData({ imageFailed: false });
    },
  },
  methods: {
    imageError() {
      this.setData({ imageFailed: true });
      this.triggerEvent('error', { src: this.data.src });
    },
    avatarTap() {
      this.triggerEvent('tap', { src: this.data.src });
    },
  },
});
