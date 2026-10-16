Component({
  properties: {
    status: { type: String, value: '' },
    ticket: { type: Boolean, value: false },
  },
  methods: {
    open() {
      this.triggerEvent('open');
    },
    retry() {
      this.triggerEvent('retry');
    },
  },
});
