Component({
  properties: { item: { type: Object, value: {} } },
  methods: {
    open() {
      this.triggerEvent('open');
    },
    retry() {
      this.triggerEvent('retry');
    },
  },
});
