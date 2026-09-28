Component({
  properties: {
    loading: { type: Boolean, value: false },
    error: { type: String, value: '' },
    empty: { type: Boolean, value: false },
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
