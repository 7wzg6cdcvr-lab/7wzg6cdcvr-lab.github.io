/* ══════════════════════════════════════════════════════════════
   DC Family — painel de Tickets
   Lista (separada em Aberto/Resolvidos), abre, responde, muda
   estado e categoria — tudo a partir do site. O pedido passa
   sempre pelo Code.gs (autenticado com o PIN da app) — o token do
   GitHub nunca chega ao browser.
   ══════════════════════════════════════════════════════════════ */
const Tickets = (() => {
  let screen = 'list';      // 'list' | 'detail' | 'new'
  let cache = [];

  const fmtDate = iso => new Date(iso).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' });
  const fmtDateTime = iso => new Date(iso).toLocaleDateString('pt-PT', { day:'2-digit', month:'short', year:'numeric' }) +
    ' às ' + new Date(iso).toLocaleTimeString('pt-PT', { hour:'2-digit', minute:'2-digit' });
  const esc = s => (s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Transforma "![nome](url)" e "[📎 nome](url)" em imagens/links a sério,
  // escapando tudo o resto normalmente (só usamos markdown para anexos).
  function renderRich(raw){
    const tokens = [];
    let text = (raw || '').replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, url) => {
      tokens.push(`<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="${esc(alt)}" style="max-width:100%;border-radius:10px;margin-top:8px;display:block"></a>`);
      return `\u0000${tokens.length-1}\u0000`;
    });
    text = text.replace(/\[📎 (.*?)\]\((.*?)\)/g, (m, name, url) => {
      tokens.push(`<a href="${url}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:8px 12px;background:#181D26;border:1px solid rgba(255,255,255,0.08);border-radius:9px;color:#F4D27A;font-size:12.5px;text-decoration:none">📎 ${esc(name)}</a>`);
      return `\u0000${tokens.length-1}\u0000`;
    });
    let out = esc(text);
    out = out.replace(/\u0000(\d+)\u0000/g, (m, i) => tokens[i]);
    return out;
  }

  const STATUSES = ['Novo', 'Pendente', 'Em Progresso', 'Resolvido'];
  const STATUS_COLOR = { 'Novo':'#A78BFA', 'Pendente':'#F0A93A', 'Em Progresso':'#5B8DEF', 'Resolvido':'#34D399' };
  const CATEGORIES = ['Casa', 'Família', 'Saúde', 'Website'];
  const CAT_COLOR  = { 'Casa':'#F0A93A', 'Família':'#FF6B5E', 'Saúde':'#34D399', 'Website':'#5B8DEF' };
  const CAT_ICON   = { 'Casa':'🏠', 'Família':'👨‍👩‍👧‍👦', 'Saúde':'🩺', 'Website':'🌐' };

  let pendingFile = null; // { filename, mimeType, dataBase64 } — anexo escolhido antes de enviar

  function shellHTML(){
    return `
    <div id="dm-ticket" style="position:fixed;inset:0;background:#0A0D12;z-index:9998;display:flex;flex-direction:column;font-family:'DM Sans',sans-serif">
      <div style="display:flex;align-items:center;gap:10px;padding:calc(28px + env(safe-area-inset-top)) 16px 14px;border-bottom:1px solid rgba(255,255,255,0.06)">
        <button id="dm-t-back" style="background:none;border:none;color:#8B95A5;font-size:20px;cursor:pointer;display:none;padding:0 4px 0 0">‹</button>
        <div id="dm-t-title" style="flex:1;font-size:16px;font-weight:600;color:#F2F4F7">Tickets</div>
        <button id="dm-t-new" style="background:#212938;border:1px solid rgba(255,255,255,0.08);color:#F4D27A;font-size:13px;font-weight:600;padding:7px 12px;border-radius:9px;cursor:pointer;font-family:inherit">+ Novo</button>
        <button id="dm-t-close" style="background:none;border:none;color:#8B95A5;font-size:24px;cursor:pointer;line-height:1;padding:0 0 0 6px">×</button>
      </div>
      <div id="dm-t-body" style="flex:1;overflow-y:auto;padding:16px;-webkit-overflow-scrolling:touch"></div>
    </div>`;
  }

  function open(){
    if (document.getElementById('dm-ticket')) return;
    document.body.insertAdjacentHTML('beforeend', shellHTML());
    document.getElementById('dm-t-close').onclick = () => { screen === 'list' ? close() : renderList(); };
    document.getElementById('dm-t-new').onclick = () => renderNew();
    document.getElementById('dm-t-back').onclick = () => renderList();
    renderList();
  }

  // Abre o painel já diretamente num ticket (usado quando se chega por
  // uma notificação, via ?ticket=N no URL).
  function openTicket(number){
    if (document.getElementById('dm-ticket')) { renderDetail(number); return; }
    document.body.insertAdjacentHTML('beforeend', shellHTML());
    document.getElementById('dm-t-close').onclick = () => { screen === 'list' ? close() : renderList(); };
    document.getElementById('dm-t-new').onclick = () => renderNew();
    document.getElementById('dm-t-back').onclick = () => renderList();
    renderDetail(number);
  }

  function close(){ const el = document.getElementById('dm-ticket'); if (el) el.remove(); refreshBadge(); }

  // Mostra quantos tickets estão "Novo" num pequeno selo sobre o botão
  // "🎫 Tickets" da página principal (id="dm-t-badge", se existir na página).
  async function refreshBadge(){
    const badge = document.getElementById('dm-t-badge');
    try {
      const d = await api('listTickets', {});
      if (!d.ok) return;
      const n = d.tickets.filter(t => t.status === 'Novo').length;

      if (badge) {
        if (n > 0) { badge.textContent = n > 9 ? '9+' : String(n); badge.style.display = 'flex'; }
        else { badge.style.display = 'none'; }
      }

      // Selo no ícone do ecrã principal (só funciona com a app instalada/standalone).
      if ('setAppBadge' in navigator) {
        if (n > 0) navigator.setAppBadge(n).catch(()=>{});
        else navigator.clearAppBadge().catch(()=>{});
      }
    } catch (e) { /* sem rede, sem selo — não é crítico */ }
  }

  function setChrome({ title, back, showNew }){
    document.getElementById('dm-t-title').textContent = title;
    document.getElementById('dm-t-back').style.display = back ? 'block' : 'none';
    document.getElementById('dm-t-new').style.display = showNew ? 'block' : 'none';
  }

  async function api(action, params, method){
    const pin = Auth.getStoredPin() || '';
    const url = Auth.API_URL + '?' + new URLSearchParams(Object.assign({ action, pin }, params||{})).toString();
    const r = await fetch(url, { method: method || 'GET' });
    return r.json();
  }

  // Anexos vão no corpo do pedido (podem ser maiores do que um URL aguenta).
  async function apiUpload(number, filename, mimeType, dataBase64){
    const pin = Auth.getStoredPin() || '';
    const url = Auth.API_URL + '?action=uploadAttachment';
    const r = await fetch(url, { method:'POST', body: JSON.stringify({ pin, number, filename, mimeType, dataBase64 }) });
    return r.json();
  }

  function readFileAsBase64(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function pill(label, color){
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:20px;font-size:10.5px;font-weight:600;background:${color}22;color:${color};border:1px solid ${color}44">${label}</span>`;
  }
  function statusPill(s){
    const c = STATUS_COLOR[s] || '#5C6576';
    return pill(s, c);
  }
  function catPill(cat){
    if (!cat) return '';
    const c = CAT_COLOR[cat] || '#8B95A5';
    const icon = CAT_ICON[cat] || '';
    return pill((icon?icon+' ':'')+cat, c);
  }

  function tableHeaderHTML(){
    return `<div style="display:flex;align-items:center;gap:0;padding:6px 4px;border-bottom:1px solid rgba(255,255,255,0.1);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#5C6576">
      <div style="width:38px;flex-shrink:0">#</div>
      <div style="width:26px;flex-shrink:0">Cat</div>
      <div style="flex:1;min-width:0;padding-right:8px">Assunto</div>
      <div style="width:82px;flex-shrink:0;text-align:right">Estado</div>
    </div>`;
  }

  function rowHTML(t){
    const statusColor = STATUS_COLOR[t.status] || '#5C6576';
    return `
      <div class="dm-t-row" data-n="${t.number}" style="display:flex;align-items:center;gap:0;padding:12px 4px;border-bottom:1px solid rgba(255,255,255,0.06);cursor:pointer;font-size:12.5px">
        <div style="width:38px;flex-shrink:0;color:#5C6576">#${t.number}</div>
        <div style="width:26px;flex-shrink:0;font-size:14px" title="${t.category||''}">${t.category ? (CAT_ICON[t.category]||'📁') : ''}</div>
        <div style="flex:1;min-width:0;padding-right:8px;color:#F2F4F7;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.title)}</div>
        <div style="width:82px;flex-shrink:0;text-align:right"><span style="display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:600;background:${statusColor}22;color:${statusColor};border:1px solid ${statusColor}44;white-space:nowrap">${t.status}</span></div>
      </div>`;
  }

  // ── Lista, separada em Em Aberto / Resolvidos ──
  async function renderList(){
    screen = 'list';
    setChrome({ title:'Tickets', back:false, showNew:true });
    const body = document.getElementById('dm-t-body');
    body.innerHTML = `<div style="text-align:center;color:#8B95A5;font-size:13px;padding:30px 0">A carregar…</div>`;

    const d = await api('listTickets', {});
    if (!d.ok) { body.innerHTML = `<div style="color:#FF6B5E;font-size:13px;text-align:center;padding:20px 0">Erro: ${esc(d.error||'desconhecido')}</div>`; return; }
    cache = d.tickets;

    if (!cache.length) {
      body.innerHTML = `<div style="text-align:center;color:#8B95A5;font-size:13px;padding:40px 20px">Sem tickets ainda.<br>Toca em "+ Novo" para criar o primeiro.</div>`;
      return;
    }

    const abertos    = cache.filter(t => t.status !== 'Resolvido' && !t.archived);
    const resolvidos = cache.filter(t => t.status === 'Resolvido' && !t.archived);
    const arquivados = cache.filter(t => t.archived);

    const tableWrap = (rowsHTML) => `${tableHeaderHTML()}${rowsHTML}`;

    body.innerHTML = `
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#8B95A5;margin-bottom:4px">Em Aberto${abertos.length?' ('+abertos.length+')':''}</div>
      ${abertos.length ? tableWrap(abertos.map(rowHTML).join('')) : '<div style="color:#5C6576;font-size:12.5px;padding:10px 0 18px">Nada em aberto.</div>'}

      <button id="dm-t-resolved-toggle" style="width:100%;display:flex;align-items:center;justify-content:space-between;
        background:none;border:none;padding:14px 4px;margin-top:8px;border-top:1px solid rgba(255,255,255,0.06);cursor:pointer;font-family:inherit">
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#8B95A5">Resolvidos${resolvidos.length?' ('+resolvidos.length+')':''}</span>
        <span id="dm-t-resolved-arrow" style="color:#5C6576;font-size:11px;transition:transform .2s">▼</span>
      </button>
      <div id="dm-t-resolved-list" style="display:none">
        ${resolvidos.length ? tableWrap(resolvidos.map(rowHTML).join('')) : '<div style="color:#5C6576;font-size:12.5px;padding:10px 0">Ainda nenhum.</div>'}
      </div>

      <button id="dm-t-archived-toggle" style="width:100%;display:flex;align-items:center;justify-content:space-between;
        background:none;border:none;padding:14px 4px;margin-top:4px;border-top:1px solid rgba(255,255,255,0.06);cursor:pointer;font-family:inherit">
        <span style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:#8B95A5">Arquivados${arquivados.length?' ('+arquivados.length+')':''}</span>
        <span id="dm-t-archived-arrow" style="color:#5C6576;font-size:11px;transition:transform .2s">▼</span>
      </button>
      <div id="dm-t-archived-list" style="display:none">
        ${arquivados.length ? tableWrap(arquivados.map(rowHTML).join('')) : '<div style="color:#5C6576;font-size:12.5px;padding:10px 0">Ainda nenhum. Tickets resolvidos há mais de 30 dias aparecem aqui automaticamente.</div>'}
      </div>
    `;

    document.getElementById('dm-t-resolved-toggle').onclick = () => {
      const list  = document.getElementById('dm-t-resolved-list');
      const arrow = document.getElementById('dm-t-resolved-arrow');
      const open  = list.style.display === 'block';
      list.style.display = open ? 'none' : 'block';
      arrow.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
    };
    document.getElementById('dm-t-archived-toggle').onclick = () => {
      const list  = document.getElementById('dm-t-archived-list');
      const arrow = document.getElementById('dm-t-archived-arrow');
      const open  = list.style.display === 'block';
      list.style.display = open ? 'none' : 'block';
      arrow.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
    };

    body.querySelectorAll('.dm-t-row').forEach(row => {
      row.onclick = () => renderDetail(parseInt(row.dataset.n, 10));
    });
  }

  // ── Detalhe ──
  async function renderDetail(number){
    screen = 'detail';
    setChrome({ title:'#'+number, back:true, showNew:false });
    const body = document.getElementById('dm-t-body');
    body.innerHTML = `<div style="text-align:center;color:#8B95A5;font-size:13px;padding:30px 0">A carregar…</div>`;

    const d = await api('getTicket', { number });
    if (!d.ok) { body.innerHTML = `<div style="color:#FF6B5E;font-size:13px;text-align:center;padding:20px 0">Erro: ${esc(d.error||'desconhecido')}</div>`; return; }
    const t = d.ticket;

    const commentsHTML = t.comments.map(c => {
      const m = c.body.match(/^\*\*(.+?):\*\*\n\n([\s\S]*)$/);
      const who = m ? m[1] : c.author;
      const text = m ? m[2] : c.body;
      return `
      <div style="background:#12161D;border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:12px 14px;margin-bottom:8px">
        <div style="font-size:11.5px;color:#8B95A5;font-weight:600;margin-bottom:5px">${esc(who)} <span style="color:#5C6576;font-weight:400">· ${fmtDateTime(c.createdAt)}</span></div>
        <div style="font-size:13.5px;color:#F2F4F7;white-space:pre-wrap;line-height:1.45">${renderRich(text)}</div>
      </div>`;
    }).join('');

    body.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px">
        ${STATUSES.map(s => `
          <button class="dm-t-status-btn" data-s="${esc(s)}" style="padding:9px 4px;border-radius:9px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:inherit;
            border:1px solid ${t.status===s ? STATUS_COLOR[s] : 'rgba(255,255,255,0.08)'};
            background:${t.status===s ? STATUS_COLOR[s]+'22' : '#181D26'};
            color:${t.status===s ? STATUS_COLOR[s] : '#8B95A5'}">${esc(s)}</button>
        `).join('')}
      </div>
      <select id="dm-t-category" style="width:100%;padding:9px 11px;margin-bottom:16px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:13px;font-family:inherit">
        <option value="">Sem categoria</option>
        ${CATEGORIES.map(c => `<option value="${esc(c)}" ${t.category===c?'selected':''}>${(CAT_ICON[c]||'')+' '+c}</option>`).join('')}
      </select>
      <div style="font-size:16px;font-weight:600;color:#F2F4F7;margin-bottom:6px">${esc(t.title)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px">
        ${statusPill(t.status)}
        ${catPill(t.category)}
      </div>
      ${(() => {
        const m = t.body.match(/^([\s\S]*?)\n*_Criado por (.+?) a partir da app DC Family\._\s*$/);
        const cleanBody = m ? m[1].trim() : t.body;
        const creator = m ? m[2] : null;
        const createdLine = 'Criado ' + (creator ? 'por ' + esc(creator) + ' ' : '') + '· ' + fmtDateTime(t.createdAt);
        return `<div style="font-size:11.5px;color:#5C6576;margin-bottom:14px">${createdLine}</div>` +
               (cleanBody ? `<div style="font-size:13.5px;color:#B8C0CC;white-space:pre-wrap;line-height:1.5;margin-bottom:18px">${renderRich(cleanBody)}</div>` : '');
      })()}
      ${commentsHTML}
      <div style="margin-top:16px">
        <textarea id="dm-t-reply" placeholder="Escrever uma resposta…" rows="3" style="width:100%;padding:11px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box;margin-bottom:8px"></textarea>
        <div id="dm-t-attach-preview" style="display:none;align-items:center;gap:8px;margin-bottom:8px;padding:8px 10px;background:#181D26;border:1px solid rgba(255,255,255,0.08);border-radius:9px">
          <span style="font-size:12.5px;color:#8B95A5;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" id="dm-t-attach-name"></span>
          <button id="dm-t-attach-remove" style="background:none;border:none;color:#5C6576;font-size:16px;cursor:pointer;line-height:1">×</button>
        </div>
        <div style="display:flex;gap:8px">
          <input type="file" id="dm-t-file" accept="image/*,.pdf,.doc,.docx,.txt" style="display:none">
          <button id="dm-t-attach-btn" title="Anexar ficheiro" style="width:44px;flex-shrink:0;padding:12px 0;border:1px solid rgba(255,255,255,0.08);border-radius:9px;background:#181D26;color:#8B95A5;font-size:16px;cursor:pointer">📎</button>
          <button id="dm-t-send" style="flex:1;padding:12px;border:none;border-radius:9px;background:#D2A13A;color:#1a1305;font-weight:700;font-size:13.5px;cursor:pointer;font-family:inherit">Responder</button>
        </div>
        <div id="dm-t-detail-msg" style="margin-top:8px;font-size:12px;text-align:center;min-height:15px"></div>
      </div>`;

    let selectedStatus = t.status;
    let statusChanged = false;

    function paintStatusButtons(){
      body.querySelectorAll('.dm-t-status-btn').forEach(b => {
        const s = b.dataset.s;
        const active = s === selectedStatus;
        b.style.border = '1px solid ' + (active ? STATUS_COLOR[s] : 'rgba(255,255,255,0.08)');
        b.style.background = active ? STATUS_COLOR[s]+'22' : '#181D26';
        b.style.color = active ? STATUS_COLOR[s] : '#8B95A5';
      });
    }

    body.querySelectorAll('.dm-t-status-btn').forEach(btn => {
      btn.onclick = () => {
        selectedStatus = btn.dataset.s;
        statusChanged = (selectedStatus !== t.status);
        paintStatusButtons();
      };
    });

    document.getElementById('dm-t-category').onchange = async (e) => {
      const val = e.target.value;
      e.target.disabled = true;
      const res = val
        ? await api('setCategory', { number, category: val }, 'POST')
        : { ok: true }; // "Sem categoria" — não há ação de remover; fica como está no GitHub
      e.target.disabled = false;
      if (!res.ok) document.getElementById('dm-t-detail-msg').textContent = 'Erro: ' + (res.error||'desconhecido');
    };

    pendingFile = null;
    const fileInput   = document.getElementById('dm-t-file');
    const attachBtn   = document.getElementById('dm-t-attach-btn');
    const preview     = document.getElementById('dm-t-attach-preview');
    const previewName = document.getElementById('dm-t-attach-name');

    attachBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const f = fileInput.files[0];
      if (!f) return;
      if (f.size > 1500000) {
        document.getElementById('dm-t-detail-msg').textContent = 'Ficheiro demasiado grande (máx. ~1,4 MB).';
        fileInput.value = '';
        return;
      }
      pendingFile = f;
      previewName.textContent = '📎 ' + f.name;
      preview.style.display = 'flex';
    };
    document.getElementById('dm-t-attach-remove').onclick = () => {
      pendingFile = null; fileInput.value = ''; preview.style.display = 'none';
    };

    document.getElementById('dm-t-send').onclick = async () => {
      const btn = document.getElementById('dm-t-send');
      const ta  = document.getElementById('dm-t-reply');
      const msg = document.getElementById('dm-t-detail-msg');
      let val = ta.value.trim();

      if (!val && !pendingFile && !statusChanged) { msg.style.color = '#FF6B5E'; msg.textContent = 'Escreve algo, anexa um ficheiro ou muda o estado.'; return; }

      btn.disabled = true; attachBtn.disabled = true;

      if (pendingFile) {
        btn.textContent = 'A enviar anexo...';
        const b64 = await readFileAsBase64(pendingFile);
        const up = await apiUpload(number, pendingFile.name, pendingFile.type, b64);
        if (!up.ok) {
          btn.disabled = false; attachBtn.disabled = false; btn.textContent = 'Responder';
          msg.style.color = '#FF6B5E'; msg.textContent = 'Erro no anexo: ' + (up.error||'desconhecido');
          return;
        }
        val = val ? val + '\n\n' + up.markdown : up.markdown;
      }

      btn.textContent = 'A enviar...';
      const params = { number, body: val };
      if (statusChanged) params.status = selectedStatus;
      const res = await api('addComment', params, 'POST');
      btn.disabled = false; attachBtn.disabled = false; btn.textContent = 'Responder';
      if (res.ok) { renderDetail(number); }
      else { msg.style.color = '#FF6B5E'; msg.textContent = 'Erro: ' + (res.error||'desconhecido'); }
    };
  }

  // ── Novo ticket ──
  function renderNew(){
    screen = 'new';
    setChrome({ title:'Novo ticket', back:true, showNew:false });
    const body = document.getElementById('dm-t-body');
    body.innerHTML = `
      <input id="dm-t-new-title" placeholder="Título (ex: Botão de atualizar não funciona)" style="width:100%;padding:11px;margin-bottom:10px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:14px;font-family:inherit;box-sizing:border-box">
      <select id="dm-t-new-category" style="width:100%;padding:11px;margin-bottom:10px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:14px;font-family:inherit">
        <option value="">Sem categoria</option>
        ${CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
      </select>
      <textarea id="dm-t-new-body" placeholder="Descreve o que aconteceu ou o que gostavas de ver (opcional)" rows="5" style="width:100%;padding:11px;margin-bottom:10px;border-radius:9px;border:1px solid rgba(255,255,255,0.08);background:#181D26;color:#F2F4F7;font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box"></textarea>
      <div id="dm-t-new-attach-preview" style="display:none;align-items:center;gap:8px;margin-bottom:10px;padding:8px 10px;background:#181D26;border:1px solid rgba(255,255,255,0.08);border-radius:9px">
        <span style="font-size:12.5px;color:#8B95A5;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" id="dm-t-new-attach-name"></span>
        <button id="dm-t-new-attach-remove" style="background:none;border:none;color:#5C6576;font-size:16px;cursor:pointer;line-height:1">×</button>
      </div>
      <div style="display:flex;gap:8px">
        <input type="file" id="dm-t-new-file" accept="image/*,.pdf,.doc,.docx,.txt" style="display:none">
        <button id="dm-t-new-attach-btn" title="Anexar ficheiro" style="width:44px;flex-shrink:0;padding:12px 0;border:1px solid rgba(255,255,255,0.08);border-radius:9px;background:#181D26;color:#8B95A5;font-size:16px;cursor:pointer">📎</button>
        <button id="dm-t-new-send" style="flex:1;padding:13px;border:none;border-radius:9px;background:#D2A13A;color:#1a1305;font-weight:700;font-size:14px;cursor:pointer;font-family:inherit">Criar ticket</button>
      </div>
      <div id="dm-t-new-msg" style="margin-top:10px;font-size:12.5px;text-align:center;min-height:16px"></div>`;

    let pendingNewFile = null;
    const fileInput   = document.getElementById('dm-t-new-file');
    const attachBtn   = document.getElementById('dm-t-new-attach-btn');
    const preview     = document.getElementById('dm-t-new-attach-preview');
    const previewName = document.getElementById('dm-t-new-attach-name');
    const msg         = document.getElementById('dm-t-new-msg');

    attachBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => {
      const f = fileInput.files[0];
      if (!f) return;
      if (f.size > 1500000) { msg.textContent = 'Ficheiro demasiado grande (máx. ~1,4 MB).'; fileInput.value = ''; return; }
      pendingNewFile = f;
      previewName.textContent = '📎 ' + f.name;
      preview.style.display = 'flex';
    };
    document.getElementById('dm-t-new-attach-remove').onclick = () => {
      pendingNewFile = null; fileInput.value = ''; preview.style.display = 'none';
    };

    document.getElementById('dm-t-new-send').onclick = async () => {
      const title    = document.getElementById('dm-t-new-title').value.trim();
      const desc     = document.getElementById('dm-t-new-body').value.trim();
      const category = document.getElementById('dm-t-new-category').value;
      const btn = document.getElementById('dm-t-new-send');
      if (!title) { msg.style.color = '#FF6B5E'; msg.textContent = 'Escreve pelo menos um título.'; return; }
      btn.disabled = true; attachBtn.disabled = true; btn.textContent = 'A criar...';

      const res = await api('submitTicket', { title, body: desc, category }, 'POST');
      if (!res.ok) {
        btn.disabled = false; attachBtn.disabled = false; btn.textContent = 'Criar ticket';
        msg.style.color = '#FF6B5E'; msg.textContent = 'Erro: ' + (res.error||'desconhecido');
        return;
      }

      if (pendingNewFile) {
        btn.textContent = 'A enviar anexo...';
        const b64 = await readFileAsBase64(pendingNewFile);
        const up = await apiUpload(res.number, pendingNewFile.name, pendingNewFile.type, b64);
        if (up.ok) {
          await api('addComment', { number: res.number, body: up.markdown }, 'POST');
        } else {
          msg.style.color = '#FF6B5E'; msg.textContent = 'Ticket criado, mas o anexo falhou: ' + (up.error||'desconhecido');
        }
      }

      renderDetail(res.number);
    };
  }

  return { open, close, refreshBadge, openTicket };
})();
