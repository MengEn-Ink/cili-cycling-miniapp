Component({
  properties: {
    item: { type: Object, value: {} },
    featured: { type: Boolean, value: false },
  },
  data: {
    coverFailed: false,
  },
  observers: {
    'item.coverImage'() {
      this.setData({ coverFailed: false });
    },
  },
  methods: {
    open() {
      this.triggerEvent('open');
    },
    coverImageError() {
      this.setData({ coverFailed: true });
    },
    retry() {
      this.triggerEvent('retry');
    },
  },
});
