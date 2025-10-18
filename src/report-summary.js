document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('reportSummary');
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  const path = params.get('path');

  const title = document.createElement('h1');
  title.textContent = `レポート詳細 ${id ? `(#${id})` : ''}`;

  const info = document.createElement('div');
  info.innerHTML = `<p>パス: <code>${path || 'なし'}</code></p>`;

  const actions = document.createElement('div');
  actions.className = 'summary-actions';

  const backBtn = document.createElement('button');
  backBtn.className = 'btn';
  backBtn.textContent = '戻る';
  backBtn.addEventListener('click', () => window.history.back());

  const openBtn = document.createElement('button');
  openBtn.className = 'btn';
  openBtn.textContent = '外部で開く';
  openBtn.addEventListener('click', () => {
    if (window.api && typeof window.api.openPath === 'function') {
      window.api.openPath(path);
    } else {
      alert('開く: ' + (path || 'パスなし'));
    }
  });

  actions.appendChild(backBtn);
  actions.appendChild(openBtn);

  container.appendChild(title);
  container.appendChild(info);
  container.appendChild(actions);
});