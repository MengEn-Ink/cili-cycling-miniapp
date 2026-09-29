Component({
  properties: {
    loading: { type: Boolean, value: false },
    error: { type: String, value: '' },
    empty: { type: Boolean, value: false },
    loadingTitle: { type: String, value: '正在加载' },
    loadingCopy: { type: String, value: '正在同步骑行数据…' },
    emptyTitle: { type: String, value: '暂无内容' },
    emptyCopy: { type: String, value: '暂时没有可展示的内容' },
    retryable: { type: Boolean, value: false },
  },
  data: {
    politeAnnouncement: '',
    assertiveAnnouncement: '',
  },
  observers: {
    'loading, error, empty, loadingTitle, loadingCopy, emptyTitle, emptyCopy'(
      loading: boolean,
      error: string,
      empty: boolean,
      loadingTitle: string,
      loadingCopy: string,
      emptyTitle: string,
      emptyCopy: string,
    ) {
      this.setData({
        politeAnnouncement: loading
          ? `${loadingTitle}。${loadingCopy}`
          : error
            ? ''
            : empty
              ? `${emptyTitle}。${emptyCopy}`
              : '内容已就绪',
        assertiveAnnouncement: error ? `加载失败。${error}` : '',
      });
    },
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
