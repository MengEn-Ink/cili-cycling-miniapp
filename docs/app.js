(() => {
  const data = window.prototypeData;
  const templates = window.pageTemplates;
  const pageById = new Map(data.pages.map((page) => [page.id, page]));
  const routeHistory = [];
  let currentRoute = 'activities';
  let toastTimer;

  const container = document.querySelector('#screen-container');
  const nav = document.querySelector('#screen-nav');
  const miniTitle = document.querySelector('#mini-title');
  const routePath = document.querySelector('#route-path');
  const screenTitle = document.querySelector('#screen-title');
  const screenCopy = document.querySelector('#screen-copy');
  const screenRole = document.querySelector('#screen-role');
  const screenState = document.querySelector('#screen-state');
  const modal = document.querySelector('#prototype-modal');
  const toast = document.querySelector('#demo-toast');

  function renderNavigation() {
    const groups = [...new Set(data.pages.map((page) => page.group))];
    nav.innerHTML = groups
      .map(
        (group) => `<section><h3>${group}</h3>${data.pages
          .filter((page) => page.group === group)
          .map(
            (page, index) =>
              `<button data-route="${page.id}"><span>${String(index + 1).padStart(2, '0')}</span><b>${page.title}</b></button>`,
          )
          .join('')}</section>`,
      )
      .join('');
  }

  function updateChrome(page) {
    miniTitle.textContent = page.navTitle;
    routePath.textContent = page.path;
    screenTitle.textContent = page.title;
    screenCopy.textContent = page.copy;
    screenRole.textContent = page.role;
    screenState.textContent = page.state;
    document.querySelectorAll('[data-route]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.route === page.id);
    });
    const activeTab = page.id === 'activity-detail' || page.id === 'registration-form' ? 'activities' : page.id;
    document.querySelectorAll('.tab-button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.route === activeTab);
    });
  }

  function showPage(route, options = {}) {
    const page = pageById.get(route) || pageById.get('activities');
    if (!options.replace && currentRoute !== page.id) routeHistory.push(currentRoute);
    currentRoute = page.id;
    container.innerHTML = templates[page.id]();
    container.scrollTop = 0;
    updateChrome(page);
    modal.hidden = true;
    const hash = `#${page.id}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 1800);
  }

  function showRider(name) {
    modal.innerHTML = `<button class="modal-close" data-action="close-modal" aria-label="关闭">×</button><div class="rider-avatar large">${name.slice(0, 1)}</div><small>公开骑行名片</small><h3>${name}</h3><p>近 90 天骑行 ${data.rider.rides90d} 次 · 最长 ${data.rider.longestKm} km</p><button class="prototype-button button-primary button-full" data-action="route" data-route="capability-card">查看完整名片</button>`;
    modal.hidden = false;
  }

  function goBack() {
    const previous = routeHistory.pop();
    showPage(previous || 'activities', { replace: true });
  }

  function runJourney(name) {
    const starts = {
      registration: 'activities',
      credential: 'registrations',
      profile: 'profile',
      admin: 'admin-activity-list',
    };
    showPage(starts[name]);
    showToast('旅程入口已切换，可在手机原型内继续操作');
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('[data-action], [data-route], [data-journey]');
    if (!target) return;
    if (target.dataset.journey) {
      runJourney(target.dataset.journey);
      return;
    }
    const action = target.dataset.action || (target.dataset.route ? 'route' : '');
    if (action === 'route') showPage(target.dataset.route);
    if (action === 'back') goBack();
    if (action === 'toast') showToast(target.dataset.message || '操作已完成');
    if (action === 'close-modal') modal.hidden = true;
    if (action === 'rider') showRider(target.dataset.rider);
    if (action === 'choice') {
      target.parentElement.querySelectorAll('button').forEach((button) => button.classList.remove('is-active'));
      target.classList.add('is-active');
    }
    if (action === 'filter') {
      target.parentElement.querySelectorAll('button').forEach((button) => button.classList.remove('is-active'));
      target.classList.add('is-active');
      showToast(target.dataset.filter === 'history' ? '已切换至历史活动' : '已切换至即将开始');
    }
    if (action === 'submit-registration') {
      showToast('报名已提交，等待管理员审核');
      window.setTimeout(() => showPage('registrations'), 600);
    }
    if (action === 'save-profile') {
      showToast('骑行资料已保存');
      window.setTimeout(() => showPage('profile'), 500);
    }
    if (action === 'publish-activity') {
      target.textContent = '已发布';
      target.disabled = true;
      showToast('活动已发布，骑友端现在可见');
    }
    if (action === 'approve-review' || action === 'reject-review') {
      showToast(action === 'approve-review' ? '报名已通过' : '报名已驳回');
      window.setTimeout(() => showPage('admin-reviews'), 500);
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') modal.hidden = true;
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const index = data.pages.findIndex((page) => page.id === currentRoute);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = (index + delta + data.pages.length) % data.pages.length;
    showPage(data.pages[next].id);
  });

  window.addEventListener('hashchange', () => {
    const requested = window.location.hash.slice(1);
    if (pageById.has(requested) && requested !== currentRoute) showPage(requested);
  });

  renderNavigation();
  const requested = window.location.hash.slice(1);
  showPage(pageById.has(requested) ? requested : 'activities', { replace: true });
})();
