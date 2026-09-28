Component({
  properties: {},
  methods: {
    open() {
      this.triggerEvent('open');
    },
    retry() {
      this.triggerEvent('retry');
    },
  },
});
