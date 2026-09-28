Component({
  properties: { status: { type: String, value: '' } },
  methods: {
    open() {
      this.triggerEvent('open');
    },
    retry() {
      this.triggerEvent('retry');
    },
  },
});
