Component({
  properties: {
    loading: { type: Boolean, value: false },
    error: { type: String, value: '' },
    empty: { type: Boolean, value: false },
    emptyTitle: { type: String, value: '暂无内容' },
    emptyCopy: { type: String, value: '暂时没有可展示的内容' },
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
