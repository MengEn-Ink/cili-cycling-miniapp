Component({
  properties: {
    title: { type: String, value: '' },
    detail: { type: String, value: '' },
    state: { type: String, value: 'pending' },
    actionLabel: { type: String, value: '' },
  },
  methods: {
    onAction() {
      this.triggerEvent('action');
    },
  },
});
