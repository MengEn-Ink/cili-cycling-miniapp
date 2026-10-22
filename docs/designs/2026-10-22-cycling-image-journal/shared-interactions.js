(() => {
  const q = s => document.querySelector(s);
  const all = s => [...document.querySelectorAll(s)];
  const params = new URLSearchParams(location.search);
  const toast = text => {
    q('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = text;
    document.body.append(el); setTimeout(() => el.remove(), 3200);
  };
  const text = (s, value) => { const el = q(s); if (el) el.textContent = value; };
  const show = (s, yes) => all(s).forEach(el => { el.hidden = !yes; });
  const on = (s, handler, event = 'click') => all(s).forEach(el => el.addEventListener(event, handler));
  on('[data-toast]', e => toast(e.currentTarget.dataset.toast));
  all('[data-admin-only]').forEach(el => { el.hidden = params.get('role') !== 'admin'; });
  if (params.get('auth') === 'guest' && q('.profile-hero')) {
    q('.profile-hero').classList.add('profile-no-background');
    q('.profile-hero').replaceChildren();
    const identity = document.createElement('div');
    identity.className = 'profile-identity';
    identity.innerHTML = '<div><div class="eyebrow">此里 · 同行从这里开始</div><h1>先认识你。</h1><p>登录后设置头像与背景，完善报名资料。</p></div>';
    q('.profile-hero').append(identity);
    const content = q('.content');
    content.innerHTML = '<div class="profile-status">尚未登录</div><button class="btn" data-profile-login>微信登录</button>';
    content.querySelector('[data-profile-login]').onclick = () => { location.href = 'profile.html'; };
  }
  if (params.get('role') === 'admin') {
    all('a[href="profile.html"],a[href="settings.html"]').forEach(el => { el.href += '?role=admin'; });
  }
  on('.photo img', e => e.currentTarget.closest('.photo').classList.add('failed'), 'error');
  on('[data-retry-image]', e => {
    const p = e.currentTarget.closest('.photo'); p.classList.remove('failed');
    p.querySelector('img').src = p.querySelector('img').src;
  });
  on('.profile-background', () => {
    q('.profile-background').hidden = true;
    q('.profile-hero').classList.add('profile-no-background');
    q('[data-preview-background]').hidden = true;
    toast('背景暂不可用，个人资料仍可查看。');
  }, 'error');
  on('.avatar-trigger img', e => {
    e.currentTarget.hidden = true;
    const fallback = document.createElement('span');
    fallback.className = 'avatar initialavatar'; fallback.textContent = '山';
    e.currentTarget.parentElement.append(fallback);
    e.currentTarget.parentElement.disabled = true;
  }, 'error');
  const preview = (source, title) => {
    if (!source) return;
    q('[data-media-image]').src = source; text('[data-media-title]', title);
    q('#media-dialog')?.showModal();
  };
  on('[data-preview-background]', () => preview(q('.profile-background')?.src, '我的背景照片'));
  on('[data-preview-avatar]', () => preview(q('.avatar-trigger img')?.src, '我的头像'));
  on('[data-close]', e => e.currentTarget.closest('dialog').close());
  on('[data-profile-retry]', e => {
    e.currentTarget.disabled = true; e.currentTarget.textContent = '正在同步…';
    setTimeout(() => { location.href = 'profile.html'; }, 500);
  });
  let mediaPending = 0;
  let routeReady = !q('[data-publish]')?.disabled;
  const lockMedia = delta => {
    mediaPending = Math.max(0, mediaPending + delta);
    all('[data-profile-save-button]').forEach(el => { el.disabled = mediaPending > 0; });
    all('[data-publish]').forEach(el => { el.disabled = mediaPending > 0 || !routeReady; });
  };
  on('[data-upload]', e => {
    const el = e.currentTarget, f = el.files?.[0]; if (!f) return;
    const avatar = el.hasAttribute('data-avatar-upload');
    const limit = el.hasAttribute('data-background-upload') ? 20 : 5;
    if (!f.type.startsWith('image/') || f.size > limit * 1024 * 1024) {
      toast(`请选择不超过 ${limit} MB 的图片。`); el.value = ''; return;
    }
    const image = el.closest('.upload')?.querySelector('img');
    if (image) image.src = URL.createObjectURL(f);
    lockMedia(1);
    const status = avatar ? '[data-avatar-save-status]' : '[data-background-status]';
    text(status, avatar ? '正在上传并保存头像…' : '正在准备背景图片…');
    setTimeout(() => {
      lockMedia(-1); text(status, avatar ? '头像已单独保存 · 本地演示' : '背景已就绪，请保存资料');
      toast(avatar ? '头像已单独保存 · 本地演示' : '图片预览已准备好 · 本地演示');
    }, 750);
  }, 'change');
  on('[data-upload-qr]', e => {
    const f = e.currentTarget.files?.[0]; if (!f) return;
    if (!f.type.startsWith('image/') || f.size > 5 * 1024 * 1024) { toast('请选择不超过 5 MB 的二维码图片。'); return; }
    lockMedia(1); toast('正在准备群二维码…');
    setTimeout(() => { lockMedia(-1); toast('群二维码已准备好 · 本地演示'); }, 750);
  }, 'change');
  on('[data-avatar-first]', e => {
    const f = e.currentTarget.files?.[0]; if (!f) return;
    if (!f.type.startsWith('image/') || f.size > 5 * 1024 * 1024) { toast('请选择不超过 5 MB 的头像图片。'); return; }
    e.currentTarget.disabled = true;
    text('[data-avatar-save-status]', '正在上传并单独保存头像…');
    setTimeout(() => { location.href = 'profile-edit.html?avatarSaved=1'; }, 750);
  }, 'change');
  if (params.has('avatarSaved')) toast('头像已单独保存，现在可以填写报名资料。');
  if (params.has('saved')) toast('资料已保存 · 本地演示');
  if (params.get('mode') === 'open') {
    const stage = q('.timeline span:nth-child(2)');
    if (stage) stage.innerHTML = '<b>2</b>名额确认';
    text('[data-registration-stage]', '名额确认');
    text('[data-registration-copy]', '有名额时直接通过；名额已满时进入候补。');
    text('[data-registration-mode-note]', '公开报名：有名额时直接通过；名额已满时进入候补。');
    text('[data-registration-mode]', '公开报名');
  }
  on('[data-submit]', e => {
    e.preventDefault(); const form = e.currentTarget;
    if (mediaPending || !form.reportValidity()) return;
    if (q('[data-publish]')?.disabled) return;
    let target = form.dataset.submit;
    if (form.querySelector('#experience')) {
      const draft = {};
      new FormData(form).forEach((v, k) => { if (['experience', 'remark', 'gathering_mode'].includes(k)) draft[k] = String(v); });
      sessionStorage.setItem('cili-design-registration', JSON.stringify(draft));
      target = params.has('full') ? 'state-waiting.html' : params.get('mode') === 'open' ? 'state-public-success.html' : 'state-pending.html';
    }
    const button = form.querySelector('button[type=submit]');
    if (button) { button.disabled = true; button.textContent = '正在提交…'; }
    setTimeout(() => { location.href = target; }, 450);
  }, 'submit');
  if (location.pathname.endsWith('state-submit-error.html')) {
    try {
      const draft = JSON.parse(sessionStorage.getItem('cili-design-registration') || '{}');
      for (const [key, value] of Object.entries(draft)) {
        const field = document.getElementById(key);
        if (field) field.value = value;
      }
    } catch {}
  }
  on('[data-local-form]', e => { e.preventDefault(); if (e.currentTarget.reportValidity()) toast('演示资料已保留在当前页面。'); }, 'submit');
  on('[data-cancel]', () => q('#cancel-dialog')?.showModal());
  on('[data-confirm-cancel]', () => { location.href = 'registrations.html?cancelled=1'; });
  const ticket = q('[data-current-ticket]');
  if (ticket && (params.has('pending') || params.has('waiting') || params.has('cancelled'))) {
    const status = params.has('cancelled') ? 'cancelled' : params.has('waiting') ? 'waiting' : 'pending';
    text('[data-ticket-status]', { cancelled: '已取消', waiting: '候补中', pending: '待审核' }[status]);
    q('[data-ticket-status]').className = status === 'cancelled' ? 'tag' : 'tag warning';
    text('[data-ticket-hint]', { cancelled: '计划有变时，可重新报名', waiting: '名额确认后再出发', pending: '等待组织者确认' }[status]);
    const a = q('[data-ticket-next]');
    if (a) { a.textContent = status === 'cancelled' ? '重新报名' : '查看报名'; a.href = status === 'cancelled' ? 'registration-form.html' : 'credential.html?status=' + status; }
  }
  const credential = q('[data-credential-status]');
  if (credential) {
    const status = params.get('status') || 'approved';
    const labels = { approved: '审核通过', pending: '待审核', waiting: '候补中', checked_in: '已签到', rejected: '未通过', cancelled: '已取消' };
    const messages = { approved: '请向现场管理员出示本页完成签到。', pending: '组织者正在确认资料，审核通过后可出示凭证。', waiting: '本次名额已满，尚未获得有效出发凭证。', checked_in: '现场签到已完成，请按约定骑行。', rejected: '本次报名未通过，请查看意见并修改后重报。', cancelled: '本次报名已取消，需要时可重新报名。' };
    credential.textContent = labels[status] || labels.approved;
    credential.className = ['approved', 'checked_in'].includes(status) ? 'tag success' : 'tag warning';
    text('[data-credential-note]', messages[status] || messages.approved);
    show('[data-credential-active]', ['approved', 'checked_in'].includes(status));
    show('[data-cancel]', ['waiting', 'pending', 'approved'].includes(status));
    if (['pending', 'waiting'].includes(status)) {
      text('[data-credential-heading]', status === 'pending' ? '等一声，出发。' : '等待一个位置。');
      text('.voucher-title', '此里 CILI · 报名记录');
      const number = q('.voucher-number'); if (number) number.hidden = true;
    }
    if (status === 'rejected') {
      const reason = document.createElement('div'); reason.className = 'notice warning';
      reason.textContent = '审核意见：请补充近期骑行经验后重新报名。';
      q('.ticketbody')?.append(reason);
    }
  }
  on('[data-share-activity]', () => toast('微信分享将打开活动详情，仅分享活动信息。'));
  on('[data-tabgroup] [role=tab]', e => {
    const b = e.currentTarget;
    all('[data-tabgroup] [role=tab]').forEach(el => el.setAttribute('aria-selected', String(el === b)));
    const scope = q('[data-activity-results]');
    const source = q(b.dataset.panel === 'history' ? '#history-content' : '#upcoming-content');
    if (scope && source) scope.replaceChildren(...[...(source.content || source).childNodes].map(node => node.cloneNode(true)));
  });
  on('[data-compact]', e => { const list = q('[data-activity-results]'); list.classList.toggle('compact'); e.currentTarget.setAttribute('aria-pressed', String(list.classList.contains('compact'))); });
  on('[data-filter]', e => {
    const b = e.currentTarget; all('[data-filter]').forEach(el => el.setAttribute('aria-pressed', String(el === b)));
    let shown = 0;
    all('[data-review-state]').forEach(el => { el.hidden = b.dataset.filter !== '全部' && el.dataset.reviewState !== b.dataset.filter; if (!el.hidden) shown++; });
    show('[data-review-empty]', shown === 0);
  });
  const reviewStatus = params.get('status') || 'pending';
  if (q('[data-review-current]')) {
    const samples = {
      lin: ['林见山', '山风', '男', '19900000001', '林小川', '19900000002', '有经验', '希望按自己的节奏爬坡，感谢组织。'],
      chen: ['陈秋原', '松果', '女', '19900000003', '陈小秋', '19900000006', '新手', '首次参加这条路线，请多关照。'],
      zhou: ['周远', '阿远', '男', '19900000004', '周小远', '19900000007', '常骑', '熟悉往返路线，会按约定集合。'],
      xu: ['许小野', '小野', '女', '19900000005', '许小林', '19900000008', '新手', '希望参加本次骑行。']
    };
    const sample = samples[params.get('applicant')] || samples.lin;
    ['name', 'nickname', 'gender', 'phone', 'emergency-name', 'emergency-phone', 'experience', 'remark'].forEach((key, i) => {
      all('[data-review-' + key + ']').forEach(el => { el.textContent = sample[i]; });
    });
    text('[data-review-current]', { pending: '待审核', approved: '审核通过', checked_in: '已签到', rejected: '已驳回', waiting: '候补中' }[reviewStatus] || '待审核');
    show('[data-pending-actions]', reviewStatus === 'pending');
    show('[data-approved-actions]', reviewStatus === 'approved');
    show('[data-checked-actions]', reviewStatus === 'checked_in');
  }
  const finishReview = action => {
    show('[data-review-result]', true);
    text('[data-review-result]', action === 'reject' ? '已驳回 · 意见已保留' : action === 'checkin' ? '已签到 · 报名记录已更新' : '审核通过 · 骑友可查看凭证');
    all('[data-pending-actions],[data-approved-actions]').forEach(el => { el.hidden = true; });
    text('[data-review-current]', action === 'reject' ? '已驳回' : action === 'checkin' ? '已签到' : '审核通过');
    if (action === 'approve') show('[data-approved-actions]', true);
    if (action === 'checkin') show('[data-checked-actions]', true);
  };
  on('[data-review-action]', e => {
    const action = e.currentTarget.dataset.reviewAction, note = q('#review-note');
    if (action === 'reject' && !note?.value.trim()) {
      note.setCustomValidity('请填写驳回原因，便于骑友修改后重报。'); note.reportValidity();
      note.addEventListener('input', () => note.setCustomValidity(''), { once: true }); return;
    }
    if (action === 'checkin') {
      let d = q('#checkin-dialog');
      if (!d) {
        d = document.createElement('dialog'); d.className = 'dialog'; d.id = 'checkin-dialog';
        d.innerHTML = '<h2>确认现场签到？</h2><p>请核对本人及活动后完成签到，签到完成后不可取消报名。</p><div class="buttonpair"><button class="btn secondary" data-checkin-close>暂不签到</button><button class="btn" data-checkin-confirm>确认签到</button></div>';
        document.body.append(d); d.querySelector('[data-checkin-close]').onclick = () => d.close();
        d.querySelector('[data-checkin-confirm]').onclick = () => { d.close(); finishReview('checkin'); };
      }
      d.showModal(); return;
    }
    finishReview(action);
  });
  const prepareRoute = () => {
    routeReady = false; show('[data-route-preparing]', true); lockMedia(1);
    text('[data-route-preparing]', '正在解析并生成路线预览，完成前不能发布。');
    setTimeout(() => {
      routeReady = true; text('[data-route-preparing]', '路线预览已准备好并绑定 · 82 km / 986 m · 本地演示');
      text('[data-route-binding]', '已绑定'); text('#publish-help', '路线预览已绑定，请确认信息后发布。'); lockMedia(-1);
    }, 1000);
  };
  on('[data-gpx]', e => {
    const f = e.currentTarget.files?.[0]; if (!f) return;
    if (!f.name.toLowerCase().endsWith('.gpx') || f.size > 4 * 1024 * 1024) { toast('请选择不超过 4 MB 的 GPX 文件。'); return; }
    prepareRoute();
  }, 'change');
  on('[data-strava-import]', () => {
    const input = q('[data-strava-url]') || q('#strava-url');
    if (!input?.value.trim()) { input?.focus(); toast('请粘贴 Strava 路线地址。'); return; }
    if (!/^https:\/\/(?:www\.)?strava\.com\/routes\/[0-9]+\/?$/.test(input.value.trim())) { toast('请输入有效的 Strava 路线地址。'); return; }
    prepareRoute();
  });
  if (params.has('preparing') && q('[data-publish]')) { show('[data-route-preparing]', true); lockMedia(1); }
  on('[data-save-draft]', () => toast('草稿已保存 · 本地演示'));
  on('[data-notifications]', () => q('#subscription-dialog').showModal());
  on('[data-subscription-choice]', e => {
    q('#subscription-dialog').close(); show('[data-notification-result]', true);
    text('[data-notification-result]', e.currentTarget.dataset.subscriptionChoice === 'accept' ? '已完成本次订阅选择 · 不代表永久开启' : '本次未订阅，仍可在行程中查看报名状态');
  });
  on('[data-privacy]', () => toast('微信正式运行时打开小程序隐私管理。'));
  on('[data-cache-clear]', () => q('#cache-dialog').showModal());
  on('[data-cache-confirm]', () => { q('#cache-dialog').close(); toast('可重建缓存已清理，报名与个人资料保留。'); });
  const stravaState = params.get('strava');
  if (stravaState && q('[data-strava-status]')) {
    text('[data-strava-status]', { connected: '已连接', pending: '等待授权', error: '暂时无法连接' }[stravaState] || '尚未连接');
    text('[data-strava-note]', { connected: '可在活动编辑页粘贴 Strava 路线地址，导入后确认预览。', pending: '在浏览器完成授权后返回这里刷新状态。', error: '请稍后重试；活动编辑仍可手动导入 GPX。' }[stravaState] || '连接后可同步路线。');
    text('[data-strava-auth]', stravaState === 'connected' ? '刷新连接状态' : stravaState === 'pending' ? '刷新连接状态' : '重试连接');
  }
  on('[data-strava-auth]', e => {
    if (stravaState === 'connected') { toast('已刷新连接状态 · 本地演示'); return; }
    text('[data-strava-status]', '等待授权');
    text('[data-strava-note]', '正式运行时复制授权链接，在浏览器完成授权后返回刷新。');
    e.currentTarget.textContent = '刷新连接状态';
    e.currentTarget.onclick = null;
  });
})();
